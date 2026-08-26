import type { PlacedItem, Plan, Vec2 } from './types';
import { catalogById } from './catalog';
import { deg2rad, itemCorners, pointInPolygon, polysOverlap } from './geometry';

/**
 * 표면 적층(트리형 부착) — 상판을 가진 가구 위에 소형 아이템(mountable)을 올린다.
 *
 * 계약:
 * - 자식(PlacedItem.parentId)의 position/rotationDeg 는 **월드 좌표 그대로** 유지한다.
 *   부모 이동·회전 시 아래 헬퍼가 자식을 동반 변환한다 — 부모를 움직이는 모든 경로는
 *   patchItem 대신 moveItemWithChildren / rotateItemWithChildren 를 써야 한다.
 * - 깊이는 1단: 자식 위에 또 올릴 수 없다 (isSurfaceItem 이 parentId 있는 아이템 거부).
 * - 부모 삭제 시 자식은 **동반 삭제** (deleteItemsWithChildren — undo 1회로 함께 복원).
 * - 표면 자식은 바닥 충돌·문 클리어런스 대상이 아니다. 대신 같은 부모 위
 *   형제와의 겹침(siblingOverlapIds)과 상판 밖 이탈(childFitsSurface)만 검사한다.
 */

/** 상판(표면)을 가진 shape */
export const SURFACE_SHAPES = new Set<string>([
  'desk',
  'rect-table',
  'round-table',
  'console',
  'dining-set',
]);

export function isMountable(catalogId: string): boolean {
  return catalogById.get(catalogId)?.mountable === true;
}

export function isSurfaceItem(item: PlacedItem): boolean {
  if (item.parentId) return false; // 1단 제한
  return SURFACE_SHAPES.has(catalogById.get(item.catalogId)?.shape ?? '');
}

export function surfaceChildren(plan: Plan, parentId: string): PlacedItem[] {
  return plan.items.filter((i) => i.parentId === parentId);
}

/** 점이 표면 아이템 위인지 — z 상위(뒤에 배치된) 아이템 우선 */
export function surfaceAt(plan: Plan, world: Vec2, excludeId?: string): PlacedItem | null {
  for (let i = plan.items.length - 1; i >= 0; i--) {
    const it = plan.items[i];
    if (it.id === excludeId || !isSurfaceItem(it)) continue;
    if (pointInPolygon(world, itemCorners(it))) return it;
  }
  return null;
}

/** 자식 풋프린트 4모서리가 모두 부모 상판(풋프린트) 안에 있는가 */
export function childFitsSurface(
  child: { position: Vec2; rotationDeg: number; size: { w: number; d: number } },
  parent: PlacedItem,
): boolean {
  const parentPoly = itemCorners(parent);
  return itemCorners(child).every((c) => pointInPolygon(c, parentPoly));
}

/** 같은 부모 위 형제와의 겹침 (표면 로컬 충돌) */
export function siblingOverlapIds(
  plan: Plan,
  child: { id?: string; parentId?: string | null; position: Vec2; rotationDeg: number; size: { w: number; d: number } },
  parentId: string,
): string[] {
  const corners = itemCorners(child);
  return surfaceChildren(plan, parentId)
    .filter((s) => s.id !== child.id && polysOverlap(corners, itemCorners(s)))
    .map((s) => s.id);
}

/** 부모 이동 — 자식 동반 평행이동 */
export function moveItemWithChildren(plan: Plan, id: string, position: Vec2): Plan {
  const target = plan.items.find((i) => i.id === id);
  if (!target) return plan;
  const delta = { x: position.x - target.position.x, y: position.y - target.position.y };
  return {
    ...plan,
    items: plan.items.map((i) => {
      if (i.id === id) return { ...i, position };
      if (i.parentId === id)
        return { ...i, position: { x: i.position.x + delta.x, y: i.position.y + delta.y } };
      return i;
    }),
  };
}

/** 부모 회전 — 자식 위치를 부모 중심 기준으로 함께 회전 (자식 자체 각도에도 delta 적용) */
export function rotateItemWithChildren(plan: Plan, id: string, rotationDeg: number): Plan {
  const target = plan.items.find((i) => i.id === id);
  if (!target) return plan;
  const deltaDeg = rotationDeg - target.rotationDeg;
  const rad = deg2rad(deltaDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = target.position.x;
  const cy = target.position.y;
  return {
    ...plan,
    items: plan.items.map((i) => {
      if (i.id === id) return { ...i, rotationDeg };
      if (i.parentId !== id) return i;
      const dx = i.position.x - cx;
      const dy = i.position.y - cy;
      return {
        ...i,
        position: { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos },
        rotationDeg: i.rotationDeg + deltaDeg,
      };
    }),
  };
}

/** 삭제 — 부모가 포함되면 그 자식도 함께 제거 */
export function deleteItemsWithChildren(plan: Plan, ids: string[]): Plan {
  const dead = new Set(ids);
  for (const i of plan.items) {
    if (i.parentId && dead.has(i.parentId)) dead.add(i.id);
  }
  return { ...plan, items: plan.items.filter((i) => !dead.has(i.id)) };
}

/** 자식으로 올리기 — roomId 는 부모를 따른다 */
export function mountItem(plan: Plan, childId: string, parentId: string): Plan {
  const parent = plan.items.find((i) => i.id === parentId);
  if (!parent) return plan;
  return {
    ...plan,
    items: plan.items.map((i) =>
      i.id === childId ? { ...i, parentId, roomId: parent.roomId } : i,
    ),
  };
}

/** 바닥으로 내리기 */
export function unmountItem(plan: Plan, childId: string): Plan {
  return {
    ...plan,
    items: plan.items.map((i) => {
      if (i.id !== childId) return i;
      const next = { ...i };
      delete next.parentId;
      return next;
    }),
  };
}

/** 자식이 렌더될 바닥 기준 높이 = 부모 상판 높이 */
export function mountBaseHeight(plan: Plan, item: PlacedItem): number {
  if (!item.parentId) return 0;
  return plan.items.find((i) => i.id === item.parentId)?.size.h ?? 0;
}
