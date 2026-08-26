import type { Vec2 } from '../../model/types';

/**
 * 정렬 가이드 스냅 (pig `calculateAlignmentGuides` 참조) — 순수 계산.
 *
 * 드래그 바운즈의 정렬 포인트(left/centerX/right, top/centerY/bottom)를
 * 근접 대상들의 동일 포인트와 비교해, 임계 이내면 그 좌표로 스냅하고
 * 두 객체를 잇는 가이드 라인을 반환한다.
 *
 * 데드존: 임계 밖 ~ deadzone 이내 구간에서는 그리드 스냅을 억제해
 * 정렬선 바로 옆의 미세 배치가 가능하다 (스냅 우선순위:
 * 벽 붙임 > 정렬 > 데드존(자유) > 그리드 — snapItemMove 에서 조합).
 */

export type Aabb = { min: Vec2; max: Vec2 };

export type AlignmentGuide = {
  /** 'x' = 수직 가이드 라인(x=line), 'y' = 수평 가이드 라인(y=line) */
  axis: 'x' | 'y';
  line: number;
  /** 가이드 라인 구간 (axis='x' 면 y 범위, 'y' 면 x 범위) */
  from: number;
  to: number;
  targetIds: string[];
};

export type AlignmentResult = {
  /** 스냅 이동량 (해당 축에 정렬 매치가 없으면 null) */
  dx: number | null;
  dy: number | null;
  /** 데드존: 스냅은 아니지만 정렬선에 가까워 그리드 스냅을 억제해야 하는 축 */
  freeX: boolean;
  freeY: boolean;
  guides: AlignmentGuide[];
};

const pointsX = (b: Aabb) => [b.min.x, (b.min.x + b.max.x) / 2, b.max.x];
const pointsY = (b: Aabb) => [b.min.y, (b.min.y + b.max.y) / 2, b.max.y];

export function alignmentSnap(
  dragged: Aabb,
  targets: { id: string; aabb: Aabb }[],
  threshold: number,
  deadzone: number = threshold * 2,
): AlignmentResult {
  let bestX: { dist: number; delta: number; line: number } | null = null;
  let bestY: { dist: number; delta: number; line: number } | null = null;
  let minDistX = Infinity;
  let minDistY = Infinity;

  for (const t of targets) {
    for (const dp of pointsX(dragged)) {
      for (const tp of pointsX(t.aabb)) {
        const d = Math.abs(dp - tp);
        minDistX = Math.min(minDistX, d);
        if (d <= threshold && (!bestX || d < bestX.dist)) {
          bestX = { dist: d, delta: tp - dp, line: tp };
        }
      }
    }
    for (const dp of pointsY(dragged)) {
      for (const tp of pointsY(t.aabb)) {
        const d = Math.abs(dp - tp);
        minDistY = Math.min(minDistY, d);
        if (d <= threshold && (!bestY || d < bestY.dist)) {
          bestY = { dist: d, delta: tp - dp, line: tp };
        }
      }
    }
  }

  const guides: AlignmentGuide[] = [];
  const EPS = 1e-6;

  if (bestX) {
    const line = bestX.line;
    // 같은 정렬선 위의 모든 대상 → 가이드 구간은 관련 바운즈 전체
    const matched = targets.filter((t) =>
      pointsX(t.aabb).some((p) => Math.abs(p - line) < EPS),
    );
    if (matched.length > 0) {
      guides.push({
        axis: 'x',
        line,
        from: Math.min(dragged.min.y, ...matched.map((t) => t.aabb.min.y)),
        to: Math.max(dragged.max.y, ...matched.map((t) => t.aabb.max.y)),
        targetIds: matched.map((t) => t.id),
      });
    }
  }
  if (bestY) {
    const line = bestY.line;
    const matched = targets.filter((t) =>
      pointsY(t.aabb).some((p) => Math.abs(p - line) < EPS),
    );
    if (matched.length > 0) {
      guides.push({
        axis: 'y',
        line,
        from: Math.min(dragged.min.x, ...matched.map((t) => t.aabb.min.x)),
        to: Math.max(dragged.max.x, ...matched.map((t) => t.aabb.max.x)),
        targetIds: matched.map((t) => t.id),
      });
    }
  }

  return {
    dx: bestX ? bestX.delta : null,
    dy: bestY ? bestY.delta : null,
    freeX: !bestX && minDistX <= deadzone,
    freeY: !bestY && minDistY <= deadzone,
    guides,
  };
}

/** Shift 축 잠금 (Figma식): 시작점 기준 이동량이 큰 축으로만 직선 이동 */
export function axisLock(start: Vec2, candidate: Vec2): Vec2 {
  const dx = candidate.x - start.x;
  const dy = candidate.y - start.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? { x: candidate.x, y: start.y }
    : { x: start.x, y: candidate.y };
}
