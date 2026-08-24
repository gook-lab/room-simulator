import type { Plan, Room, Wall } from './types';
import { pointInPolygon } from './geometry';

/** 바닥 마감재 팔레트 — color2d는 도면 룸 채움, color3d는 3D 머티리얼 */
export type FloorFinish = {
  id: string;
  label: string;
  color2d: string;
  color3d: string;
};

export const FLOOR_FINISHES: FloorFinish[] = [
  { id: 'wood-oak', label: '원목 오크', color2d: '#f6efe2', color3d: '#c9ae86' },
  { id: 'wood-walnut', label: '원목 월넛', color2d: '#efe4d4', color3d: '#a98b63' },
  { id: 'herringbone', label: '헤링본', color2d: '#f4ecdd', color3d: '#bfa075' },
  { id: 'tile-white', label: '화이트 타일', color2d: '#f7f7f4', color3d: '#e8e8e2' },
  { id: 'tile-grey', label: '그레이 타일', color2d: '#eef0ef', color3d: '#b9bfbc' },
  { id: 'marble', label: '마블', color2d: '#f5f4f1', color3d: '#ddd8ce' },
  { id: 'vinyl', label: '장판(우드)', color2d: '#f8f2e6', color3d: '#d4b98d' },
  { id: 'concrete', label: '콘크리트', color2d: '#f0efec', color3d: '#a8a49c' },
];

/** 벽 마감(벽지 색) 팔레트 */
export type WallFinish = {
  id: string;
  label: string;
  color3d: string;
};

export const WALL_FINISHES: WallFinish[] = [
  { id: 'white', label: '화이트', color3d: '#f2ede3' },
  { id: 'cream', label: '크림', color3d: '#eae1d2' },
  { id: 'greige', label: '그레이지', color3d: '#d8d0c2' },
  { id: 'sage', label: '세이지', color3d: '#c3cec2' },
  { id: 'skyblue', label: '스카이', color3d: '#ccd8e2' },
  { id: 'blush', label: '블러시', color3d: '#e8d5c8' },
  { id: 'charcoal', label: '차콜', color3d: '#5a615c' },
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
 * 벽 세그먼트의 3D 색: 세그먼트 중점 양쪽(법선 ± (두께/2+0.1m))을 샘플해
 * 닿은 룸의 wallFinish를 적용. 두 룸이 다른 finish면 첫 샘플 우선(한계 — STATUS 기록).
 */
export function resolveWallColor(
  rooms: Room[],
  wall: Wall,
  segMid: { x: number; y: number },
): string {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (len < 1e-6) return DEFAULT_WALL_3D;
  const nx = -(wall.b.y - wall.a.y) / len;
  const ny = (wall.b.x - wall.a.x) / len;
  const off = wall.thickness / 2 + 0.1;
  for (const sign of [1, -1]) {
    const p = { x: segMid.x + nx * off * sign, y: segMid.y + ny * off * sign };
    const room = rooms.find((r) => pointInPolygon(p, r.polygon));
    const color = wallFinishColor(room?.wallFinish);
    if (color) return color;
  }
  return DEFAULT_WALL_3D;
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
