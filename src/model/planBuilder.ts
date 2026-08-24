import { catalogById } from './catalog';
import { polygonArea } from './geometry';
import type { PlacedItem, Room, Vec2, Wall } from './types';

export const WALL_T = 0.15; // 기본 벽 두께 (m)
export const WALL_H = 2.4; // 기본 벽 높이 (m)

export const wall = (id: string, a: Vec2, b: Vec2): Wall => ({
  id,
  a,
  b,
  thickness: WALL_T,
  height: WALL_H,
});

export const room = (
  id: string,
  name: string,
  wallIds: string[],
  polygon: Vec2[],
  floor: Room['floor'],
): Room => ({ id, name, wallIds, polygon, areaSqm: polygonArea(polygon), floor });

export function item(
  id: string,
  catalogId: string,
  position: Vec2,
  rotationDeg: number,
  roomId: string | null,
  swatchIndex = 0,
): PlacedItem {
  const cat = catalogById.get(catalogId);
  if (!cat) throw new Error(`unknown catalog id: ${catalogId}`);
  const swatch = cat.swatches[swatchIndex] ?? cat.swatches[0];
  return {
    id,
    catalogId,
    position,
    rotationDeg,
    size: { ...cat.size },
    variant: { material: swatch.id, color: swatch.color },
    roomId,
    price: cat.price,
  };
}
