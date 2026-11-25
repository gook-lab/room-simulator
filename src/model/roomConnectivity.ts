import type { Plan, Vec2, Wall } from './types';

/**
 * 방 연결 판정 — 문이나 열린 통로로 서로 이어지지 않는 방을 찾는다.
 * 업로드 인식은 문을 못 찾는 일이 많아(샘플 도면은 문 0) 워크스루에서 방에
 * 들어갈 수 없게 되는데, 화면이 "문이 없는 방"을 알려 주는 근거로 쓴다.
 *
 * 벽 id 가 아니라 기하로 판정한다 — 업로드 · 수동 벽은 한 경계가 여러 벽으로
 * 쪼개지거나 한 벽이 여러 방 경계를 지나기 때문이다.
 * 1) 두 방 다각형에서 마주 보는 평행 변(사이 거리 SHARED_GAP_MAX_M 이하)의
 *    겹치는 구간 = 공유 경계
 * 2) 그 띠 안의 평행 벽이 덮는 구간을 빼고 남은 구간이 PASSAGE_MIN_M 이상이면
 *    열린 통로(divider 사이 빈 곳), 띠 안 벽에 문이 걸쳐 있으면 문
 */

/** 공유 경계로 볼 두 방 변 사이 최대 거리(m) — 벽 두께 + 업로드 인식의 안쪽 여백 */
export const SHARED_GAP_MAX_M = 0.6;
/** 벽 없이 비어 있는 경계가 이 길이 이상이면 열린 통로로 본다(m) */
export const PASSAGE_MIN_M = 0.6;
/** 이보다 짧게 맞닿은 경계는 모서리 접촉으로 보고 무시한다(m) */
const SHARED_MIN_M = 0.3;
const PARALLEL_COS = Math.cos((5 * Math.PI) / 180);

export type RoomLink = {
  a: string;
  b: string;
  /** 공유 경계 길이 합(m) */
  sharedM: number;
  /** 이어진 방법 — null 이면 벽으로 막혀 있다 */
  via: 'door' | 'passage' | null;
};

export type RoomConnectivity = {
  /** 경계를 공유하는 방 쌍 */
  links: RoomLink[];
  /** 어느 방과도 문 · 통로로 이어지지 않은 방 (방이 2개 이상일 때만) */
  isolatedRoomIds: string[];
  /** 서로 이어진 방 묶음 수 */
  groupCount: number;
};

type Interval = [number, number];

function edgesOf(poly: Vec2[]): [Vec2, Vec2][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
}

/** [lo, hi] 에서 덮인 구간을 빼고 남은 가장 긴 조각 길이 */
function longestUncovered(lo: number, hi: number, covered: Interval[]): number {
  const sorted = covered
    .map(([a, b]): Interval => [Math.max(lo, a), Math.min(hi, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let cursor = lo;
  let best = 0;
  for (const [a, b] of sorted) {
    if (a > cursor) best = Math.max(best, a - cursor);
    cursor = Math.max(cursor, b);
  }
  return Math.max(best, hi - cursor);
}

/** 두 변 사이 공유 경계에서의 연결 상태 — 공유가 아니면 null */
function sharedBoundary(
  e: [Vec2, Vec2],
  f: [Vec2, Vec2],
  walls: Wall[],
  doorsByWall: Map<string, { t: number; width: number }[]>,
): { length: number; via: RoomLink['via'] } | null {
  const [p, q] = e;
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const fLen = Math.hypot(f[1].x - f[0].x, f[1].y - f[0].y);
  if (len < 1e-6 || fLen < 1e-6) return null;
  const ux = (q.x - p.x) / len;
  const uy = (q.y - p.y) / len;
  const fx = (f[1].x - f[0].x) / fLen;
  const fy = (f[1].y - f[0].y) / fLen;
  if (Math.abs(ux * fx + uy * fy) < PARALLEL_COS) return null;
  const nx = -uy;
  const ny = ux;
  const along = (v: Vec2) => (v.x - p.x) * ux + (v.y - p.y) * uy;
  const across = (v: Vec2) => (v.x - p.x) * nx + (v.y - p.y) * ny;
  const gap = across({ x: (f[0].x + f[1].x) / 2, y: (f[0].y + f[1].y) / 2 });
  if (Math.abs(gap) > SHARED_GAP_MAX_M) return null;
  const lo = Math.max(0, Math.min(along(f[0]), along(f[1])));
  const hi = Math.min(len, Math.max(along(f[0]), along(f[1])));
  if (hi - lo < SHARED_MIN_M) return null;

  // 두 변 사이 띠에 놓인 평행 벽 — 중심선이 띠 안(양쪽 0.1m 여유)에 있어야 한다
  const bandLo = Math.min(0, gap) - 0.1;
  const bandHi = Math.max(0, gap) + 0.1;
  const covered: Interval[] = [];
  let door = false;
  for (const w of walls) {
    const wLen = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (wLen < 1e-6) continue;
    const wx = (w.b.x - w.a.x) / wLen;
    const wy = (w.b.y - w.a.y) / wLen;
    if (Math.abs(ux * wx + uy * wy) < PARALLEL_COS) continue;
    const off = across({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
    if (off < bandLo || off > bandHi) continue;
    const wa = along(w.a);
    const wb = along(w.b);
    covered.push([Math.min(wa, wb), Math.max(wa, wb)]);
    for (const d of doorsByWall.get(w.id) ?? []) {
      const c = wa + (wb - wa) * d.t;
      const overlap = Math.min(hi, c + d.width / 2) - Math.max(lo, c - d.width / 2);
      if (overlap >= Math.min(SHARED_MIN_M, d.width / 2)) door = true;
    }
  }
  const via = door ? 'door' : longestUncovered(lo, hi, covered) >= PASSAGE_MIN_M ? 'passage' : null;
  return { length: hi - lo, via };
}

export function roomConnectivity(plan: Pick<Plan, 'walls' | 'openings' | 'rooms'>): RoomConnectivity {
  const doorsByWall = new Map<string, { t: number; width: number }[]>();
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue;
    const list = doorsByWall.get(o.wallId) ?? [];
    list.push({ t: o.t, width: o.width });
    doorsByWall.set(o.wallId, list);
  }
  const rooms = plan.rooms.filter((r) => r.polygon.length >= 3);
  const links: RoomLink[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      let sharedM = 0;
      let via: RoomLink['via'] = null;
      for (const e of edgesOf(rooms[i].polygon)) {
        for (const f of edgesOf(rooms[j].polygon)) {
          const s = sharedBoundary(e, f, plan.walls, doorsByWall);
          if (!s) continue;
          sharedM += s.length;
          if (s.via === 'door' || (s.via === 'passage' && via === null)) via = s.via;
        }
      }
      if (sharedM > 0) {
        links.push({ a: rooms[i].id, b: rooms[j].id, sharedM: Number(sharedM.toFixed(2)), via });
      }
    }
  }

  const parent = new Map(rooms.map((r) => [r.id, r.id]));
  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    return cur;
  };
  const linked = new Set<string>();
  for (const l of links) {
    if (!l.via) continue;
    linked.add(l.a);
    linked.add(l.b);
    parent.set(find(l.a), find(l.b));
  }
  const groupCount = new Set(rooms.map((r) => find(r.id))).size;
  const isolatedRoomIds = rooms.length >= 2 ? rooms.filter((r) => !linked.has(r.id)).map((r) => r.id) : [];
  return { links, isolatedRoomIds, groupCount };
}
