import type { Plan } from './types';

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
