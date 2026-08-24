import { catalogById } from './catalog';
import { wallLength } from './geometry';
import type { CatalogShape, Plan, WallItem } from './types';

/** 벽 부착 shape — 바닥 배치 대신 wallId+t+높이 좌표계 사용 */
export const WALL_SHAPES = new Set<CatalogShape>(['frame', 'wall-clock', 'wall-mirror']);

export function isWallCatalogItem(catalogId: string): boolean {
  const shape = catalogById.get(catalogId)?.shape;
  return shape != null && WALL_SHAPES.has(shape);
}

/** shape별 기본 부착 높이 (바닥→중심, m) */
export function defaultMountHeight(catalogId: string): number {
  switch (catalogById.get(catalogId)?.shape) {
    case 'wall-clock':
      return 1.85;
    case 'wall-mirror':
      return 1.35;
    default:
      return 1.5; // frame
  }
}

/** 벽 위 아이템 스팬 [start,end] (벽 길이 방향 m) */
function spanOf(plan: Plan, wallId: string, t: number, width: number): [number, number] | null {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const len = wallLength(wall);
  if (len < 1e-6) return null;
  return [t * len - width / 2, t * len + width / 2];
}

/** 개구부(문·창)와 겹치면 배치 금지 */
export function wallItemOverlapsOpening(
  plan: Plan,
  wallId: string,
  t: number,
  width: number,
  ignoreItemId?: string,
): boolean {
  const span = spanOf(plan, wallId, t, width);
  if (!span) return true; // 없는 벽 = 배치 불가
  const wall = plan.walls.find((w) => w.id === wallId)!;
  const len = wallLength(wall);
  for (const o of plan.openings) {
    if (o.wallId !== wallId) continue;
    const oStart = o.t * len - o.width / 2;
    const oEnd = o.t * len + o.width / 2;
    if (span[0] < oEnd && span[1] > oStart) return true;
  }
  // 다른 벽 부착 아이템과의 겹침(같은 면)도 금지
  for (const wi of plan.wallItems ?? []) {
    if (wi.id === ignoreItemId || wi.wallId !== wallId) continue;
    const cat = catalogById.get(wi.catalogId);
    if (!cat) continue;
    const other = spanOf(plan, wallId, wi.t, cat.size.w);
    if (other && span[0] < other[1] && span[1] > other[0]) return true;
  }
  return false;
}

/** t를 벽 안에 아이템이 온전히 들어가도록 클램프 */
export function clampWallT(plan: Plan, wallId: string, t: number, width: number): number {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) return t;
  const len = wallLength(wall);
  if (len <= width) return 0.5;
  const half = width / 2 / len;
  return Math.min(1 - half, Math.max(half, t));
}

export function canPlaceWallItem(
  plan: Plan,
  wallId: string,
  t: number,
  catalogId: string,
  ignoreItemId?: string,
): boolean {
  const cat = catalogById.get(catalogId);
  if (!cat || !isWallCatalogItem(catalogId)) return false;
  return !wallItemOverlapsOpening(plan, wallId, t, cat.size.w, ignoreItemId);
}

let seq = 0;

export function createWallItem(
  catalogId: string,
  wallId: string,
  t: number,
  side: WallItem['side'],
  swatchIndex = 0,
): WallItem {
  const cat = catalogById.get(catalogId);
  if (!cat) throw new Error(`unknown catalog id: ${catalogId}`);
  const swatch = cat.swatches[swatchIndex] ?? cat.swatches[0];
  return {
    id: `witem-${Date.now().toString(36)}-${seq++}`,
    catalogId,
    wallId,
    t,
    heightM: defaultMountHeight(catalogId),
    side,
    variant: { material: swatch.id, color: swatch.color },
    price: cat.price,
  };
}

export function moveWallItem(
  plan: Plan,
  id: string,
  patch: Partial<Pick<WallItem, 'wallId' | 't' | 'side' | 'heightM' | 'variant'>>,
): Plan {
  if (!(plan.wallItems ?? []).some((w) => w.id === id)) return plan;
  return {
    ...plan,
    wallItems: (plan.wallItems ?? []).map((w) => (w.id === id ? { ...w, ...patch } : w)),
  };
}
