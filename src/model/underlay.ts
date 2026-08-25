import type { Plan, Room, Tracing, Vec2, Wall } from './types';

/**
 * 업로드 언더레이(밑그림) 헬퍼 — "넣는 대로 즉시 로드" 경로의 순수 계산.
 *
 * 업로드하면 도면 이미지는 스케일 추정치(기본 폭 10m)로 곧바로 에디터에
 * 깔리고, 스케일 보정·벽 자동 인식은 에디터 안의 선택 기능이다.
 */

/** 업로드 기본 가정: 도면 이미지 폭 ≈ 10m */
export const DEFAULT_UNDERLAY_WIDTH_M = 10;

/** 이미지 종횡비로 언더레이 실세계 크기 산출 */
export function underlaySize(
  naturalW: number,
  naturalH: number,
  widthM: number = DEFAULT_UNDERLAY_WIDTH_M,
): { widthM: number; heightM: number } {
  const ratio = naturalW > 0 ? naturalH / naturalW : 1;
  return { widthM, heightM: Number((widthM * ratio).toFixed(3)) };
}

/** 언더레이 크기만 리스케일 */
export function rescaleTracing(tracing: Tracing, factor: number): Tracing {
  if (!Number.isFinite(factor) || factor <= 0) return tracing;
  return {
    ...tracing,
    widthM: Number(((tracing.widthM ?? 0) * factor).toFixed(4)),
    heightM: Number(((tracing.heightM ?? 0) * factor).toFixed(4)),
  };
}

/**
 * 스케일 보정: 문서 지오메트리 전체를 원점 기준 리스케일.
 * 벽·방(자동 인식분 포함)이 언더레이에서 파생되므로 함께 배율되어야 정합이
 * 유지된다. **가구 크기는 실물 치수라 불변** — 위치만 배율. 개구부/벽 부착의
 * t(0..1)·부착 높이는 상대/절대 값이라 그대로 둔다.
 */
export function rescalePlanGeometry(plan: Plan, factor: number): Plan {
  if (!Number.isFinite(factor) || factor <= 0) return plan;
  const sv = (v: number) => Number((v * factor).toFixed(4));
  const sp = (p: Vec2): Vec2 => ({ x: sv(p.x), y: sv(p.y) });
  return {
    ...plan,
    tracing: plan.tracing ? rescaleTracing(plan.tracing, factor) : plan.tracing,
    walls: plan.walls.map((w) => ({ ...w, a: sp(w.a), b: sp(w.b) })),
    rooms: plan.rooms.map((r) => ({
      ...r,
      polygon: r.polygon.map(sp),
      areaSqm: Number((r.areaSqm * factor * factor).toFixed(2)),
    })),
    items: plan.items.map((i) => ({ ...i, position: sp(i.position) })),
    dimensions: (plan.dimensions ?? []).map((d) => ({ ...d, a: sp(d.a), b: sp(d.b) })),
  };
}

/**
 * 벽 자동 인식 결과(검출 캔버스 px 좌표) → 월드 벽 목록.
 * 검출 캔버스는 이미지 종횡비 그대로(레터박스 없음)이므로 단순 비례 변환.
 */
/**
 * 닫힌 영역 검출 결과(검출 캔버스 px) → 방 목록 (best-effort).
 * 폴리곤은 bbox 직사각 근사, 면적은 실제 채움 셀 기반(px²→㎡ 환산)이라
 * L자형도 면적은 과대평가되지 않는다.
 */
export function regionsToRooms(
  regions: {
    min: Vec2;
    max: Vec2;
    areaCells: number;
    cellPx: number;
    polygon?: Vec2[];
  }[],
  srcW: number,
  srcH: number,
  widthM: number,
  heightM: number,
  makeId: () => string,
): Room[] {
  const sx = widthM / srcW;
  const sy = heightM / srcH;
  const sp = (p: Vec2): Vec2 => ({
    x: Number((p.x * sx).toFixed(3)),
    y: Number((p.y * sy).toFixed(3)),
  });
  return regions.map((r, i) => {
    const min = sp(r.min);
    const max = sp(r.max);
    const areaSqm = Number((r.areaCells * r.cellPx * r.cellPx * sx * sy).toFixed(2));
    // 직교 윤곽 폴리곤(L자 지원) 우선, 없으면 bbox 폴백
    const polygon =
      r.polygon && r.polygon.length >= 4
        ? r.polygon.map(sp)
        : [
            { x: min.x, y: min.y },
            { x: max.x, y: min.y },
            { x: max.x, y: max.y },
            { x: min.x, y: max.y },
          ];
    return {
      id: makeId(),
      name: `공간 ${i + 1}`,
      wallIds: [],
      polygon,
      areaSqm,
      floor: 'living' as const,
    };
  });
}

export function linesToWalls(
  lines: { points: Vec2[] }[],
  srcW: number,
  srcH: number,
  widthM: number,
  heightM: number,
  makeId: () => string,
  thickness = 0.15,
): Wall[] {
  const toWorld = (p: Vec2): Vec2 => ({
    x: Number(((p.x / srcW) * widthM).toFixed(3)),
    y: Number(((p.y / srcH) * heightM).toFixed(3)),
  });
  const walls: Wall[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.points.length - 1; i++) {
      walls.push({
        id: makeId(),
        a: toWorld(line.points[i]),
        b: toWorld(line.points[i + 1]),
        thickness,
        height: 2.4,
      });
    }
  }
  return walls;
}

