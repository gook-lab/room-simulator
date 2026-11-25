import { describe, expect, it } from 'vitest';
import type { Vec2, Wall } from '../src/model/types';
import { traceRaster } from '../src/features/upload/autoTrace';
import {
  ORTHO_SNAP_DEG,
  joinLineEnds,
  simplifyLoop,
  snapPolygonToCenterlines,
} from '../src/features/upload/orthoSnap';
import { closeOutline, traceRegionPolygon } from '../src/features/upload/wallDetect';
import { buildAutoGeometry, underlaySize } from '../src/model/underlay';
import { rasterPlan, strokeBand, type Shape } from './rasterPlan';

/**
 * 업로드 벽 인식 직교화 (45차 QA B-01).
 * 업로드 화면과 같은 경로: 780px 폭 종이에 이미지를 맞춰 그린 픽셀 → traceRaster →
 * buildAutoGeometry. 캔버스 대신 rasterPlan 이 픽셀 배열을 만든다.
 */

const R = (x0: number, y0: number, x1: number, y1: number, lum = 0): Shape => ({ rect: [x0, y0, x1, y1], lum });

function upload(shapes: Shape[], srcW: number, srcH: number, knownWidthM?: number) {
  const paperW = 780;
  const paperH = Math.round((paperW * srcH) / srcW);
  const data = rasterPlan(paperW, paperH, shapes, paperW / srcW);
  const trace = traceRaster(data, paperW, paperH, { top: 0, height: paperH }, knownWidthM ? { knownWidthM } : undefined);
  const size = underlaySize(srcW, srcH, knownWidthM ?? (trace.suggestedWidthM || 10));
  let n = 0;
  return buildAutoGeometry(trace, paperW, paperH, size.widthM, size.heightM, () => `t${n++}-ad${n}`);
}

/** 끝점 좌표 차이 기준 기울기(m) — 수평·수직 중 가까운 쪽 */
const tiltOf = (w: Wall) => Math.min(Math.abs(w.a.x - w.b.x), Math.abs(w.a.y - w.b.y));

const distToSegment = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
};

/** 벽 끝마다 다른 벽 중심선까지의 거리 중 최댓값(m) — T자 · 모서리 틈 */
const worstJunctionGap = (walls: Wall[]) =>
  Math.max(
    ...walls.flatMap((w) =>
      [w.a, w.b].map((p) => Math.min(...walls.filter((o) => o !== w).map((o) => distToSegment(p, o.a, o.b)))),
    ),
  );

/** 같은 직선 위에서 맞닿거나 겹치는 벽 쌍 수 — 한 벽이 쪼개진 흔적 */
const splitPairs = (walls: Wall[]) => {
  let n = 0;
  const axis = (w: Wall) => (Math.abs(w.a.y - w.b.y) <= 0.01 ? 'h' : Math.abs(w.a.x - w.b.x) <= 0.01 ? 'v' : 'd');
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i];
      const b = walls[j];
      const ax = axis(a);
      if (ax === 'd' || ax !== axis(b)) continue;
      const at = (w: Wall) => (ax === 'h' ? w.a.y : w.a.x);
      const span = (w: Wall): [number, number] =>
        ax === 'h' ? [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x)] : [Math.min(w.a.y, w.b.y), Math.max(w.a.y, w.b.y)];
      if (Math.abs(at(a) - at(b)) > 0.02) continue;
      const [a0, a1] = span(a);
      const [b0, b1] = span(b);
      if (Math.max(a0, b0) - Math.min(a1, b1) <= 0.05) n++;
    }
  }
  return n;
};

const isOrthogonal = (poly: Vec2[]) =>
  poly.every((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.abs(p.x - q.x) < 1e-9 || Math.abs(p.y - q.y) < 1e-9;
  });

/** QA 재현 PNG(1200×800, 벽 14px) — 사각 외곽 + 가운데 세로벽 + 오른쪽 가로벽 */
const QA_PLAN: Shape[] = [
  R(100, 100, 1101, 114),
  R(100, 687, 1101, 701),
  R(100, 100, 114, 701),
  R(1087, 100, 1101, 701),
  R(594, 100, 608, 701),
  R(600, 394, 1101, 408),
];

