import type { Plan, PlacedItem, SnapResult, Vec2, Wall } from '../../model/types';
import { blockedDoorIds } from '../../model/doorZones';
import {
  closestTOnWall,
  collidingItemIds,
  distToWall,
  itemAabb,
  itemCorners,
  pointInPolygon,
  roomAt,
  snapValue,
} from '../../model/geometry';
import { NON_COLLIDING_SHAPES, shapeOf } from './symbols';
import { itemLayer, sortedItems } from './PlanCanvas';

function isHorizontal(w: Wall): boolean {
  return Math.abs(w.a.y - w.b.y) < 1e-6;
}

function isVertical(w: Wall): boolean {
  return Math.abs(w.a.x - w.b.x) < 1e-6;
}

function spanOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.min(a1, a2) < Math.max(b1, b2) && Math.max(a1, a2) > Math.min(b1, b2);
}

/**
 * 가구 이동 스냅: 그리드(10cm) + 벽 면(스크린 12px 이내).
 * 반환된 position은 스냅 적용 후 좌표.
 */
export function snapItemMove(
  plan: Plan,
  item: { id?: string; rotationDeg: number; size: { w: number; d: number } },
  candidate: Vec2,
  pxPerM: number,
  snapping: { enabled: boolean; gridCm: number },
): { position: Vec2; snap: SnapResult | null } {
  let pos = { ...candidate };
  if (snapping.enabled) {
    const grid = snapping.gridCm / 100;
    pos = { x: snapValue(pos.x, grid), y: snapValue(pos.y, grid) };
  }
  if (!snapping.enabled) return { position: pos, snap: null };

  const threshold = 12 / pxPerM;
  const probe = { position: pos, rotationDeg: item.rotationDeg, size: item.size };
  const aabb = itemAabb(probe);
  let best: { delta: Vec2; snap: SnapResult; gap: number } | null = null;

  for (const wall of plan.walls) {
    if (isHorizontal(wall)) {
      if (!spanOverlap(aabb.min.x, aabb.max.x, wall.a.x, wall.b.x)) continue;
      const half = wall.thickness / 2;
      // 벽 아래쪽 면에 아이템 상단 붙이기
      const faceBelow = wall.a.y + half;
      const gapBelow = aabb.min.y - faceBelow;
      if (gapBelow > -threshold && Math.abs(gapBelow) < threshold) {
        if (!best || Math.abs(gapBelow) < best.gap) {
          best = {
            delta: { x: 0, y: -gapBelow },
            gap: Math.abs(gapBelow),
            snap: { kind: 'wall', axis: 'y', line: faceBelow, targetId: wall.id, clearance: null },
          };
        }
      }
      // 벽 위쪽 면에 아이템 하단 붙이기
      const faceAbove = wall.a.y - half;
      const gapAbove = faceAbove - aabb.max.y;
      if (gapAbove > -threshold && Math.abs(gapAbove) < threshold) {
        if (!best || Math.abs(gapAbove) < best.gap) {
          best = {
            delta: { x: 0, y: gapAbove },
            gap: Math.abs(gapAbove),
            snap: { kind: 'wall', axis: 'y', line: faceAbove, targetId: wall.id, clearance: null },
          };
        }
      }
    } else if (isVertical(wall)) {
      if (!spanOverlap(aabb.min.y, aabb.max.y, wall.a.y, wall.b.y)) continue;
      const half = wall.thickness / 2;
      const faceRight = wall.a.x + half;
      const gapRight = aabb.min.x - faceRight;
      if (gapRight > -threshold && Math.abs(gapRight) < threshold) {
        if (!best || Math.abs(gapRight) < best.gap) {
          best = {
            delta: { x: -gapRight, y: 0 },
            gap: Math.abs(gapRight),
            snap: { kind: 'wall', axis: 'x', line: faceRight, targetId: wall.id, clearance: null },
          };
        }
      }
      const faceLeft = wall.a.x - half;
      const gapLeft = faceLeft - aabb.max.x;
      if (gapLeft > -threshold && Math.abs(gapLeft) < threshold) {
        if (!best || Math.abs(gapLeft) < best.gap) {
          best = {
            delta: { x: gapLeft, y: 0 },
            gap: Math.abs(gapLeft),
            snap: { kind: 'wall', axis: 'x', line: faceLeft, targetId: wall.id, clearance: null },
          };
        }
      }
    }
  }

  if (!best) return { position: pos, snap: null };
  const snapped = { x: pos.x + best.delta.x, y: pos.y + best.delta.y };

  // 반대편 여유: 같은 룸 bounding box 기준
  const room = roomAt(plan.rooms, snapped);
  if (room) {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const snappedAabb = itemAabb({ position: snapped, rotationDeg: item.rotationDeg, size: item.size });
    if (best.snap.axis === 'y') {
      // 아이템 중심 기준으로 벽의 어느 쪽에 붙었는지 판정 (부동소수 경계 안전)
      const towardBottom = snapped.y >= best.snap.line;
      best.snap.clearance = towardBottom
        ? Math.max(...ys) - snappedAabb.max.y
        : snappedAabb.min.y - Math.min(...ys);
    } else {
      const towardRight = snapped.x >= best.snap.line;
      best.snap.clearance = towardRight
        ? Math.max(...xs) - snappedAabb.max.x
        : snappedAabb.min.x - Math.min(...xs);
    }
    best.snap.clearance = Math.max(0, best.snap.clearance - 0.075);
  }

  return { position: snapped, snap: best.snap };
}

