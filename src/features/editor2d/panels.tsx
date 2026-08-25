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
  searchCatalog,
} from '../../model/catalog';
import { useCurrentPlan, useStore } from '../../state/store';
import { FurnitureSymbol } from './symbols';
import { collisionsFor, findFreeSpot, occupancyPct } from './interactions';
import { blockedDoorIds } from '../../model/doorZones';
import {
  childFitsSurface,
  deleteItemsWithChildren,
  moveItemWithChildren,
  rotateItemWithChildren,
  surfaceChildren,
  unmountItem,
} from '../../model/surfaces';
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
  hand: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <path d="M7 10.5V5.2a1.1 1.1 0 0 1 2.2 0v4.1V4.1a1.1 1.1 0 0 1 2.2 0v5.2V5.6a1.1 1.1 0 0 1 2.2 0v4.8l1.6-1.9a1.05 1.05 0 0 1 1.6 1.35l-3.1 4.6a4.4 4.4 0 0 1-3.65 1.95H9.4a4.4 4.4 0 0 1-3.5-1.75L4 12.4a1.1 1.1 0 0 1 1.7-1.4z" />
    </svg>
  ),
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
  { tool: 'hand', icon: 'hand', label: '이동 (H)', key: 'H' },
  { tool: 'wall', icon: 'wall', label: '선 그리기 (S)', key: 'S' },
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
  const [query, setQuery] = useState('');
  const placing = useStore((s) => s.placingCatalogId);
  const setPlacing = useStore((s) => s.setPlacing);
  const q = query.trim().toLowerCase();
  // 검색 중에는 카테고리 무시하고 전체에서 이름·브랜드·별칭 매칭
  const items = q ? searchCatalog(q) : CATALOG.filter((c) => c.category === category);

  return (
    <aside className="float-panel catalog-panel">
      <div className="panel-header">
        <span className="panel-header__title">가구 카탈로그</span>
        <span className="panel-header__meta">{CATALOG.length.toLocaleString()}</span>
      </div>
      <div className="catalog-search">
        <input
          className="catalog-search__input"
          type="search"
          placeholder="가구 이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!q && (
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
      )}
      <div className="catalog-grid scroll-y">
        {items.length === 0 && q && (
          <div className="catalog-empty">'{query.trim()}' 검색 결과가 없습니다</div>
        )}
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
              {c.product && (
                <span className="catalog-item__price mono">
                  {formatPrice(c.price)}
                  <span
                    className="catalog-item__link"
                    title={`${c.product.mall}에서 보기`}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(c.product!.url, '_blank', 'noopener');
                    }}
                  >
                    ↗
                  </span>
                </span>
              )}
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
      (pl) => {
        // 표면 적층: 부모 위치·회전 변경은 자식 동반 (surfaces.ts 계약)
        let base = pl;
        if (p.position) base = moveItemWithChildren(base, item.id, p.position);
        if (p.rotationDeg != null) base = rotateItemWithChildren(base, item.id, p.rotationDeg);
        const rest = { ...p };
        delete rest.position;
        delete rest.rotationDeg;
        return {
          ...base,
          items: base.items.map((i) => (i.id === item.id ? { ...i, ...rest } : i)),
        };
      },
      { coalesceKey: `item-${item.id}` },
    );

  // 수치 입력·드래그 결과에 대한 반응형 검증 — 드래그와 동일한 비파괴 정책
  // (입력값은 정밀하게 유지하고 문제만 경고. 그리드 스냅은 정밀 입력을 위해 미적용)
  const numCollisions = collisionsFor(plan, item).length;
  const numBlockedDoors = blockedDoorIds(plan, item).length;

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
      {(numCollisions > 0 || numBlockedDoors > 0) && (
        <div className="inspector__warn">
          {[
            numCollisions > 0 ? `가구 겹침 ${numCollisions}건` : null,
            numBlockedDoors > 0 ? `문 앞 공간 침범 ${numBlockedDoors}곳` : null,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          — 배치는 유지됩니다
        </div>
      )}
      {item.parentId && (
        <div className="inspector__mount-row">
          <span>
            {catalogById.get(
              plan.items.find((i) => i.id === item.parentId)?.catalogId ?? '',
            )?.name ?? '가구'}{' '}
            위에 올려짐
          </span>
          <button
            className="btn btn--outline"
            onClick={() =>
              updatePlan((pl) => {
                const un = unmountItem(pl, item.id);
                const spot =
                  findFreeSpot(un, { ...item, parentId: undefined }) ?? item.position;
                return {
                  ...un,
                  items: un.items.map((i) =>
                    i.id === item.id ? { ...i, position: spot } : i,
                  ),
                };
              })
            }
          >
            바닥에 내려놓기
          </button>
        </div>
      )}
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
        <span className="inspector__price">
          {formatPrice(item.price)}
          {cat.product && (
            <a
              className="inspector__product-link"
              href={cat.product.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${cat.product.mall} 실판매가 (${cat.product.fetchedAt.slice(0, 10)} 기준)`}
            >
              실제가 ↗
            </a>
          )}
        </span>
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
                // 표면 적층: 사본이 상판을 벗어나면 바닥 배치
                if (copy.parentId) {
                  const parent = plan.items.find((p) => p.id === copy.parentId);
                  if (!parent || !childFitsSurface(copy, parent)) delete copy.parentId;
                }
                updatePlan((pl) => ({ ...pl, items: [...pl.items, copy] }));
                setSelection([copy.id]);
              }}
            >
              복제
            </button>
            <button
              className="btn btn--outline detail-danger"
              onClick={() => {
                // 표면 적층: 부모 삭제 시 상판 위 자식 동반 삭제
                updatePlan((pl) => deleteItemsWithChildren(pl, [item.id]));
                setSelection([]);
              }}
            >
              삭제
              {surfaceChildren(plan, item.id).length > 0 &&
                ` (+올려진 ${surfaceChildren(plan, item.id).length})`}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ===== 상태바 ===== */

/* ===== 밑그림(언더레이) 패널 — 업로드 즉시 로드의 선택 기능들 ===== */

export function UnderlayPanel({ onStartScale }: { onStartScale: () => void }) {
  const plan = useCurrentPlan();
  const updatePlan = useStore((s) => s.updatePlan);
  const [status, setStatus] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const tracing = plan.tracing;
  if (!tracing) return null;

  const patch = (p: Partial<NonNullable<typeof tracing>>, coalesce?: string) =>
    updatePlan(
      (pl) => (pl.tracing ? { ...pl, tracing: { ...pl.tracing, ...p } } : pl),
      coalesce ? { coalesceKey: coalesce } : undefined,
    );

  const autoDetect = async () => {
    if (detecting || !tracing.widthM || !tracing.heightM) return;
    setDetecting(true);
    setStatus(null);
    const srcW = 780;
    const srcH = Math.round((srcW * tracing.heightM) / tracing.widthM);
    const { autoTraceImage } = await import('../upload/autoTrace');
    const { linesToWalls } = await import('../../model/underlay');
    const r = await autoTraceImage(tracing.imageUrl, srcW, srcH);
    if (r.lines.length === 0) {
      setStatus('벽을 인식하지 못했습니다 — 선 그리기(S)로 직접 그리세요');
      setDetecting(false);
      return;
    }
    let seq = 0;
    const walls = linesToWalls(
      r.lines,
      srcW,
      srcH,
      tracing.widthM,
      tracing.heightM,
      () => `wall-${Date.now().toString(36)}-ad${seq++}`,
    );
    // 벽 후보 일괄 추가 — undo 1회로 전체 취소 가능
    updatePlan((pl) => ({ ...pl, walls: [...pl.walls, ...walls] }));
    setStatus(`벽 후보 ${walls.length}개 추가 — 필요 없으면 Cmd+Z`);
    setDetecting(false);
  };

  return (
    <aside className="float-panel underlay-panel">
      <div className="panel-header">
        <span className="panel-header__title">밑그림</span>
        <button
          className={`toggle${tracing.visible ? ' is-on' : ''}`}
          aria-pressed={tracing.visible}
          title="표시/숨김"
          onClick={() => patch({ visible: !tracing.visible })}
        />
      </div>
      <div className="underlay-panel__row">
        <span>불투명도</span>
        <input
          type="range"
          className="slider"
          min={10}
          max={90}
          value={Math.round(tracing.opacity * 100)}
          onChange={(e) => patch({ opacity: Number(e.target.value) / 100 }, 'underlay-op')}
        />
      </div>
      <div className="underlay-panel__actions">
        <button className="btn btn--outline" onClick={onStartScale}>
          스케일 맞추기
        </button>
        <button className="btn btn--outline" disabled={detecting} onClick={() => void autoDetect()}>
          {detecting ? '인식 중…' : '벽 자동 인식'}
        </button>
      </div>
      {status && <div className="underlay-panel__status">{status}</div>}
    </aside>
  );
}

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
