import { catalogById } from './catalog';
import type { PlacedItem, Plan } from './types';

/** 워크스루에서 상호작용(클릭) 가능한 사물인가 — 현재는 조명 기구 */
export function isLightItem(catalogId: string): boolean {
  const shape = catalogById.get(catalogId)?.shape;
  return shape === 'floor-lamp' || shape === 'pendant-lamp';
}

export function isInteractiveItem(catalogId: string): boolean {
  return isLightItem(catalogId);
}

/** 전원 상태 — undefined 는 켜짐(기본) */
export function isPowered(item: Pick<PlacedItem, 'powered'>): boolean {
  return item.powered !== false;
}

/**
 * 조명 전원 토글. 조명이 아니거나 없는 아이템이면 plan 을 그대로 반환한다.
 * (updatePlan commit 경로로 호출 → 명령 단위 undo 대상)
 */
export function togglePower(plan: Plan, itemId: string): Plan {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item || !isLightItem(item.catalogId)) return plan;
  return {
    ...plan,
    items: plan.items.map((i) =>
      i.id === itemId ? { ...i, powered: !isPowered(i) } : i,
    ),
  };
}
