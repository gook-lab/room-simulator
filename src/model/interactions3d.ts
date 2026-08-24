import { catalogById } from './catalog';
import type { Opening, PlacedItem, Plan } from './types';

/** 조명 기구인가 (전원 토글 시 광원 on/off) */
export function isLightItem(catalogId: string): boolean {
  const shape = catalogById.get(catalogId)?.shape;
  return shape === 'floor-lamp' || shape === 'pendant-lamp';
}

/** TV인가 (전원 토글 시 화면 발광 on/off) */
export function isTvItem(catalogId: string): boolean {
  return catalogById.get(catalogId)?.shape === 'tv';
}

/** 워크스루에서 상호작용(클릭) 가능한 아이템인가 — 조명·TV */
export function isInteractiveItem(catalogId: string): boolean {
  return isLightItem(catalogId) || isTvItem(catalogId);
}

/** 전원 상태 — undefined 는 켜짐(기본) */
export function isPowered(item: Pick<PlacedItem, 'powered'>): boolean {
  return item.powered !== false;
}

/**
 * 조명·TV 전원 토글. 대상이 아니거나 없는 아이템이면 plan 을 그대로 반환한다.
 * (updatePlan commit 경로로 호출 → 명령 단위 undo 대상)
 */
export function togglePower(plan: Plan, itemId: string): Plan {
  const item = plan.items.find((i) => i.id === itemId);
  if (!item || !isInteractiveItem(item.catalogId)) return plan;
  return {
    ...plan,
    items: plan.items.map((i) =>
      i.id === itemId ? { ...i, powered: !isPowered(i) } : i,
    ),
  };
}

/** 문 개폐 상태 — undefined 는 열림(기본) */
export function isDoorOpen(opening: Pick<Opening, 'open'>): boolean {
  return opening.open !== false;
}

/**
 * 문 개폐 토글. 문이 아니거나 없는 개구부면 plan 을 그대로 반환한다.
 * 상태는 벽 충돌(collisionSpans)과 3D 문짝 스윙에 반영된다.
 */
export function toggleDoor(plan: Plan, openingId: string): Plan {
  const opening = plan.openings.find((o) => o.id === openingId);
  if (!opening || opening.kind !== 'door') return plan;
  return {
    ...plan,
    openings: plan.openings.map((o) =>
      o.id === openingId ? { ...o, open: !isDoorOpen(o) } : o,
    ),
  };
}
