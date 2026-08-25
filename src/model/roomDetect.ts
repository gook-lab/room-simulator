import type { Plan, Room, Vec2 } from './types';
import { planBounds, pointInPolygon, roomAt } from './geometry';
import {
  detectEnclosedRegions,
  rasterizeSegments,
} from '../features/upload/wallDetect';

/**
 * 수동으로 그린 벽에서 닫힌 공간을 찾아 방을 생성한다 — "기존 벽 조합
 * topology" 보류 항목의 해소. 업로드 자동 인식과 같은 순수 코어
 * (rasterize + flood + 직교 폴리곤 추출)를 벽 좌표에 직접 적용한다.
 *
 * - 격자 5cm, 벽 스트로크는 벽 반두께 기준 — 개구부는 벽이 관통하므로 새지 않음
 * - 기존 방과 겹치는 영역은 스킵 (영역 중심이 기존 방 안, 또는 그 반대)
 * - 폴리곤은 직교 윤곽(L자 지원), 면적은 실채움 셀 기반
 */
const CELL_M = 0.05;
const MIN_ROOM_SQM = 1.0;
const MAX_GRID_CELLS = 4_000_000;

export function detectRoomsFromWalls(
  plan: Plan,
  makeId: () => string,
): Room[] {
  if (plan.walls.length === 0) return [];
  const b = planBounds(plan);
  const margin = 0.3;
  const ox = b.min.x - margin;
  const oy = b.min.y - margin;
  const w = Math.ceil((b.max.x - b.min.x + margin * 2) / CELL_M);
  const h = Math.ceil((b.max.y - b.min.y + margin * 2) / CELL_M);
  if (w <= 0 || h <= 0 || w * h > MAX_GRID_CELLS) return [];

  const toGrid = (p: Vec2): Vec2 => ({ x: (p.x - ox) / CELL_M, y: (p.y - oy) / CELL_M });
  const lines = plan.walls.map((wl) => ({
    points: [toGrid(wl.a), toGrid(wl.b)],
    closed: false,
  }));
  const thick = Math.max(1, Math.round(0.075 / CELL_M));
  const mask = rasterizeSegments(lines, w, h, thick);
  const regions = detectEnclosedRegions(
    mask,
    w,
    h,
    Math.round(MIN_ROOM_SQM / (CELL_M * CELL_M)),
    { polygonTol: Math.round(0.12 / CELL_M) },
  );

  const toWorld = (p: Vec2): Vec2 => ({
    x: Number((p.x * CELL_M + ox).toFixed(3)),
    y: Number((p.y * CELL_M + oy).toFixed(3)),
  });
  const out: Room[] = [];
  let n = plan.rooms.length;
  for (const r of regions) {
    const gridPoly =
      r.polygon ??
      [
        { x: r.min.x, y: r.min.y },
        { x: r.max.x + 1, y: r.min.y },
        { x: r.max.x + 1, y: r.max.y + 1 },
        { x: r.min.x, y: r.max.y + 1 },
      ];
    const polygon = gridPoly.map(toWorld);
    const centroid = polygon.reduce(
      (acc, p) => ({ x: acc.x + p.x / polygon.length, y: acc.y + p.y / polygon.length }),
      { x: 0, y: 0 },
    );
    // 기존 방과 중복 스킵 (양방향 포함 검사)
    if (roomAt(plan.rooms, centroid)) continue;
    const overlapsExisting = plan.rooms.some((ex) => {
      const exC = ex.polygon.reduce(
        (acc, p) => ({ x: acc.x + p.x / ex.polygon.length, y: acc.y + p.y / ex.polygon.length }),
        { x: 0, y: 0 },
      );
      return pointInPolygon(exC, polygon);
    });
    if (overlapsExisting) continue;
    out.push({
      id: makeId(),
      name: `방 ${++n}`,
      wallIds: [],
      polygon,
      areaSqm: Number((r.areaCells * CELL_M * CELL_M).toFixed(2)),
      floor: 'living',
    });
  }
  return out;
}
