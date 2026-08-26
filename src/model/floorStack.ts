import type { Plan, Vec2 } from './types';

export const DEFAULT_FLOOR_HEIGHT = 2.4;

/**
 * 같은 건물(buildingId)의 층 목록 — floorLabel 숫자 정렬 (FloorTabs 와 동일 규칙).
 * 건물 연결이 없는 문서는 자기 자신 하나.
 */
export function floorsOfBuilding(plans: Record<string, Plan>, plan: Plan): Plan[] {
  if (!plan.buildingId) return [plan];
  return Object.values(plans)
    .filter((p) => p.buildingId === plan.buildingId)
    .sort((a, b) =>
      (a.floorLabel ?? '').localeCompare(b.floorLabel ?? '', 'ko', { numeric: true }),
    );
}

/** 층의 3D 바닥 y 오프셋 = 아래층들의 층고(defaultWallHeight) 합 */
export function floorBaseY(floors: Plan[], planId: string): number {
  let y = 0;
  for (const f of floors) {
    if (f.id === planId) return y;
    y += f.defaultWallHeight ?? DEFAULT_FLOOR_HEIGHT;
  }
  return y;
}

/**
 * 문서 전체 평행이동 — 층 정렬용. rescalePlanGeometry 와 같은 범위:
 * 벽·룸 폴리곤·가구 위치·치수 주석에 더해 밑그림 오프셋도 함께 이동
 * (벽 부착물은 wallId 좌표계라 벽을 따라간다).
 */
export function translatePlanGeometry(plan: Plan, d: Vec2): Plan {
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y) || (d.x === 0 && d.y === 0)) return plan;
  const tv = (v: number, dv: number) => Number((v + dv).toFixed(4));
  const tp = (p: Vec2): Vec2 => ({ x: tv(p.x, d.x), y: tv(p.y, d.y) });
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, a: tp(w.a), b: tp(w.b) })),
    rooms: plan.rooms.map((r) => ({ ...r, polygon: r.polygon.map(tp) })),
    items: plan.items.map((i) => ({ ...i, position: tp(i.position) })),
    dimensions: (plan.dimensions ?? []).map((dm) => ({ ...dm, a: tp(dm.a), b: tp(dm.b) })),
    tracing: plan.tracing
      ? { ...plan.tracing, offset: tp(plan.tracing.offset ?? { x: 0, y: 0 }) }
      : plan.tracing,
  };
}

/** 벽 끝점 bbox 중심 — 벽이 없으면 null */
export function wallsCenter(plan: Plan): Vec2 | null {
  const xs = plan.walls.flatMap((w) => [w.a.x, w.b.x]);
  const ys = plan.walls.flatMap((w) => [w.a.y, w.b.y]);
  if (xs.length === 0) return null;
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/** 아래층에 맞추기 위한 자동 정렬 오프셋 (벽 bbox 중심 맞춤) — 계산 불가면 null */
export function autoAlignOffset(current: Plan, below: Plan): Vec2 | null {
  const a = wallsCenter(current);
  const b = wallsCenter(below);
  if (!a || !b) return null;
  return { x: Number((b.x - a.x).toFixed(4)), y: Number((b.y - a.y).toFixed(4)) };
}