/** 외곽 폴리곤(검출 캔버스 px) → 닫힌 외곽 벽 목록 (문·창 구간 포함 연속) */
export function outlineToWalls(
  polygon: Vec2[],
  srcW: number,
  srcH: number,
  widthM: number,
  heightM: number,
  makeId: () => string,
  thickness = 0.2,
): Wall[] {
  if (polygon.length < 3) return [];
  const toWorld = (p: Vec2): Vec2 => ({
    x: Number(((p.x / srcW) * widthM).toFixed(3)),
    y: Number(((p.y / srcH) * heightM).toFixed(3)),
  });
  return polygon.map((p, i) => ({
    id: makeId(),
    a: toWorld(p),
    b: toWorld(polygon[(i + 1) % polygon.length]),
    thickness,
    height: 2.4,
  }));
}

/**
 * 월드 공간 벽 정리 — "미로" 인상 해소.
 * 1) 동일 직선상(축 위치 axisTol 이내) 인접/겹침 세그먼트를 gapMax 까지 병합
 * 2) 짧은 고립 토막(minLen 미만 + 양끝 모두 다른 벽과 joinTol 이내 미접합) 폐기
 * 축 정렬이 아닌 벽은 그대로 둔다.
 */
export function consolidateWalls(
  walls: Wall[],
  opts: { axisTol: number; gapMax: number; minLen: number; joinTol: number },
): Wall[] {
  const EPS = 1e-6;
  const horiz = walls.filter((w) => Math.abs(w.a.y - w.b.y) < EPS);
  const vert = walls.filter((w) => Math.abs(w.a.x - w.b.x) < EPS && Math.abs(w.a.y - w.b.y) >= EPS);
  const other = walls.filter(
    (w) => Math.abs(w.a.y - w.b.y) >= EPS && Math.abs(w.a.x - w.b.x) >= EPS,
  );

  const mergeAxis = (
    list: Wall[],
    at: (w: Wall) => number,
    from: (w: Wall) => number,
    to: (w: Wall) => number,
    make: (atV: number, f: number, t: number, proto: Wall) => Wall,
  ): Wall[] => {
    const sorted = [...list].sort((a, b) => at(a) - at(b) || Math.min(from(a), to(a)) - Math.min(from(b), to(b)));
    const used = new Array(sorted.length).fill(false);
    const out: Wall[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      let atSum = at(sorted[i]);
      let cnt = 1;
      let f = Math.min(from(sorted[i]), to(sorted[i]));
      let t = Math.max(from(sorted[i]), to(sorted[i]));
      let proto = sorted[i];
      let merged = true;
      while (merged) {
        merged = false;
        for (let j = 0; j < sorted.length; j++) {
          if (used[j]) continue;
          if (Math.abs(at(sorted[j]) - atSum / cnt) > opts.axisTol) continue;
          const jf = Math.min(from(sorted[j]), to(sorted[j]));
          const jt = Math.max(from(sorted[j]), to(sorted[j]));
          if (jf - t <= opts.gapMax && f - jt <= opts.gapMax) {
            f = Math.min(f, jf);
            t = Math.max(t, jt);
            atSum += at(sorted[j]);
            cnt++;
            if (sorted[j].thickness > proto.thickness) proto = sorted[j];
            used[j] = true;
            merged = true;
          }
        }
      }
      out.push(make(Number((atSum / cnt).toFixed(3)), f, t, proto));
    }
    return out;
  };

  let result = [
    ...mergeAxis(
      horiz,
      (w) => w.a.y,
      (w) => w.a.x,
      (w) => w.b.x,
      (y, f, t, proto) => ({ ...proto, a: { x: f, y }, b: { x: t, y } }),
    ),
    ...mergeAxis(
      vert,
      (w) => w.a.x,
      (w) => w.a.y,
      (w) => w.b.y,
      (x, f, t, proto) => ({ ...proto, a: { x, y: f }, b: { x, y: t } }),
    ),
    ...other,
  ];

  // 짧은 고립 토막 폐기
  const near = (p: Vec2, w: Wall): boolean => {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len2 = dx * dx + dy * dy;
    const tt = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len2));
    return Math.hypot(w.a.x + dx * tt - p.x, w.a.y + dy * tt - p.y) <= opts.joinTol;
  };
  result = result.filter((w) => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (len >= opts.minLen) return true;
    const others = result.filter((o) => o !== w);
    const aJoined = others.some((o) => near(w.a, o));
    const bJoined = others.some((o) => near(w.b, o));
    return aJoined && bJoined; // 양끝이 이어진 짧은 벽만 유지
  });
  return result;
}

/**
 * 자동 인식 결과 → 벽·방 지오메트리 (업로드·패널 재실행 공용).
 * 외곽 폴리곤은 외벽(0.2m)으로, 내부 선분은 내벽(0.15m)으로 만들고
 * 월드 공간에서 병합·고아 토막 정리까지 수행한다.
 */
export function buildAutoGeometry(
  trace: {
    lines: { points: Vec2[] }[];
    outline: Vec2[];
    regions: Parameters<typeof regionsToRooms>[0];
  },
  srcW: number,
  srcH: number,
  widthM: number,
  heightM: number,
  makeId: () => string,
): { walls: Wall[]; rooms: Room[] } {
  const interior = linesToWalls(trace.lines, srcW, srcH, widthM, heightM, makeId, 0.15);
  const outline = outlineToWalls(trace.outline, srcW, srcH, widthM, heightM, makeId, 0.2);
  const walls = consolidateWalls([...outline, ...interior], {
    axisTol: 0.08,
    gapMax: 0.8,
    minLen: 0.4,
    joinTol: 0.2,
  });
  const rooms = regionsToRooms(trace.regions, srcW, srcH, widthM, heightM, makeId);
  return { walls, rooms };
}
