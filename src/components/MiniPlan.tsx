import { useMemo } from 'react';
import type { Plan } from '../model/types';
import { planBounds } from '../model/geometry';
import { itemLayer } from '../features/editor2d/PlanCanvas';

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
    const b = planBounds(plan);
    const pad = 12;
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
