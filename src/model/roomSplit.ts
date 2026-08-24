import { polygonArea } from './geometry';
import { roomAt } from './geometry';
import type { Plan, Room, Vec2 } from './types';

const EDGE_TOL = 0.15;

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

/** 점이 폴리곤의 어느 에지 위(±EDGE_TOL)에 있는지 — 에지 인덱스 or null */
function edgeIndexAt(polygon: Vec2[], p: Vec2): number | null {
  let best: { i: number; d: number } | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const d = distToSegment(p, a, b);
    if (d < EDGE_TOL && (!best || d < best.d)) best = { i, d };
  }
  return best?.i ?? null;
}

let seq = 0;

/**
 * 벽 그리기(열린 폴리라인)로 룸을 가로질렀을 때 룸을 두 개로 분할한다.
 * 폴리라인의 양 끝점이 같은 룸 폴리곤의 경계 에지 위에 있으면:
 *   A = [끝점2 → 폴리라인 역순 → 끝점1] + [에지 i0 다음 정점 .. 에지 i1 정점]
 *   B = [끝점1 → 폴리라인 순방향 → 끝점2] + [에지 i1 다음 정점 .. 에지 i0 정점]
 * 분할된 룸은 기존 이름·용도·마감을 상속하고(첫 조각), 둘째 조각은 "방 N"이 된다.
 * 가구 roomId 는 재배정된다. 분할 불가 조건이면 plan 을 그대로 반환한다.
 */
export function splitRoomByPolyline(plan: Plan, points: Vec2[]): Plan {
  if (points.length < 2) return plan;
  const start = points[0];
  const end = points[points.length - 1];

  for (const room of plan.rooms) {
    const poly = room.polygon;
    const i0 = edgeIndexAt(poly, start);
    const i1 = edgeIndexAt(poly, end);
    if (i0 == null || i1 == null || i0 === i1) continue;

    const n = poly.length;
    // start(에지 i0) → 폴리라인 → end(에지 i1) → 경계 정점 (i1+1 .. i0) → start
    const sideA: Vec2[] = [...points];
    for (let k = (i1 + 1) % n; ; k = (k + 1) % n) {
      sideA.push(poly[k]);
      if (k === i0) break;
    }
    // end → 폴리라인 역순 → start → 경계 정점 (i0+1 .. i1) → end
    const sideB: Vec2[] = [...points].reverse();
    for (let k = (i0 + 1) % n; ; k = (k + 1) % n) {
      sideB.push(poly[k]);
      if (k === i1) break;
    }

    const areaA = polygonArea(sideA);
    const areaB = polygonArea(sideB);
    if (areaA < 0.5 || areaB < 0.5) continue; // 의미 없는 조각
    // 면적 보존 검증 (±5%) — 이상하면 분할 포기
    if (Math.abs(areaA + areaB - room.areaSqm) > Math.max(0.5, room.areaSqm * 0.05)) continue;

    const roomA: Room = { ...room, polygon: sideA, areaSqm: areaA };
    const roomB: Room = {
      ...room,
      id: `room-split-${Date.now().toString(36)}-${seq++}`,
      name: `방 ${plan.rooms.length + 1}`,
      polygon: sideB,
      areaSqm: areaB,
    };
    const rooms = plan.rooms.map((r) => (r.id === room.id ? roomA : r)).concat(roomB);
    // 가구 roomId 재배정
    const items = plan.items.map((i) => {
      const at = roomAt(rooms, i.position);
      return at && at.id !== i.roomId ? { ...i, roomId: at.id } : i;
    });
    return { ...plan, rooms, items };
  }
  return plan;
}
