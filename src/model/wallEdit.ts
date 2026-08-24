import { polygonArea, wallLength } from './geometry';
import type { Plan, Vec2, Wall } from './types';

const EPS = 1e-3;

const samePoint = (a: Vec2, b: Vec2) =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/**
 * 개구부 정리: 벽 길이 변화 후 t 를 재클램프(비율 유지 + 끝 보정).
 * 벽이 개구부 폭보다 짧아지면 그 개구부는 제거한다.
 */
export function reclampOpenings(plan: Plan): Plan {
  let changed = false;
  const openings = plan.openings.filter((o) => {
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) {
      changed = true;
      return false;
    }
    if (wallLength(wall) <= o.width) {
      changed = true;
      return false;
    }
    return true;
  });
  const clamped = openings.map((o) => {
    const wall = plan.walls.find((w) => w.id === o.wallId)!;
    const len = wallLength(wall);
    const half = o.width / 2 / len;
    const t = Math.min(1 - half, Math.max(half, o.t));
    if (t !== o.t) changed = true;
    return t === o.t ? o : { ...o, t };
  });
  return changed ? { ...plan, openings: clamped } : plan;
}

/** 좌표 집합(points)과 일치하는 모든 벽 끝점·룸 폴리곤 꼭짓점을 이동 */
function moveSharedVertices(plan: Plan, moves: { from: Vec2; to: Vec2 }[]): Plan {
  const mapPoint = (p: Vec2): Vec2 => {
    for (const m of moves) {
      if (samePoint(p, m.from)) return { ...m.to };
    }
    return p;
  };
  const walls = plan.walls.map((w) => {
    const a = mapPoint(w.a);
    const b = mapPoint(w.b);
    return a === w.a && b === w.b ? w : { ...w, a, b };
  });
  const rooms = plan.rooms.map((r) => {
    let touched = false;
    const polygon = r.polygon.map((p) => {
      const np = mapPoint(p);
      if (np !== p) touched = true;
      return np;
    });
    return touched ? { ...r, polygon, areaSqm: polygonArea(polygon) } : r;
  });
  return reclampOpenings({ ...plan, walls, rooms });
}

/**
 * 벽 끝점 이동 — 같은 좌표를 공유하는 다른 벽 끝점·룸 폴리곤 꼭짓점도 함께
 * 움직여 접합을 유지한다. 개구부 t 는 비율이 유지되고 끝은 재클램프된다.
 */
export function moveWallVertex(
  plan: Plan,
  wallId: string,
  end: 'a' | 'b',
  to: Vec2,
): Plan {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return plan;
  const from = wall[end];
  if (samePoint(from, to)) return plan;
  return moveSharedVertices(plan, [{ from, to }]);
}

/** 벽 평행 이동 — 양 끝점(과 공유 정점)을 delta 만큼 이동 */
export function translateWall(plan: Plan, wallId: string, delta: Vec2): Plan {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall || (delta.x === 0 && delta.y === 0)) return plan;
  return moveSharedVertices(plan, [
    { from: wall.a, to: { x: wall.a.x + delta.x, y: wall.a.y + delta.y } },
    { from: wall.b, to: { x: wall.b.x + delta.x, y: wall.b.y + delta.y } },
  ]);
}

/** 벽 삭제 — 그 벽의 개구부·벽 부착 아이템도 함께 제거, 룸 wallIds 정리 */
export function deleteWalls(plan: Plan, wallIds: string[]): Plan {
  if (wallIds.length === 0) return plan;
  const ids = new Set(wallIds);
  return {
    ...plan,
    walls: plan.walls.filter((w) => !ids.has(w.id)),
    openings: plan.openings.filter((o) => !ids.has(o.wallId)),
    wallItems: (plan.wallItems ?? []).filter((wi) => !ids.has(wi.wallId)),
    rooms: plan.rooms.map((r) =>
      r.wallIds.some((id) => ids.has(id))
        ? { ...r, wallIds: r.wallIds.filter((id) => !ids.has(id)) }
        : r,
    ),
  };
}

export function isWallId(plan: Plan, id: string): boolean {
  return plan.walls.some((w) => w.id === id);
}

/**
 * 개구부 속성 변경 (문 타입·스윙 방향·폭·삭제).
 * 폭 변경 후에는 t 를 벽 안으로 재클램프하고, 파생(2D 심볼·3D 메시·doorZones·
 * 충돌)은 전부 plan에서 계산되므로 자동 동기된다.
 */
export function updateOpening(
  plan: Plan,
  openingId: string,
  patch: Partial<Pick<Plan['openings'][number], 'doorType' | 'swing' | 'width' | 'open'>>,
): Plan {
  if (!plan.openings.some((o) => o.id === openingId)) return plan;
  const next = {
    ...plan,
    openings: plan.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
  };
  return patch.width != null ? reclampOpenings(next) : next;
}

export function deleteOpening(plan: Plan, openingId: string): Plan {
  if (!plan.openings.some((o) => o.id === openingId)) return plan;
  return { ...plan, openings: plan.openings.filter((o) => o.id !== openingId) };
}

export type { Wall };
