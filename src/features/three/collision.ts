import type { Plan, Vec2 } from '../../model/types';
import { itemCorners } from '../../model/geometry';
import { NON_COLLIDING_SHAPES, shapeOf } from '../editor2d/symbols';
import { collisionSpans } from './wallGeometry';

export const PLAYER_RADIUS = 0.25;

type SegCollider = { a: Vec2; b: Vec2; pad: number };

export function buildColliders(plan: Plan): SegCollider[] {
  const out: SegCollider[] = [];
  for (const wall of plan.walls) {
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (len < 1e-6) continue;
    const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
    for (const span of collisionSpans(wall, plan.openings)) {
      out.push({
        a: { x: wall.a.x + dir.x * span.start, y: wall.a.y + dir.y * span.start },
        b: { x: wall.a.x + dir.x * span.end, y: wall.a.y + dir.y * span.end },
        pad: wall.thickness / 2,
      });
    }
  }
  for (const item of plan.items) {
    if (NON_COLLIDING_SHAPES.has(shapeOf(item.catalogId))) continue;
    const corners = itemCorners(item);
    for (let i = 0; i < 4; i++) {
      out.push({ a: corners[i], b: corners[(i + 1) % 4], pad: 0 });
    }
  }
  return out;
}

function closestOnSeg(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** 반경 radius 원을 콜라이더 밖으로 밀어냄 (3회 반복 해소) */
export function resolveCollisions(pos: Vec2, colliders: SegCollider[], radius: number): Vec2 {
  const p = { ...pos };
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const c of colliders) {
      const minDist = radius + c.pad;
      const cp = closestOnSeg(p, c.a, c.b);
      const dx = p.x - cp.x;
      const dy = p.y - cp.y;
      const d = Math.hypot(dx, dy);
      if (d < minDist) {
        if (d < 1e-6) {
          // 정확히 선 위 — 세그먼트 법선 방향으로 밀기
          const sx = c.b.x - c.a.x;
          const sy = c.b.y - c.a.y;
          const sl = Math.hypot(sx, sy) || 1;
          p.x += (-sy / sl) * minDist;
          p.y += (sx / sl) * minDist;
        } else {
          p.x = cp.x + (dx / d) * minDist;
          p.y = cp.y + (dy / d) * minDist;
        }
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return p;
}
