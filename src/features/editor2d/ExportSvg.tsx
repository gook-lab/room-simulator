import { renderToStaticMarkup } from 'react-dom/server';
import type { Plan } from '../../model/types';
import { floorColor2d } from '../../model/finishes';
import { planBounds } from '../../model/geometry';
import { FurnitureSymbol } from './symbols';
import {
  BoundsDimensions,
  DimensionNotes,
  OpeningGlyph,
  RoomLabels,
  WallItemGlyph,
  WallLines,
  sortedItems,
} from './PlanCanvas';
import type { ViewTransform } from './view';

/**
 * 인쇄/이미지 내보내기용 정적 도면 SVG.
 * 에디터 PlanCanvas의 렌더 조각을 재사용하되 인터랙션 상태 없이 구성한다.
 * 여백: 상·우측은 외곽 치수선 자리를 넉넉히 둔다.
 */
export function PlanExportSvg({ plan, pxPerM = 90 }: { plan: Plan; pxPerM?: number }) {
  const b = planBounds(plan);
  const mL = 0.7;
  const mR = 1.1;
  const mT = 1.0;
  const mB = 0.9;
  const W = Math.max(320, Math.round((b.max.x - b.min.x + mL + mR) * pxPerM));
  const H = Math.max(240, Math.round((b.max.y - b.min.y + mT + mB) * pxPerM));
  const t: ViewTransform = {
    s: pxPerM,
    ox: (mL - b.min.x) * pxPerM,
    oy: (mT - b.min.y) * pxPerM,
  };
  const areaSum = plan.rooms.reduce((s, r) => s + r.areaSqm, 0);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fontFamily="'Plus Jakarta Sans', 'Apple SD Gothic Neo', sans-serif"
    >
      <rect width={W} height={H} fill="#ffffff" />
      <g transform={`translate(${t.ox} ${t.oy}) scale(${pxPerM})`}>
        {plan.rooms.map((r) => (
          <polygon
            key={r.id}
            points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={floorColor2d(r)}
          />
        ))}
        {sortedItems(plan).map((item) => (
          <g
            key={item.id}
            transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotationDeg})`}
          >
            <FurnitureSymbol item={item} />
          </g>
        ))}
        <WallLines plan={plan} />
        {plan.openings.map((o) => (
          <OpeningGlyph key={o.id} plan={plan} opening={o} />
        ))}
        {(plan.wallItems ?? []).map((wi) => (
          <WallItemGlyph
            key={wi.id}
            plan={plan}
            catalogId={wi.catalogId}
            wallId={wi.wallId}
            t={wi.t}
            side={wi.side}
            color={wi.variant.color}
            state="normal"
          />
        ))}
      </g>
      <RoomLabels plan={plan} t={t} />
      <BoundsDimensions plan={plan} t={t} />
      <DimensionNotes plan={plan} t={t} selection={[]} />
      {/* 푸터: 도면명 · 면적 · 축척 정보 */}
      <text x={14} y={H - 12} fontSize={12} fontWeight={600} fill="#5b6560">
        {plan.name} · {areaSum.toFixed(1)}㎡ · Roomcast
      </text>
    </svg>
  );
}

/** 독립 SVG 문자열 (CSS 변수 폰트를 실제 스택으로 치환) */
export function renderPlanSvgString(plan: Plan, pxPerM = 90): string {
  return renderToStaticMarkup(<PlanExportSvg plan={plan} pxPerM={pxPerM} />)
    .replaceAll('var(--font-mono)', 'ui-monospace, Menlo, monospace')
    .replaceAll('var(--font-ui)', "'Plus Jakarta Sans', sans-serif");
}
