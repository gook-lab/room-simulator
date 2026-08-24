import { useMemo } from 'react';
import type { Plan, Vec2 } from '../../model/types';
import { planBounds } from '../../model/geometry';
import { itemLayer } from '../editor2d/PlanCanvas';

export type PlayerPose = { pos: Vec2; yawDeg: number };

/** 1d 우상단 미니맵: 흰 벽 스트로크 + 가구 블록 + 현재 위치/시야 콘 */
export function Minimap({
  plan,
  pose,
  width = 218,
  height = 150,
}: {
  plan: Plan;
  pose: PlayerPose;
  width?: number;
  height?: number;
}) {
  const view = useMemo(() => {
    const b = planBounds(plan);
    const pad = 12;
    const s = Math.min(
      (width - pad * 2) / Math.max(0.1, b.max.x - b.min.x),
      (height - pad * 2) / Math.max(0.1, b.max.y - b.min.y),
    );
    const ox = (width - (b.max.x - b.min.x) * s) / 2 - b.min.x * s;
    const oy = (height - (b.max.y - b.min.y) * s) / 2 - b.min.y * s;
    return { s, ox, oy };
  }, [plan, width, height]);

  const { s, ox, oy } = view;
  const px = pose.pos.x * s + ox;
  const py = pose.pos.y * s + oy;
  const yaw = (pose.yawDeg * Math.PI) / 180;
  const coneR = 26;
  const spread = 0.55;

  return (
    <svg width={width} height={height}>
      {/* 가구 블록 */}
      {plan.items
        .filter((i) => itemLayer(i) === 1)
        .map((i) => (
          <rect
            key={i.id}
            x={-i.size.w / 2}
            y={-i.size.d / 2}
            width={i.size.w}
            height={i.size.d}
            fill="#9fb0a7"
            opacity={0.7}
            transform={`translate(${i.position.x * s + ox} ${i.position.y * s + oy}) rotate(${i.rotationDeg}) scale(${s})`}
          />
        ))}
      {/* 벽 */}
      {plan.walls.map((w) => (
        <line
          key={w.id}
          x1={w.a.x * s + ox}
          y1={w.a.y * s + oy}
          x2={w.b.x * s + ox}
          y2={w.b.y * s + oy}
          stroke="#ffffff"
          strokeWidth={Math.max(3, w.thickness * s * 1.6)}
          strokeLinecap="square"
          opacity={0.85}
        />
      ))}
      {/* 시야 콘 */}
      <path
        d={`M ${px} ${py} L ${px + Math.cos(yaw - spread) * coneR} ${py + Math.sin(yaw - spread) * coneR} A ${coneR} ${coneR} 0 0 1 ${px + Math.cos(yaw + spread) * coneR} ${py + Math.sin(yaw + spread) * coneR} Z`}
        fill="#0e9f6e"
        opacity={0.3}
      />
      {/* 현재 위치 */}
      <circle cx={px} cy={py} r={7} fill="#0e9f6e" stroke="#ffffff" strokeWidth={2.5} />
    </svg>
  );
}
