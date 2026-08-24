import type { Plan, Room, Wall } from './types';
import { pointInPolygon } from './geometry';

/** 바닥 마감재 팔레트 — color2d는 도면 룸 채움, color3d는 3D 머티리얼 */
export type FloorFinish = {
  id: string;
  label: string;
  color2d: string;
  color3d: string;
  /** 시공 단가 (원/㎡) — 견적 반영 */
  priceSqm: number;
};

export const FLOOR_FINISHES: FloorFinish[] = [
  { id: 'wood-oak', label: '원목 오크', color2d: '#f6efe2', color3d: '#c9ae86', priceSqm: 85_000 },
  { id: 'wood-walnut', label: '원목 월넛', color2d: '#efe4d4', color3d: '#a98b63', priceSqm: 95_000 },
  { id: 'herringbone', label: '헤링본', color2d: '#f4ecdd', color3d: '#bfa075', priceSqm: 120_000 },
  { id: 'tile-white', label: '화이트 타일', color2d: '#f7f7f4', color3d: '#e8e8e2', priceSqm: 60_000 },
  { id: 'tile-grey', label: '그레이 타일', color2d: '#eef0ef', color3d: '#b9bfbc', priceSqm: 60_000 },
  { id: 'marble', label: '마블', color2d: '#f5f4f1', color3d: '#ddd8ce', priceSqm: 150_000 },
  { id: 'vinyl', label: '장판(우드)', color2d: '#f8f2e6', color3d: '#d4b98d', priceSqm: 35_000 },
  { id: 'concrete', label: '콘크리트', color2d: '#f0efec', color3d: '#a8a49c', priceSqm: 45_000 },
];

/** 벽 마감(벽지 색) 팔레트 */
export type WallFinish = {
  id: string;
  label: string;
  color3d: string;
  /** 시공 단가 (원/㎡, 벽면적 기준) — 견적 반영 */
  priceSqm: number;
};

export const WALL_FINISHES: WallFinish[] = [
  { id: 'white', label: '화이트', color3d: '#f2ede3', priceSqm: 12_000 },
  { id: 'cream', label: '크림', color3d: '#eae1d2', priceSqm: 12_000 },
  { id: 'greige', label: '그레이지', color3d: '#d8d0c2', priceSqm: 14_000 },
  { id: 'sage', label: '세이지', color3d: '#c3cec2', priceSqm: 15_000 },
  { id: 'skyblue', label: '스카이', color3d: '#ccd8e2', priceSqm: 15_000 },
  { id: 'blush', label: '블러시', color3d: '#e8d5c8', priceSqm: 15_000 },
  { id: 'charcoal', label: '차콜', color3d: '#5a615c', priceSqm: 16_000 },
];

const floorById = new Map(FLOOR_FINISHES.map((f) => [f.id, f]));
const wallById = new Map(WALL_FINISHES.map((f) => [f.id, f]));

/** 용도(FloorKind)별 기본 2D 룸 채움색 (기존 팔레트) */
const DEFAULT_FLOOR_2D: Record<Room['floor'], string> = {
  living: '#fbf8f3',
  kitchen: '#f5f1ea',
  bath: '#f0f4f2',
};

const DEFAULT_FLOOR_3D: Record<Room['floor'], string> = {
  living: '#c9ae86',
  kitchen: '#ddd8ce',
  bath: '#dce9e4',
};

export const DEFAULT_WALL_3D = '#eae1d2';

export function floorColor2d(room: Room): string {
  return floorById.get(room.floorFinish ?? '')?.color2d ?? DEFAULT_FLOOR_2D[room.floor];
}

export function floorColor3d(room: Room): string {
  return floorById.get(room.floorFinish ?? '')?.color3d ?? DEFAULT_FLOOR_3D[room.floor];
}

export function wallFinishColor(id: string | undefined): string | null {
  return wallById.get(id ?? '')?.color3d ?? null;
}

/**
 * 벽 세그먼트 양면의 벽지 색.
 * front = 법선 +측(세그먼트 중점 + normal 방향 샘플), back = -측.
 * 해당 면에 닿은 룸이 없거나 finish 미지정이면 null.
 */
export function wallFaceColors(
  rooms: Room[],
  wall: Wall,
  segMid: { x: number; y: number },
): { front: string | null; back: string | null } {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (len < 1e-6) return { front: null, back: null };
  const nx = -(wall.b.y - wall.a.y) / len;
  const ny = (wall.b.x - wall.a.x) / len;
  const off = wall.thickness / 2 + 0.1;
  const sample = (sign: number) => {
    const p = { x: segMid.x + nx * off * sign, y: segMid.y + ny * off * sign };
    const room = rooms.find((r) => pointInPolygon(p, r.polygon));
    return wallFinishColor(room?.wallFinish);
  };
  return { front: sample(1), back: sample(-1) };
}

/**
 * 벽 세그먼트의 대표 3D 색 (면 분리가 필요 없을 때).
 * 양면 중 지정된 finish가 있으면 그 색, 없으면 기본 벽색.
 */
export function resolveWallColor(
  rooms: Room[],
  wall: Wall,
  segMid: { x: number; y: number },
): string {
  const { front, back } = wallFaceColors(rooms, wall, segMid);
  return front ?? back ?? DEFAULT_WALL_3D;
}

/** 폴리곤 둘레 (m) */
function polygonPerimeter(poly: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

const WALL_HEIGHT_FOR_COST = 2.4;

export type FinishCostRow = {
  roomId: string;
  roomName: string;
  /** 적용 마감 라벨 (바닥·벽지 중 지정된 것) */
  labels: string[];
  sum: number;
};

/**
 * 룸별 마감 시공비: 바닥 = 단가 × 룸 면적, 벽지 = 단가 × (둘레 × 벽고 2.4m).
 * 개구부 면적 차감은 하지 않는 근사입니다.
 */
export function finishCost(plan: Plan): { rows: FinishCostRow[]; total: number } {
  const rows: FinishCostRow[] = [];
  for (const room of plan.rooms) {
    const floor = floorById.get(room.floorFinish ?? '');
    const wallF = wallById.get(room.wallFinish ?? '');
    if (!floor && !wallF) continue;
    let sum = 0;
    const labels: string[] = [];
    if (floor) {
      sum += Math.round(floor.priceSqm * room.areaSqm);
      labels.push(floor.label);
    }
    if (wallF) {
      sum += Math.round(wallF.priceSqm * polygonPerimeter(room.polygon) * WALL_HEIGHT_FOR_COST);
      labels.push(wallF.label);
    }
    rows.push({ roomId: room.id, roomName: room.name, labels, sum });
  }
  return { rows, total: rows.reduce((s, r) => s + r.sum, 0) };
}

/** plan에 룸 마감 patch 적용 (undo 대상 — updatePlan commit 경로로 호출) */
export function setRoomFinish(
  plan: Plan,
  roomId: string,
  patch: { floorFinish?: string | null; wallFinish?: string | null },
): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  return {
    ...plan,
    rooms: plan.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const next = { ...r };
      if (patch.floorFinish !== undefined) {
        if (patch.floorFinish === null) delete next.floorFinish;
        else next.floorFinish = patch.floorFinish;
      }
      if (patch.wallFinish !== undefined) {
        if (patch.wallFinish === null) delete next.wallFinish;
        else next.wallFinish = patch.wallFinish;
      }
      return next;
    }),
  };
}
