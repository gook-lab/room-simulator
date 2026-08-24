import { catalogById } from './catalog';
import { itemCorners, polysOverlap } from './geometry';
import type { Opening, PlacedItem, Plan, Vec2, Wall } from './types';

/** 문 반대편(통행) 확보 깊이 (m) */
export const DOOR_PASS_DEPTH = 0.3;

/** 문 클리어런스에서 무시하는 shape — 바닥 깔개·천장 조명 */
const IGNORED_SHAPES = new Set(['rug', 'pendant-lamp']);

export type DoorZone = {
  openingId: string;
  /** 'swing' = 문짝 스윙 사각형(깊이=문 폭), 'pass' = 반대편 통행 스트립(0.3m) */
  kind: 'swing' | 'pass';
  corners: Vec2[];
};

function rect(p1: Vec2, p2: Vec2, n: Vec2, depth: number): Vec2[] {
  return [
    p1,
    p2,
    { x: p2.x + n.x * depth, y: p2.y + n.y * depth },
    { x: p1.x + n.x * depth, y: p1.y + n.y * depth },
  ];
}

/**
 * 문마다 가구를 두면 안 되는 존:
 * - 스윙 쪽: 문 폭 × 문 폭 (문짝 회전 반경)
 * - 반대쪽: 문 폭 × 0.3m (통행 여유)
 * 개폐 상태와 무관하게 적용된다 (닫힌 문도 열 수 있어야 하므로).
 */
export function doorZones(plan: Plan): DoorZone[] {
  const out: DoorZone[] = [];
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const zones = zonesForDoor(wall, o);
    if (zones) out.push(...zones);
  }
  return out;
}

function zonesForDoor(wall: Wall, o: Opening): DoorZone[] | null {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (len < 1e-6) return null;
  const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
  const normal = { x: -dir.y, y: dir.x };
  const center = {
    x: wall.a.x + dir.x * o.t * len,
    y: wall.a.y + dir.y * o.t * len,
  };
  const half = o.width / 2;
  const p1 = { x: center.x - dir.x * half, y: center.y - dir.y * half };
  const p2 = { x: center.x + dir.x * half, y: center.y + dir.y * half };
  // 2D 스윙 호와 동일 규칙: left → +normal 쪽, right → -normal 쪽
  const swingSign = o.swing === 'right' ? -1 : 1;
  const swingN = { x: normal.x * swingSign, y: normal.y * swingSign };
  const passN = { x: -swingN.x, y: -swingN.y };
  return [
    { openingId: o.id, kind: 'swing', corners: rect(p1, p2, swingN, o.width) },
    { openingId: o.id, kind: 'pass', corners: rect(p1, p2, passN, DOOR_PASS_DEPTH) },
  ];
}

function isIgnoredForDoors(catalogId: string): boolean {
  const shape = catalogById.get(catalogId)?.shape;
  return shape != null && IGNORED_SHAPES.has(shape);
}

/** 아이템(후보 위치)이 막는 문 id 목록 */
export function blockedDoorIds(
  plan: Plan,
  item: Pick<PlacedItem, 'catalogId' | 'position' | 'rotationDeg' | 'size'> & { id?: string },
): string[] {
  if (isIgnoredForDoors(item.catalogId)) return [];
  const corners = itemCorners(item);
  const hit = new Set<string>();
  for (const zone of doorZones(plan)) {
    if (hit.has(zone.openingId)) continue;
    if (polysOverlap(corners, zone.corners)) hit.add(zone.openingId);
  }
  return [...hit];
}
