import type { Opening, Plan, Room, Vec2, Wall } from './types';

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
    if (other.parentId) continue; // 표면 위 자식은 바닥 충돌 대상 아님
    if (ignoreShapes.has(shapeOf(other.catalogId))) continue;
    if (polysOverlap(movingCorners, itemCorners(other))) out.push(other.id);
  }
  return out;
}

/**
 * SAT 침투 깊이(m) — 두 볼록 다각형을 떼어 놓는 데 필요한 최소 이동 거리.
 * 0 이하면 떨어져 있거나 면끼리 맞닿은 상태다.
 */
export function polysPenetration(a: Vec2[], b: Vec2[]): number {
  let depth = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len < 1e-12) continue;
      const ax = (p2.y - p1.y) / len;
      const ay = (p1.x - p2.x) / len;
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const p of a) {
        const d = p.x * ax + p.y * ay;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const p of b) {
        const d = p.x * ax + p.y * ay;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return overlap;
      depth = Math.min(depth, overlap);
    }
  }
  return depth;
}

/**
 * 벽 몸통 사각형들 — 문 개구부 구간은 빈 통로라 잘라 낸다.
 * 창은 아래 벽(창대)이 남아 가구가 지나갈 수 없으므로 몸통으로 친다.
 */
export function wallSolidPieces(wall: Wall, openings: Opening[]): Vec2[][] {
  const len = wallLength(wall);
  if (len < 1e-6) return [];
  const doors = openings
    .filter((o) => o.wallId === wall.id && o.kind === 'door')
    .map((o) => [o.t * len - o.width / 2, o.t * len + o.width / 2])
    .sort((p, q) => p[0] - q[0]);
  const spans: [number, number][] = [];
  let cursor = 0;
  for (const [start, end] of doors) {
    if (start > cursor) spans.push([cursor, Math.min(start, len)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < len) spans.push([cursor, len]);
  const ux = (wall.b.x - wall.a.x) / len;
  const uy = (wall.b.y - wall.a.y) / len;
  const nx = -uy * (wall.thickness / 2);
  const ny = ux * (wall.thickness / 2);
  return spans
    .filter(([s, e]) => e - s > 1e-6)
    .map(([s, e]) => {
      const p0 = { x: wall.a.x + ux * s, y: wall.a.y + uy * s };
      const p1 = { x: wall.a.x + ux * e, y: wall.a.y + uy * e };
      return [
        { x: p0.x + nx, y: p0.y + ny },
        { x: p1.x + nx, y: p1.y + ny },
        { x: p1.x - nx, y: p1.y - ny },
        { x: p0.x - nx, y: p0.y - ny },
      ];
    });
}

/** 가구 외곽이 tolerance(m)보다 깊이 파고든 벽 id — 면에 맞닿은 정도는 겹침이 아니다 */
export function wallOverlapIds(
  plan: Pick<Plan, 'walls' | 'openings'>,
  moving: { position: Vec2; rotationDeg: number; size: { w: number; d: number } },
  tolerance: number,
): string[] {
  const corners = itemCorners(moving);
  return plan.walls
    .filter((wall) =>
      wallSolidPieces(wall, plan.openings).some(
        (piece) => polysPenetration(corners, piece) > tolerance,
      ),
    )
    .map((wall) => wall.id);
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
  // 벽 없는 언더레이 문서(즉시 로드 업로드)는 밑그림 영역이 곧 도면 범위
  if (xs.length === 0 && plan.tracing?.widthM && plan.tracing.heightM) {
    return {
      min: { x: 0, y: 0 },
      max: { x: plan.tracing.widthM, y: plan.tracing.heightM },
    };
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
  return (
    plan.items.reduce((s, i) => s + i.price, 0) +
    (plan.wallItems ?? []).reduce((s, i) => s + i.price, 0)
  );
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
  // 벽 부착 아이템은 룸 소속이 없어 '기타(벽)' 그룹으로 합산
  for (const wi of plan.wallItems ?? []) {
    const g = groups.get(null) ?? { count: 0, sum: 0 };
    g.count += 1;
    g.sum += wi.price;
    groups.set(null, g);
  }
  return [...groups.entries()].map(([roomId, g]) => ({
    roomId,
    roomName: plan.rooms.find((r) => r.id === roomId)?.name ?? '기타(벽)',
    ...g,
  }));
}
