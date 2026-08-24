import type { Opening, Plan, Wall } from '../../model/types';

export const DOOR_HEIGHT = 2.0;
export const WINDOW_SILL = 0.9;
export const WINDOW_HEAD = 2.1;

/** 벽 로컬 길이 방향 구간 박스 (bottom~top: 높이 구간) */
export type WallBox = {
  /** 벽 a→b 방향 시작/끝 (m) */
  start: number;
  end: number;
  bottom: number;
  top: number;
  kind: 'solid' | 'glass';
};

export function wallLength(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

/** 개구부를 반영해 벽을 3D 박스 목록으로 분할 */
export function wallBoxes(wall: Wall, openings: Opening[]): WallBox[] {
  const len = wallLength(wall);
  const H = wall.height;
  const ops = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      start: Math.max(0, o.t * len - o.width / 2),
      end: Math.min(len, o.t * len + o.width / 2),
      kind: o.kind,
    }))
    .sort((a, b) => a.start - b.start);

  const boxes: WallBox[] = [];
  let cursor = 0;
  for (const op of ops) {
    if (op.start > cursor) {
      boxes.push({ start: cursor, end: op.start, bottom: 0, top: H, kind: 'solid' });
    }
    if (op.kind === 'door') {
      boxes.push({ start: op.start, end: op.end, bottom: DOOR_HEIGHT, top: H, kind: 'solid' });
    } else {
      boxes.push({ start: op.start, end: op.end, bottom: 0, top: WINDOW_SILL, kind: 'solid' });
      boxes.push({ start: op.start, end: op.end, bottom: WINDOW_HEAD, top: H, kind: 'solid' });
      boxes.push({ start: op.start, end: op.end, bottom: WINDOW_SILL, top: WINDOW_HEAD, kind: 'glass' });
    }
    cursor = Math.max(cursor, op.end);
  }
  if (cursor < len) {
    boxes.push({ start: cursor, end: len, bottom: 0, top: H, kind: 'solid' });
  }
  return boxes.filter((b) => b.end - b.start > 1e-4 && b.top - b.bottom > 1e-4);
}

/** 통행 가능(문) 구간을 제외한, 충돌용 벽 서브 세그먼트 (2D, 벽 길이 방향) */
export function collisionSpans(wall: Wall, openings: Opening[]): { start: number; end: number }[] {
  const len = wallLength(wall);
  const doors = openings
    .filter((o) => o.wallId === wall.id && o.kind === 'door')
    .map((o) => ({
      start: Math.max(0, o.t * len - o.width / 2),
      end: Math.min(len, o.t * len + o.width / 2),
    }))
    .sort((a, b) => a.start - b.start);

  const spans: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const d of doors) {
    if (d.start > cursor) spans.push({ start: cursor, end: d.start });
    cursor = Math.max(cursor, d.end);
  }
  if (cursor < len) spans.push({ start: cursor, end: len });
  return spans.filter((s) => s.end - s.start > 1e-4);
}

export function planCenter(plan: Plan): { x: number; y: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of plan.walls) {
    xs.push(w.a.x, w.b.x);
    ys.push(w.a.y, w.b.y);
  }
  if (xs.length === 0) return { x: 0, y: 0 };
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
