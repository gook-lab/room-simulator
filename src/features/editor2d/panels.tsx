import { useEffect, useState } from 'react';
import type { CatalogCategory, PlacedItem, Tool } from '../../model/types';
import { FLOOR_FINISHES, WALL_FINISHES, setRoomFinish } from '../../model/finishes';
import { isWallCatalogItem, moveWallItem } from '../../model/wallItems';
import { deleteOpening, updateOpening } from '../../model/wallEdit';
import { toggleDoor } from '../../model/interactions3d';
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
      <path d="M2.5 8.5h4M13.5 8.5h4" strokeWidth={2.4} />
      <path d="M6.5 7v3M13.5 7v3" />
      <path d="M7.5 8.5h5" strokeDasharray="0.1 2.2" strokeWidth={2} />
      <path d="M4 14.5h12" opacity="0.45" />
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
  // 벽 부착 소품은 정면 뷰(w×h)로
  const d = (isWallCatalogItem(catalogId) ? cat.size.h : cat.size.d) + pad * 2;
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

/** 룸 선택 시: 바닥재·벽지 마감 편집 패널 */
function RoomInspector({ roomId }: { roomId: string }) {
  const plan = useCurrentPlan();
  const updatePlan = useStore((s) => s.updatePlan);
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return null;

  const patch = (p: { floorFinish?: string | null; wallFinish?: string | null }) =>
    updatePlan((pl) => setRoomFinish(pl, room.id, p), { coalesceKey: `finish-${room.id}` });

  return (
    <aside className="float-panel inspector">
      <div className="panel-header">
        <span className="panel-header__title">{room.name}</span>
        <span className="badge-accent">{room.areaSqm.toFixed(1)}㎡</span>
      </div>
      <div className="inspector__swatches">
        <span className="inspector__swatch-label">바닥 마감</span>
        <div className="finish-list scroll-y">
          {FLOOR_FINISHES.map((f) => (
            <button
              key={f.id}
              className={`detail-option${room.floorFinish === f.id ? ' is-active' : ''}`}
              onClick={() => patch({ floorFinish: room.floorFinish === f.id ? null : f.id })}
            >
              <span className="detail-option__dot" style={{ background: f.color3d }} />
              {f.label}
              {room.floorFinish === f.id && <span className="detail-option__check">✓</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector__swatches">
        <span className="inspector__swatch-label">벽지</span>
        <div className="inspector__swatch-row" style={{ flexWrap: 'wrap' }}>
          {WALL_FINISHES.map((f) => (
            <button
              key={f.id}
              className={`swatch${room.wallFinish === f.id ? ' is-active' : ''}`}
              style={{ background: f.color3d }}
              title={f.label}
              onClick={() => patch({ wallFinish: room.wallFinish === f.id ? null : f.id })}
            />
          ))}
        </div>
      </div>
      <div className="inspector__footer">
        <span className="inspector__price" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          다시 클릭하면 기본 마감으로
        </span>
      </div>
    </aside>
  );
}

/** 개구부(문·창) 선택 시 속성 패널 — 타입·스윙·폭·개폐·삭제 */
function OpeningInspector({ openingId }: { openingId: string }) {
  const plan = useCurrentPlan();
  const updatePlan = useStore((s) => s.updatePlan);
  const setSelection = useStore((s) => s.setSelection);
  const opening = plan.openings.find((o) => o.id === openingId);
  if (!opening) return null;
  const isDoor = opening.kind === 'door';
  const sliding = opening.doorType === 'sliding';

  const patch = (p: Parameters<typeof updateOpening>[2]) =>
    updatePlan((pl) => updateOpening(pl, opening.id, p), {
      coalesceKey: `opening-${opening.id}`,
    });

  return (
    <aside className="float-panel inspector">
      <div className="panel-header">
        <span className="panel-header__title">
          {isDoor ? (sliding ? '미닫이문' : '여닫이문') : '창'}
        </span>
        <span className="badge-accent">개구부</span>
      </div>

      {isDoor && (
        <div className="inspector__swatches">
          <span className="inspector__swatch-label">문 형식</span>
          <div className="seg-row">
            <button
              className={`seg${!sliding ? ' is-active' : ''}`}
              onClick={() => patch({ doorType: 'hinged' })}
            >
              여닫이
            </button>
            <button
              className={`seg${sliding ? ' is-active' : ''}`}
              onClick={() => patch({ doorType: 'sliding' })}
            >
              미닫이
            </button>
          </div>
        </div>
      )}

      {isDoor && !sliding && (
        <div className="inspector__swatches">
          <span className="inspector__swatch-label">스윙 방향</span>
          <div className="seg-row">
            <button
              className={`seg${opening.swing !== 'right' ? ' is-active' : ''}`}
              onClick={() => patch({ swing: 'left' })}
            >
              왼쪽 경첩
            </button>
            <button
              className={`seg${opening.swing === 'right' ? ' is-active' : ''}`}
              onClick={() => patch({ swing: 'right' })}
            >
              오른쪽 경첩
            </button>
          </div>
        </div>
      )}

      <div className="inspector__grid" style={{ gridTemplateColumns: '1fr' }}>
        <NumField
          label="폭"
          value={Number(opening.width.toFixed(2))}
          suffix="m"
          onCommit={(v) => patch({ width: Math.min(3.0, Math.max(0.5, v)) })}
        />
      </div>

      {isDoor && (
        <div className="inspector__swatches inspector__detail-row" style={{ paddingBottom: 14 }}>
          <span className="inspector__swatch-label" style={{ marginBottom: 0 }}>
            열림 상태
          </span>
          <button
            className={`toggle${opening.open !== false ? ' is-on' : ''}`}
            aria-pressed={opening.open !== false}
            onClick={() => updatePlan((pl) => toggleDoor(pl, opening.id))}
          />
        </div>
      )}

      <div className="inspector__footer">
        <span className="inspector__price" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {isDoor ? '재클릭 시 여닫기' : '벽 위 개구부'}
        </span>
        <button
          className="btn btn--outline detail-danger"
          onClick={() => {
            updatePlan((pl) => deleteOpening(pl, opening.id));
            setSelection([]);
          }}
        >
          삭제
        </button>
      </div>
    </aside>
  );
}

/** 벽 부착 아이템 선택 시 패널 */
function WallItemInspector({ wallItemId }: { wallItemId: string }) {
  const plan = useCurrentPlan();
  const updatePlan = useStore((s) => s.updatePlan);
  const setSelection = useStore((s) => s.setSelection);
  const wi = (plan.wallItems ?? []).find((w) => w.id === wallItemId);
  const cat = wi ? catalogById.get(wi.catalogId) : undefined;
  if (!wi || !cat) return null;

  return (
    <aside className="float-panel inspector">
      <div className="panel-header">
        <span className="panel-header__title">{cat.name}</span>
        <span className="badge-accent">벽 부착</span>
      </div>
      <div className="inspector__grid" style={{ gridTemplateColumns: '1fr' }}>
        <NumField
          label="부착 높이"
          value={Number(wi.heightM.toFixed(2))}
          suffix="m"
          onCommit={(v) =>
            updatePlan(
              (pl) => moveWallItem(pl, wi.id, { heightM: Math.min(2.3, Math.max(0.3, v)) }),
              { coalesceKey: `witem-${wi.id}` },
            )
          }
        />
      </div>
      <div className="inspector__swatches">
        <span className="inspector__swatch-label">{cat.materialLabel}</span>
        <div className="inspector__swatch-row">
          {cat.swatches.map((sw) => (
            <button
              key={sw.id}
              className={`swatch${wi.variant.material === sw.id ? ' is-active' : ''}`}
              style={{ background: sw.color }}
              title={sw.label}
              onClick={() =>
                updatePlan(
                  (pl) => moveWallItem(pl, wi.id, { variant: { material: sw.id, color: sw.color } }),
                  { coalesceKey: `witem-${wi.id}` },
                )
              }
            />
          ))}
        </div>
      </div>
      <div className="inspector__footer">
        <span className="inspector__price">{formatPrice(wi.price)}</span>
        <button
          className="btn btn--outline detail-danger"
          onClick={() => {
            updatePlan((pl) => ({
              ...pl,
              wallItems: (pl.wallItems ?? []).filter((w) => w.id !== wi.id),
            }));
            setSelection([]);
          }}
        >
          삭제
        </button>
      </div>
    </aside>
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
  if (!item) {
    // 개구부(문·창) 선택
    if (selectedId && plan.openings.some((o) => o.id === selectedId)) {
      return <OpeningInspector openingId={selectedId} />;
    }
    // 벽 부착 아이템 선택
    if (selectedId && (plan.wallItems ?? []).some((w) => w.id === selectedId)) {
      return <WallItemInspector wallItemId={selectedId} />;
    }
    // 룸 선택이면 마감재 패널
    if (selectedId && plan.rooms.some((r) => r.id === selectedId)) {
      return <RoomInspector roomId={selectedId} />;
    }
    return null;
  }
  const cat = catalogById.get(item.catalogId);
  if (!cat) return null;

  const patch = (p: Partial<PlacedItem>) =>
    updatePlan(
      (pl) => ({
        ...pl,
        items: pl.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)),
      }),
      { coalesceKey: `item-${item.id}` },
    );

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
