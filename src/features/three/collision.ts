import type { Plan, Vec2 } from '../../model/types';
import { itemCorners } from '../../model/geometry';
import { NON_COLLIDING_SHAPES, shapeOf } from '../editor2d/symbols';
import { collisionSpans } from './wallGeometry';

export const PLAYER_RADIUS = 0.25;

/** 이 높이 이하의 오브젝트(러그·커피 테이블류)는 걸어서 지나칠 수 있다 */
export const WALKOVER_HEIGHT = 0.4;

/**
 * 가구는 벽(0.25m)보다 완화된 유효 반경을 쓴다 — 좁은 가구 사이 통로에서
 * 끼임을 줄이기 위한 패딩 보정 (유효 반경 0.25 - 0.07 = 0.18m).
 */
export const FURNITURE_PAD = -0.07;

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
    if (item.size.h <= WALKOVER_HEIGHT) continue; // 낮은 오브젝트는 통과
    const corners = itemCorners(item);
    for (let i = 0; i < 4; i++) {
      out.push({ a: corners[i], b: corners[(i + 1) % 4], pad: FURNITURE_PAD });
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
      if (minDist <= 0) continue;
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

/** 현재 위치에서 접촉 중인(반경+eps 이내) 콜라이더들의 법선 */
function contactNormals(pos: Vec2, colliders: SegCollider[], radius: number, eps: number): Vec2[] {
  const normals: Vec2[] = [];
  for (const c of colliders) {
    const minDist = radius + c.pad;
    if (minDist <= 0) continue;
    const cp = closestOnSeg(pos, c.a, c.b);
    const dx = pos.x - cp.x;
    const dy = pos.y - cp.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6 && d < minDist + eps) {
      normals.push({ x: dx / d, y: dy / d });
    }
  }
  return normals;
}

/**
 * 슬라이딩 이동: 접촉면 법선으로 들어가는 이동 성분만 제거(접선 투영)하고
 * 나머지는 그대로 진행한다. 벽에 비스듬히 걸어도 접선 방향 속도가 보존되어
 * "끼임" 없이 미끄러진다. 코너(법선 2개 동시 접촉)는 2패스 순차 투영으로
 * 양쪽 다 막힐 때만 정지. 마지막에 침투 해소로 관통을 보증한다.
 */
export function moveAndSlide(
  pos: Vec2,
  delta: Vec2,
  colliders: SegCollider[],
  radius: number,
): Vec2 {
  const d = { ...delta };
  const normals = contactNormals(pos, colliders, radius, 0.03);
  for (let pass = 0; pass < 2; pass++) {
    for (const n of normals) {
      const dot = d.x * n.x + d.y * n.y;
      if (dot < 0) {
        d.x -= dot * n.x;
        d.y -= dot * n.y;
      }
    }
  }
  return resolveCollisions({ x: pos.x + d.x, y: pos.y + d.y }, colliders, radius);
}
