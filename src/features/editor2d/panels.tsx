import { useEffect, useState } from 'react';
import type { CatalogCategory, PlacedItem, Tool } from '../../model/types';
import { isInteractiveItem, isPowered, togglePower } from '../../model/interactions3d';
import {
  CATALOG,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  catalogById,
  formatPrice,
  formatSize,
} from '../../model/catalog';
import { useCurrentPlan, useStore } from '../../state/store';
import { FurnitureSymbol } from './symbols';
import { occupancyPct } from './interactions';
import { scaleRatioLabel, type ViewTransform } from './view';

/* ===== 툴 독 ===== */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ICONS: Record<string, React.ReactNode> = {
  select: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <path d="M5 3l10 7-4.2 1.2L9.5 16z" />
    </svg>
  ),
  wall: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <path d="M12.5 3.5l4 4L7 17l-4.5.5L3 13z" />
      <path d="M11 5l4 4" />
    </svg>
  ),
  door: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <path d="M4 17h12" />
      <path d="M6 17V4h8v13" />
      <circle cx="11.6" cy="10.5" r="0.8" />
    </svg>
  ),
  window: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <rect x="3.5" y="5.5" width="13" height="9" rx="1" />
      <path d="M10 5.5v9M3.5 10h13" />
    </svg>
  ),
  dimension: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <path d="M3 15h14M3 12.5v5M17 12.5v5" />
      <path d="M6 8l8-4" strokeDasharray="2.5 2" />
    </svg>
  ),
  zoom: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2L17 17" />
    </svg>
  ),
};

const TOOLS: { tool: Tool; icon: string; label: string; key: string }[] = [
  { tool: 'select', icon: 'select', label: '선택 (V)', key: 'V' },
  { tool: 'wall', icon: 'wall', label: '벽 그리기 (W)', key: 'W' },
  { tool: 'door', icon: 'door', label: '문 (D)', key: 'D' },
  { tool: 'window', icon: 'window', label: '창 (N)', key: 'N' },
  { tool: 'dimension', icon: 'dimension', label: '치수 (M)', key: 'M' },
];

