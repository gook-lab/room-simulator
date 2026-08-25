import { useMemo } from 'react';
import type { Plan } from '../model/types';
import { itemAabb, planBounds } from '../model/geometry';
import { itemLayer } from '../features/editor2d/PlanCanvas';

/**
 * 썸네일용 콘텐츠 범위 — 벽만 보던 planBounds와 달리 실제로 그리는
 * 모든 요소(벽·룸 폴리곤·가구)를 포함해, 벽 밖 가구나 룸 때문에
 * 도면이 카드 밖으로 밀리거나 치우치지 않게 한다.
 */
export function thumbnailBounds(plan: Plan): { min: { x: number; y: number }; max: { x: number; y: number } } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of plan.walls) {
    xs.push(w.a.x, w.b.x);
    ys.push(w.a.y, w.b.y);
  }
  for (const r of plan.rooms) {
    for (const p of r.polygon) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  for (const i of plan.items) {
    const b = itemAabb(i);
    xs.push(b.min.x, b.max.x);
    ys.push(b.min.y, b.max.y);
  }
  if (xs.length === 0) return planBounds(plan); // 언더레이 전용/빈 문서 폴백
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

const FLOOR_COLORS: Record<string, string> = {
  living: '#fbf8f3',
  kitchen: '#f5f1ea',
  bath: '#f0f4f2',
};

/** 도면 미니 렌더 — 대시보드 카드·템플릿 선택 썸네일 공용 */
export function MiniPlan({
  plan,
  width,
  height,
}: {
  plan: Plan;
  width: number;
  height: number;
}) {
  const view = useMemo(() => {
    const b = thumbnailBounds(plan);
    // 비율 기반 패딩 — 카드 크기에 상대적이라 도면마다 여백이 일정하다
    const pad = Math.max(8, Math.round(Math.min(width, height) * 0.09));
    const s = Math.min(
      (width - pad * 2) / Math.max(0.1, b.max.x - b.min.x),
      (height - pad * 2) / Math.max(0.1, b.max.y - b.min.y),
    );
    return {
      s,
      ox: (width - (b.max.x - b.min.x) * s) / 2 - b.min.x * s,
      oy: (height - (b.max.y - b.min.y) * s) / 2 - b.min.y * s,
    };
  }, [plan, width, height]);
  const { s, ox, oy } = view;

  return (
    <svg width={width} height={height}>
      {plan.rooms.map((r) => (
        <polygon
          key={r.id}
          points={r.polygon.map((p) => `${p.x * s + ox},${p.y * s + oy}`).join(' ')}
          fill={FLOOR_COLORS[r.floor] ?? '#fbf8f3'}
        />
      ))}
      {plan.items.map((i) => (
        <rect
          key={i.id}
          x={-i.size.w / 2}
          y={-i.size.d / 2}
          width={i.size.w}
          height={i.size.d}
          fill={i.variant.color}
          opacity={itemLayer(i) === 2 ? 0.6 : 0.9}
          transform={`translate(${i.position.x * s + ox} ${i.position.y * s + oy}) rotate(${i.rotationDeg}) scale(${s})`}
        />
      ))}
      {plan.walls.map((w) => (
        <line
          key={w.id}
          x1={w.a.x * s + ox}
          y1={w.a.y * s + oy}
          x2={w.b.x * s + ox}
          y2={w.b.y * s + oy}
          stroke="#3d4742"
          strokeWidth={Math.max(2, w.thickness * s)}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}
