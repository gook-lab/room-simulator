import type { Plan, Room, Vec2, Wall } from './types';

export const deg2rad = (d: number) => (d * Math.PI) / 180;

export function polygonArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function roomAt(rooms: Room[], p: Vec2): Room | null {
  return rooms.find((r) => pointInPolygon(p, r.polygon)) ?? null;
}

/** 회전된 가구의 4개 코너 (시계방향) */
export function itemCorners(item: {
  position: Vec2;
  rotationDeg: number;
  size: { w: number; d: number };
}): Vec2[] {
  const { x, y } = item.position;
  const hw = item.size.w / 2;
  const hd = item.size.d / 2;
  const r = deg2rad(item.rotationDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((c) => ({ x: x + c.x * cos - c.y * sin, y: y + c.x * sin + c.y * cos }));
}

/** 축정렬 bounding box */
export function itemAabb(item: {
  position: Vec2;
  rotationDeg: number;
  size: { w: number; d: number };
}): { min: Vec2; max: Vec2 } {
  const cs = itemCorners(item);
  return {
    min: { x: Math.min(...cs.map((c) => c.x)), y: Math.min(...cs.map((c) => c.y)) },
    max: { x: Math.max(...cs.map((c) => c.x)), y: Math.max(...cs.map((c) => c.y)) },
  };
}

/** SAT: 두 convex 폴리곤 겹침 검사 */
export function polysOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axis = { x: p2.y - p1.y, y: p1.x - p2.x };
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const p of a) {
        const proj = p.x * axis.x + p.y * axis.y;
        minA = Math.min(minA, proj);
        maxA = Math.max(maxA, proj);
      }
      for (const p of b) {
        const proj = p.x * axis.x + p.y * axis.y;
        minB = Math.min(minB, proj);
        maxB = Math.max(maxB, proj);
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

/** 러그는 충돌 무시 대상 */
export function collidingItemIds(
  plan: Plan,
  moving: { id?: string; position: Vec2; rotationDeg: number; size: { w: number; d: number } },
  ignoreShapes: Set<string>,
  shapeOf: (catalogId: string) => string,
): string[] {
  const movingCorners = itemCorners(moving);
  const out: string[] = [];
  for (const other of plan.items) {
    if (other.id === moving.id) continue;
    if (ignoreShapes.has(shapeOf(other.catalogId))) continue;
    if (polysOverlap(movingCorners, itemCorners(other))) out.push(other.id);
  }
  return out;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function wallLength(w: Wall): number {
  return distance(w.a, w.b);
}

export function wallPointAt(w: Wall, t: number): Vec2 {
  return { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
}

export function wallAngleDeg(w: Wall): number {
  return (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI;
}

/** 점→선분 최근접 t (0..1) */
export function closestTOnWall(w: Wall, p: Vec2): number {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len2;
  return Math.max(0, Math.min(1, t));
}

export function distToWall(w: Wall, p: Vec2): number {
  return distance(wallPointAt(w, closestTOnWall(w, p)), p);
}

/** 도면 전체 bounds (벽 기준) */
export function planBounds(plan: Plan): { min: Vec2; max: Vec2 } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of plan.walls) {
    xs.push(w.a.x, w.b.x);
    ys.push(w.a.y, w.b.y);
  }
  if (xs.length === 0) return { min: { x: 0, y: 0 }, max: { x: 10, y: 8 } };
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

export function snapValue(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function totalPrice(plan: Plan): number {
  return plan.items.reduce((s, i) => s + i.price, 0);
}

export function priceByRoom(
  plan: Plan,
): { roomId: string | null; roomName: string; count: number; sum: number }[] {
  const groups = new Map<string | null, { count: number; sum: number }>();
  for (const item of plan.items) {
    const g = groups.get(item.roomId) ?? { count: 0, sum: 0 };
    g.count += 1;
    g.sum += item.price;
    groups.set(item.roomId, g);
  }
  return [...groups.entries()].map(([roomId, g]) => ({
    roomId,
    roomName: plan.rooms.find((r) => r.id === roomId)?.name ?? '기타',
    ...g,
  }));
}