export function ToolDock({ onResetView }: { onResetView: () => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="tooldock">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tooldock__btn${tool === t.tool ? ' is-active' : ''}`}
          title={t.label}
          onClick={() => setTool(t.tool)}
        >
          {ICONS[t.icon]}
        </button>
      ))}
      <div className="tooldock__divider" />
      <button className="tooldock__btn" title="뷰 리셋" onClick={onResetView}>
        {ICONS.zoom}
      </button>
    </div>
  );
}

/* ===== 가구 카탈로그 ===== */

function Thumb({ catalogId }: { catalogId: string }) {
  const cat = catalogById.get(catalogId)!;
  const pad = 0.15;
  const w = cat.size.w + pad * 2;
  const d = cat.size.d + pad * 2;
  const fake: PlacedItem = {
    id: `thumb-${catalogId}`,
    catalogId,
    position: { x: 0, y: 0 },
    rotationDeg: 0,
    size: { ...cat.size },
    variant: { material: cat.swatches[0].id, color: cat.swatches[0].color },
    roomId: null,
    price: cat.price,
  };
  return (
    <svg
      viewBox={`${-w / 2} ${-d / 2} ${w} ${d}`}
      preserveAspectRatio="xMidYMid meet"
      className="catalog-thumb__svg"
    >
      <FurnitureSymbol item={fake} />
    </svg>
  );
}

export function CatalogPanel() {
  const [category, setCategory] = useState<CatalogCategory>('sofa');
  const placing = useStore((s) => s.placingCatalogId);
  const setPlacing = useStore((s) => s.setPlacing);
  const items = CATALOG.filter((c) => c.category === category);

  return (
    <aside className="float-panel catalog-panel">
      <div className="panel-header">
        <span className="panel-header__title">가구 카탈로그</span>
        <span className="panel-header__meta">{CATALOG.length.toLocaleString()}</span>
      </div>
      <div className="pills">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            className={`pill${category === c ? ' is-active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="catalog-grid scroll-y">
        {items.map((c) => {
          const isPlacing = placing === c.id;
          return (
            <button
              key={c.id}
              className="catalog-item"
              onClick={() => setPlacing(isPlacing ? null : c.id)}
              title={`${c.name} 배치`}
            >
              <span className={`catalog-thumb${isPlacing ? ' is-placing' : ''}`}>
                {isPlacing && <span className="catalog-thumb__badge">배치중</span>}
                <Thumb catalogId={c.id} />
              </span>
              <span className="catalog-item__name">{c.name}</span>
              <span className="catalog-item__size mono">{formatSize(c)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ===== 인스펙터 ===== */

function NumField({
  label,
  value,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  suffix: string;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (!Number.isNaN(v)) onCommit(v);
    else setText(String(value));
  };
  return (
    <label className="inspector__cell">
      <span className="inspector__cell-label mono">{label}</span>
      <span className="inspector__cell-value">
        <input
          className="inspector__input mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="inspector__suffix">{suffix}</span>
      </span>
    </label>
  );
}

export function Inspector() {
  const plan = useCurrentPlan();
  const selection = useStore((s) => s.selection);
  const updatePlan = useStore((s) => s.updatePlan);
  const setSelection = useStore((s) => s.setSelection);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedId = selection.length === 1 ? selection[0] : undefined;
  // 선택이 바뀌면 상세 옵션 접기
  useEffect(() => setDetailOpen(false), [selectedId]);
  const item = selectedId ? plan.items.find((i) => i.id === selectedId) : undefined;
  if (!item) return null;
  const cat = catalogById.get(item.catalogId);
  if (!cat) return null;

  const patch = (p: Partial<PlacedItem>) =>
    updatePlan((pl) => ({
      ...pl,
      items: pl.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)),
    }));

  return (
    <aside className="float-panel inspector">
      <div className="panel-header">
        <span className="panel-header__title">{cat.name}</span>
        <span className="badge-accent">선택됨</span>
      </div>
      <div className="inspector__grid">
        <NumField
          label="X"
          value={Number(item.position.x.toFixed(2))}
          suffix="m"
          onCommit={(v) => patch({ position: { ...item.position, x: v } })}
        />
        <NumField
          label="Y"
          value={Number(item.position.y.toFixed(2))}
          suffix="m"
          onCommit={(v) => patch({ position: { ...item.position, y: v } })}
        />
        <NumField
          label="회전"
          value={Math.round(((item.rotationDeg % 360) + 360) % 360)}
          suffix="°"
          onCommit={(v) => patch({ rotationDeg: v })}
        />
        <NumField
          label="높이"
          value={Number(item.size.h.toFixed(2))}
          suffix="m"
          onCommit={(v) => patch({ size: { ...item.size, h: Math.max(0.02, v) } })}
        />
      </div>
      <div className="inspector__swatches">
        <span className="inspector__swatch-label">{cat.materialLabel}</span>
        <div className="inspector__swatch-row">
          {cat.swatches.map((sw) => (
            <button
              key={sw.id}
              className={`swatch${item.variant.material === sw.id ? ' is-active' : ''}`}
              style={{ background: sw.color }}
              title={sw.label}
              onClick={() => patch({ variant: { material: sw.id, color: sw.color } })}
            />
          ))}
        </div>
      </div>
      <div className="inspector__footer">
        <span className="inspector__price">{formatPrice(item.price)}</span>
        <button
          className="btn btn--outline"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen((v) => !v)}
        >
          {detailOpen ? '상세 옵션 닫기' : '상세 옵션'}
        </button>
      </div>
      {detailOpen && (
        <div className="inspector__detail">
          <div className="inspector__detail-section">
            <span className="inspector__swatch-label">{cat.materialLabel} 선택</span>
            {cat.swatches.map((sw) => (
              <button
                key={sw.id}
                className={`detail-option${item.variant.material === sw.id ? ' is-active' : ''}`}
                onClick={() => patch({ variant: { material: sw.id, color: sw.color } })}
              >
                <span className="detail-option__dot" style={{ background: sw.color }} />
                {sw.label}
                {item.variant.material === sw.id && <span className="detail-option__check">✓</span>}
              </button>
            ))}
          </div>
          {isInteractiveItem(item.catalogId) && (
            <div className="inspector__detail-section inspector__detail-row">
              <span className="inspector__swatch-label" style={{ marginBottom: 0 }}>
                전원
              </span>
              <button
                className={`toggle${isPowered(item) ? ' is-on' : ''}`}
                aria-pressed={isPowered(item)}
                onClick={() => updatePlan((pl) => togglePower(pl, item.id))}
              />
            </div>
          )}
          <div className="inspector__detail-actions">
            <button
              className="btn btn--outline"
              onClick={() => {
                const copy: PlacedItem = {
                  ...item,
                  id: `item-${Date.now().toString(36)}`,
                  position: { x: item.position.x + 0.3, y: item.position.y + 0.3 },
                };
                updatePlan((pl) => ({ ...pl, items: [...pl.items, copy] }));
                setSelection([copy.id]);
              }}
            >
              복제
            </button>
            <button
              className="btn btn--outline detail-danger"
              onClick={() => {
                updatePlan((pl) => ({ ...pl, items: pl.items.filter((i) => i.id !== item.id) }));
                setSelection([]);
              }}
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ===== 상태바 ===== */

export function StatusBar({ t }: { t: ViewTransform }) {
  const plan = useCurrentPlan();
  const snapping = useStore((s) => s.snapping);
  const toggleSnapping = useStore((s) => s.toggleSnapping);
  return (
    <div className="statusbar mono">
      <span>{scaleRatioLabel(t)}</span>
      <span className="statusbar__divider" />
      <button
        className={`statusbar__snap${snapping.enabled ? ' is-on' : ''}`}
        onClick={toggleSnapping}
        title="스냅 토글"
      >
        {snapping.enabled ? `스냅 켜짐 · ${snapping.gridCm} cm` : '스냅 꺼짐'}
      </button>
      <span className="statusbar__divider" />
      <span>
        가구 {plan.items.length}개 · 배치율 {occupancyPct(plan)}%
      </span>
    </div>
  );
}