/** 번들 샘플 도면(UploadTrace SAMPLE_SVG, 780×560) — 연한 주방 구획선은 벽 밝기 임계 밖 */
const lumOf = (hex: number) => ((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114;
const SAMPLE_PLAN: Shape[] = [
  R(138, 78, 702, 82, lumOf(0x6e6a63)),
  R(138, 478, 702, 482, lumOf(0x6e6a63)),
  R(138, 78, 142, 482, lumOf(0x6e6a63)),
  R(698, 78, 702, 482, lumOf(0x6e6a63)),
  R(418, 80, 422, 480, lumOf(0x6e6a63)),
  R(420, 268, 700, 272, lumOf(0x6e6a63)),
  R(420, 368.5, 700, 371.5, lumOf(0x9a968e)),
];

describe('업로드 인식 — 직교 입력은 반듯한 벽으로 (QA B-01)', () => {
  it('QA 사각 도면: 벽 6개 전부 수평·수직(기울기 1cm 이하), 쪼개짐 없음, T자 · 모서리 틈 2cm 이하', () => {
    const { walls, rooms } = upload(QA_PLAN, 1200, 800);
    expect(walls).toHaveLength(6); // 외벽 4 + 내벽 2 (전에는 기운 외벽 7조각 + 내벽 2)
    for (const w of walls) expect(tiltOf(w)).toBeLessThanOrEqual(0.01);
    expect(splitPairs(walls)).toBe(0);
    expect(worstJunctionGap(walls)).toBeLessThanOrEqual(0.02);
    expect(rooms).toHaveLength(3);
    for (const r of rooms) expect(isOrthogonal(r.polygon)).toBe(true);
    // 벽 안쪽 면 기준 기대 면적: 46.4 · 22.6 · 22.3㎡ (벽 두께 0.18m)
    const areas = rooms.map((r) => r.areaSqm).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(46.4, 0);
    expect(areas[1]).toBeCloseTo(22.6, 0);
    expect(areas[2]).toBeCloseTo(22.3, 0);
  });

  it('번들 샘플 도면: 같은 기준, 방 3 · 문 0 유지', () => {
    const { walls, rooms, openings } = upload(SAMPLE_PLAN, 780, 560, 10.9);
    expect(walls).toHaveLength(6);
    for (const w of walls) expect(tiltOf(w)).toBeLessThanOrEqual(0.01);
    expect(splitPairs(walls)).toBe(0);
    expect(worstJunctionGap(walls)).toBeLessThanOrEqual(0.02);
    expect(rooms).toHaveLength(3);
    for (const r of rooms) expect(isOrthogonal(r.polygon)).toBe(true);
    expect(openings).toHaveLength(0);
  });

  it('외곽 폐합 · 자동 개구부(33·34차) 유지: 외벽 창 갭 → 창, 내벽 문 갭 → 문, 외곽은 닫힌 루프', () => {
    const T = 6;
    const { walls, openings } = upload(
      [
        R(100, 100, 1100, 100 + T),
        R(100, 700 - T, 1100, 700),
        R(100, 100, 100 + T, 700),
        R(1100 - T, 100, 1100, 330), // 오른쪽 외벽 — 330..370 창 갭
        R(1100 - T, 370, 1100, 700),
        R(600, 100, 600 + T, 400), // 가운데 내벽 — 400..430 문 갭
        R(600, 430, 600 + T, 700),
        R(100, 380, 600, 380 + T),
      ],
      1200,
      800,
    );
    const outer = walls.filter((w) => w.thickness === 0.2);
    expect(outer).toHaveLength(4);
    // 닫힌 루프: 외벽마다 끝점이 다음 외벽 시작점과 같다
    outer.forEach((w, i) => expect(outer[(i + 1) % outer.length].a).toEqual(w.b));
    for (const w of walls) expect(tiltOf(w)).toBeLessThanOrEqual(0.01);
    expect(worstJunctionGap(walls)).toBeLessThanOrEqual(0.02);
    expect(openings.filter((o) => o.kind === 'window')).toHaveLength(1);
    expect(openings.filter((o) => o.kind === 'door')).toHaveLength(1);
    const winWall = walls.find((w) => w.id === openings.find((o) => o.kind === 'window')!.wallId)!;
    expect(winWall.thickness).toBe(0.2); // 창은 외벽 위
  });

  it('45° 사선 모서리: 사선 벽은 사선으로 남고(억지 직교 없음) 나머지는 수평·수직', () => {
    const { walls, rooms } = upload(
      [
        R(100, 100, 800, 112),
        { poly: strokeBand({ x: 800, y: 106 }, { x: 1094, y: 400 }, 12) },
        R(1088, 400, 1100, 700),
        R(100, 688, 1100, 700),
        R(100, 100, 112, 700),
      ],
      1200,
      800,
    );
    const angle = (w: Wall) => (Math.atan2(Math.abs(w.b.y - w.a.y), Math.abs(w.b.x - w.a.x)) * 180) / Math.PI;
    const diagonal = walls.filter((w) => tiltOf(w) > 0.01);
    expect(diagonal).toHaveLength(1);
    expect(angle(diagonal[0])).toBeGreaterThan(43);
    expect(angle(diagonal[0])).toBeLessThan(47);
    expect(walls).toHaveLength(5); // 외벽 5변 (사선 1)
    expect(worstJunctionGap(walls)).toBeLessThanOrEqual(0.02);
    expect(rooms).toHaveLength(1);
    expect(isOrthogonal(rooms[0].polygon)).toBe(false); // 방 윤곽도 사선 변을 가진다
  });
});

describe('직교 보정 코어 (orthoSnap)', () => {
  /** 축에서 살짝 기운 계단 윗변을 가진 사각 루프 */
  const stairTopRect = (rise: number, run: number): Vec2[] => {
    const pts: Vec2[] = [{ x: 0, y: 0 }];
    let x = 0;
    let y = 0;
    while (x < 120) {
      x = Math.min(120, x + run);
      pts.push({ x, y });
      if (x < 120) {
        y += rise;
        pts.push({ x, y });
      }
    }
    pts.push({ x: 120, y: 80 }, { x: 0, y: 80 });
    return pts;
  };

  it(`축에서 ${ORTHO_SNAP_DEG}° 이내로 기운 계단은 수평 변 하나로 편다`, () => {
    const poly = simplifyLoop(stairTopRect(1, 30), 4); // 약 1.9°
    expect(poly).toHaveLength(4);
    expect(isOrthogonal(poly)).toBe(true);
  });

  it(`${ORTHO_SNAP_DEG}°를 넘는 사선 계단(45°)은 사선 변으로 남긴다`, () => {
    // 오른쪽 위 모서리를 45° 로 깎은 사각형의 셀 계단
    const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 60, y: 0 }];
    for (let k = 0; k < 30; k++) pts.push({ x: 60 + k + 1, y: k }, { x: 60 + k + 1, y: k + 1 });
    pts.push({ x: 90, y: 80 }, { x: 0, y: 80 });
    const poly = simplifyLoop(pts, 4);
    expect(poly).toHaveLength(5);
    const slanted = poly.filter((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.abs(p.x - q.x) > 1e-9 && Math.abs(p.y - q.y) > 1e-9;
    });
    expect(slanted).toHaveLength(1);
  });

  it('traceRegionPolygon: 모서리 · T자 요철이 있는 사각 영역 → 직사각형 4정점(이웃 변이 기울지 않음)', () => {
    // 40×24 사각 + 윗변 두 곳 2셀 돌기 + 오른쪽 변 한 곳 3셀 돌기 (QA 실루엣과 같은 모양)
    const inRegion = (x: number, y: number) =>
      (x >= 2 && x < 42 && y >= 2 && y < 26) ||
      (x >= 2 && x < 6 && y >= 0 && y < 2) ||
      (x >= 20 && x < 24 && y >= 0 && y < 2) ||
      (x >= 42 && x < 45 && y >= 12 && y < 16);
    const poly = traceRegionPolygon(inRegion, { min: { x: 0, y: 0 }, max: { x: 46, y: 28 } }, 8);
    expect(poly).toHaveLength(4);
    expect(isOrthogonal(poly)).toBe(true);
    expect(poly).toEqual(
      expect.arrayContaining([
        { x: 2, y: 2 },
        { x: 42, y: 2 },
        { x: 42, y: 26 },
        { x: 2, y: 26 },
      ]),
    );
  });

  it('closeOutline: 모서리를 넘어선 끝은 수직선 중심까지 줄이고, 모자란 끝은 늘인다', () => {
    const closed = closeOutline(
      [
        { axis: 'h', at: 10, from: 7, to: 52 }, // 왼쪽 3칸 넘침, 오른쪽 2칸 모자람
        { axis: 'v', at: 10, from: 8, to: 40 },
        { axis: 'v', at: 54, from: 8, to: 40 },
      ],
      { cornerSnap: 5, boundaryMargin: 2, boundaryBridge: 10 },
    );
    const h = closed.find((s) => s.axis === 'h')!;
    expect(h.from).toBe(10);
    expect(h.to).toBe(54);
  });

  it('snapPolygonToCenterlines: 실루엣 바깥 면에 있는 변을 같은 벽 중심선으로 옮긴다', () => {
    const outer = [
      { x: 32, y: 32 },
      { x: 358, y: 32 },
      { x: 358, y: 228 },
      { x: 32, y: 228 },
    ];
    const line = (ax: number, ay: number, bx: number, by: number) => ({ points: [{ x: ax, y: ay }, { x: bx, y: by }] });
    const snapped = snapPolygonToCenterlines(
      outer,
      [line(34, 34, 355, 34), line(34, 225, 355, 225), line(34, 34, 34, 225), line(355, 34, 355, 225)],
      6,
    );
    expect(snapped).toEqual([
      { x: 34, y: 34 },
      { x: 355, y: 34 },
      { x: 355, y: 225 },
      { x: 34, y: 225 },
    ]);
  });

  it('joinLineEnds: 내벽 끝이 외곽 변에 못 미치거나 넘치면 교점에 정확히 맞춘다', () => {
    const square: [Vec2, Vec2][] = [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 100, y: 0 }, { x: 100, y: 60 }],
      [{ x: 100, y: 60 }, { x: 0, y: 60 }],
      [{ x: 0, y: 60 }, { x: 0, y: 0 }],
    ];
    const [v, h] = joinLineEnds(
      [
        { points: [{ x: 50, y: -3 }, { x: 50, y: 57 }] }, // 위로 3 넘침, 아래로 3 모자람
        { points: [{ x: 52, y: 30 }, { x: 96, y: 30 }] }, // 세로 내벽에 2 모자람, 외곽에 4 모자람
      ],
      square,
      5,
    );
    expect(v.points).toEqual([{ x: 50, y: 0 }, { x: 50, y: 60 }]);
    expect(h.points).toEqual([{ x: 50, y: 30 }, { x: 100, y: 30 }]);
  });
});