export function collisionsFor(
  plan: Plan,
  moving: { id?: string; catalogId: string; position: Vec2; rotationDeg: number; size: { w: number; d: number } },
): string[] {
  if (NON_COLLIDING_SHAPES.has(shapeOf(moving.catalogId))) return [];
  return collidingItemIds(plan, moving, NON_COLLIDING_SHAPES, shapeOf);
}

/** 화면 point → 최상위 아이템 (z 역순) */
export function itemAtPoint(plan: Plan, world: Vec2): PlacedItem | null {
  const items = sortedItems(plan);
  for (let i = items.length - 1; i >= 0; i--) {
    if (pointInPolygon(world, itemCorners(items[i]))) return items[i];
  }
  return null;
}

/** 클릭 지점에서 가장 가까운 벽 (스크린 임계 이내) */
export function wallNear(
  plan: Plan,
  world: Vec2,
  pxPerM: number,
  thresholdPx = 14,
): { wall: Wall; t: number } | null {
  const threshold = thresholdPx / pxPerM;
  let best: { wall: Wall; t: number; d: number } | null = null;
  for (const wall of plan.walls) {
    const d = distToWall(wall, world);
    if (d < threshold && (!best || d < best.d)) {
      best = { wall, t: closestTOnWall(wall, world), d };
    }
  }
  return best ? { wall: best.wall, t: best.t } : null;
}

/** 클릭 지점의 문 개구부 (2D 문 여닫기 토글용) */
export function doorNear(
  plan: Plan,
  world: Vec2,
  pxPerM: number,
  thresholdPx = 14,
): { opening: Plan['openings'][number] } | null {
  const threshold = thresholdPx / pxPerM;
  let best: { opening: Plan['openings'][number]; d: number } | null = null;
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (len < 1e-6) continue;
    const t = closestTOnWall(wall, world);
    // 개구부 구간 안인지 (약간의 여유 포함)
    const margin = threshold / len;
    if (Math.abs(t - o.t) > o.width / 2 / len + margin) continue;
    const d = distToWall(wall, world);
    if (d < threshold + wall.thickness / 2 && (!best || d < best.d)) {
      best = { opening: o, d };
    }
  }
  return best ? { opening: best.opening } : null;
}

/** 충돌·문 클리어런스 침범 시 "빈 자리로 이동": 나선형 오프셋 탐색 */
export function findFreeSpot(plan: Plan, item: PlacedItem): Vec2 | null {
  const step = 0.2;
  for (let radius = step; radius <= 3; radius += step) {
    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      const pos = {
        x: item.position.x + Math.cos(rad) * radius,
        y: item.position.y + Math.sin(rad) * radius,
      };
      const room = roomAt(plan.rooms, pos);
      if (!room) continue;
      const probe = { ...item, position: pos };
      if (collisionsFor(plan, probe).length === 0 && blockedDoorIds(plan, probe).length === 0) {
        const corners = itemCorners(probe);
        if (corners.every((c) => roomAt(plan.rooms, c))) return pos;
      }
    }
  }
  return null;
}

/** 배치율: 가구 면적 / 룸 총면적 (대충의 데코 지표) */
export function occupancyPct(plan: Plan): number {
  const roomArea = plan.rooms.reduce((s, r) => s + r.areaSqm, 0);
  if (roomArea === 0) return 0;
  const itemArea = plan.items
    .filter((i) => itemLayer(i) === 1)
    .reduce((s, i) => s + i.size.w * i.size.d, 0);
  return Math.min(100, Math.round((itemArea / roomArea) * 100 * 2.2));
}
