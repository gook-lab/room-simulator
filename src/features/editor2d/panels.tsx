import { useEffect, useState } from 'react';
import type { CatalogCategory, PlacedItem, Tool, Vec2 } from '../../model/types';
import { autoAlignOffset, floorsOfBuilding, translatePlanGeometry } from '../../model/floorStack';
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
  roomDetect: (
    <svg width="20" height="20" viewBox="0 0 20 20" {...STROKE}>
      <path d="M3.5 5.5v-2h2M14.5 3.5h2v2M16.5 14.5v2h-2M5.5 16.5h-2v-2" />
      <rect x="6.5" y="6.5" width="7" height="7" rx="0.5" />
    </svg>
  ),
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

export function ToolDock({
  onResetView,
  onDetectRooms,
}: {
  onResetView: () => void;
  onDetectRooms?: () => void;
}) {
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
      {onDetectRooms && (
        <button
          className="tooldock__btn"
          title="방 인식 — 벽으로 닫힌 공간을 방으로"
          onClick={onDetectRooms}
        >
          {ICONS.roomDetect}
        </button>
      )}
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

/**
 * 층 정렬 패널 — 위층(2층 이상) 문서에서만 노출.
 * 아래층 고스트 겹쳐 보기 + 자동 정렬(벽 bbox 중심 맞춤) + 0.1m 미세 이동.
 */
export function FloorAlignPanel({
  ghostOn,
  setGhostOn,
}: {
  ghostOn: boolean;
  setGhostOn: (v: boolean) => void;
}) {
  const plan = useCurrentPlan();
  const plans = useStore((s) => s.plans);
  const updatePlan = useStore((s) => s.updatePlan);
  const floors = floorsOfBuilding(plans, plan);
  const idx = floors.findIndex((f) => f.id === plan.id);
  if (idx < 1) return null; // 1층·단독 문서에는 정렬 대상이 없음
  const below = floors[idx - 1];

  const nudge = (dx: number, dy: number) =>
    updatePlan((pl) => translatePlanGeometry(pl, { x: dx, y: dy }), {
      coalesceKey: 'floor-align',
    });
  const autoAlign = () => {
    const d = autoAlignOffset(plan, below);
    if (d) updatePlan((pl) => translatePlanGeometry(pl, d));
  };

  return (
    <aside className="float-panel underlay-panel floor-align-panel">
      <div className="panel-header">
        <span className="panel-header__title">층 정렬</span>
        <span className="badge-accent">{below.floorLabel ?? '아래층'} 기준</span>
      </div>
      <label className="inspector__swatch-label" style={{ display: 'flex', gap: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={ghostOn} onChange={(e) => setGhostOn(e.target.checked)} />
        아래층 겹쳐 보기
      </label>
      <div className="underlay-panel__actions">
        <button className="btn" onClick={autoAlign} title="두 층 벽 범위의 중심을 맞춥니다">
          아래층에 자동 정렬
        </button>
      </div>
      <div className="underlay-panel__actions floor-align-panel__nudge">
        {(
          [
            ['←', -0.1, 0],
            ['→', 0.1, 0],
            ['↑', 0, -0.1],
            ['↓', 0, 0.1],
          ] as const
        ).map(([label, dx, dy]) => (
          <button
            key={label}
            className="btn"
            title="0.1m 이동 · Shift+클릭 0.5m"
            onClick={(e) => nudge(dx * (e.shiftKey ? 5 : 1), dy * (e.shiftKey ? 5 : 1))}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="inspector__swatch-label">
        이동은 문서 전체(벽·가구·밑그림)에 적용되고 undo 대상입니다
      </span>
    </aside>
  );
}

/** 벽 두께 프리셋 (m) */
const WALL_THICKNESS_PRESETS = [
  { label: '경량', t: 0.1 },
  { label: '표준', t: 0.15 },
  { label: '외벽', t: 0.2 },
  { label: '콘크리트', t: 0.25 },
] as const;

const clampWallThickness = (v: number) => Math.min(0.6, Math.max(0.05, v));
const clampWallHeight = (v: number) => Math.min(6, Math.max(0.2, v));

/** 벽 선택 시: 두께·높이 편집 패널 (다중 선택 = 일괄 적용) */
function WallInspector({ wallIds }: { wallIds: string[] }) {
  const plan = useCurrentPlan();
  const updatePlan = useStore((s) => s.updatePlan);
  const walls = plan.walls.filter((w) => wallIds.includes(w.id));
  if (walls.length === 0) return null;
  const first = walls[0];
  const sameT = walls.every((w) => Math.abs(w.thickness - first.thickness) < 1e-9);
  const sameH = walls.every((w) => Math.abs(w.height - first.height) < 1e-9);
  const totalLen = walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0);

  const patch = (p: { thickness?: number; height?: number }) =>
    updatePlan(
      (pl) => ({
        ...pl,
        walls: pl.walls.map((w) => (wallIds.includes(w.id) ? { ...w, ...p } : w)),
      }),
      { coalesceKey: `wall-props-${wallIds.join(',')}` },
    );

  // 층 전체 적용: 모든 벽 높이 통일 + 문서 기본 층고로 저장 (새 벽·천장 기준)
  const applyHeightToFloor = () =>
    updatePlan((pl) => ({
      ...pl,
      defaultWallHeight: first.height,
      walls: pl.walls.map((w) => ({ ...w, height: first.height })),
    }));

  return (
    <aside className="float-panel inspector">
      <div className="panel-header">
        <span className="panel-header__title">
          벽{walls.length > 1 ? ` ${walls.length}개` : ''} · {totalLen.toFixed(1)}m
        </span>
        <span className="badge-accent">선택됨</span>
      </div>
      <div className="inspector__swatches">
        <span className="inspector__swatch-label">
          두께{sameT ? '' : ' — 값 다름, 선택 시 일괄 적용'}
        </span>
        <div className="seg-row">
          {WALL_THICKNESS_PRESETS.map((p) => (
            <button
              key={p.t}
              className={`seg${sameT && Math.abs(first.thickness - p.t) < 1e-9 ? ' is-active' : ''}`}
              onClick={() => patch({ thickness: p.t })}
              title={`${p.label} ${p.t}m`}
            >
              {p.t}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector__grid">
        <NumField
          label="두께"
          value={Number(first.thickness.toFixed(2))}
          suffix="m"
          onCommit={(v) => patch({ thickness: clampWallThickness(v) })}
        />
        <NumField
          label={sameH ? '높이' : '높이*'}
          value={Number(first.height.toFixed(2))}
          suffix="m"
          onCommit={(v) => patch({ height: clampWallHeight(v) })}
        />
      </div>
      <div className="inspector__detail-actions">
        <button className="btn" onClick={applyHeightToFloor}>
          높이 {first.height.toFixed(2)}m 층 전체 적용
        </button>
      </div>
      <div className="inspector__swatch-label">
        Shift+클릭으로 벽 추가 선택 = 일괄 편집 · 층 전체 적용은 기본 층고로 저장되어 새 벽·천장에
        쓰입니다
      </div>
    </aside>
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
  const patchMeta = (p: Partial<Pick<typeof room, 'name' | 'floor' | 'openCeiling'>>) =>
    updatePlan(
      (pl) => ({
        ...pl,
        rooms: pl.rooms.map((r) => (r.id === room.id ? { ...r, ...p } : r)),
      }),
      { coalesceKey: `room-meta-${room.id}` },
    );

  return (
    <aside className="float-panel inspector">
      <div className="panel-header">
        <input
          className="inspector__title-input"
          value={room.name}
          placeholder="방 이름"
          onChange={(e) => patchMeta({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="badge-accent">{room.areaSqm.toFixed(1)}㎡</span>
      </div>
      <div className="inspector__swatches">
        <span className="inspector__swatch-label">용도 — 기본 바닥색·견적 분류가 따라옵니다</span>
        <div className="seg-row">
          {(
            [
              ['living', '주거'],
              ['kitchen', '주방'],
              ['bath', '욕실'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              className={`seg${room.floor === kind ? ' is-active' : ''}`}
              onClick={() => patchMeta({ floor: kind })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="inspector__swatches">
        <label className="inspector__swatch-label" style={{ display: 'flex', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={room.openCeiling === true}
            onChange={(e) => patchMeta({ openCeiling: e.target.checked || undefined })}
          />
          오픈 천장 (보이드) — 복층에서 위층까지 뚫린 공간
        </label>
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
  // 벽 선택(단일·다중 모두) → 벽 속성 패널
  const selectedWallIds = selection.filter((id) => plan.walls.some((w) => w.id === id));
  if (selectedWallIds.length > 0 && selectedWallIds.length === selection.length) {
    return <WallInspector wallIds={selectedWallIds} />;
  }
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
    const { buildAutoGeometry } = await import('../../model/underlay');
    // 재실행은 현재(보정된) 스케일 기준으로 면적 임계·외곽 정리 수행
    const r = await autoTraceImage(tracing.imageUrl, srcW, srcH, {
      knownWidthM: tracing.widthM,
    });
    if (r.lines.length === 0 && r.outline.length < 3) {
      setStatus('벽을 인식하지 못했습니다 — 선 그리기(S)로 직접 그리세요');
      setDetecting(false);
      return;
    }
    let seq = 0;
    const stamp = Date.now().toString(36);
    const built = buildAutoGeometry(
      r,
      srcW,
      srcH,
      tracing.widthM,
      tracing.heightM,
      () => `g-${stamp}-ad${seq++}`,
    );
    // 층 정렬로 문서가 이동된 경우: 인식 좌표(이미지 기준)에 밑그림 오프셋을 더해 정렬 유지
    const off = tracing.offset ?? { x: 0, y: 0 };
    const shift = (p: Vec2): Vec2 => ({ x: p.x + off.x, y: p.y + off.y });
    const walls = built.walls.map((w) => ({ ...w, a: shift(w.a), b: shift(w.b) }));
    const rooms = built.rooms.map((rm) => ({ ...rm, polygon: rm.polygon.map(shift) }));
    const openings = built.openings;
    // 재실행: 이전 자동 인식분('-ad')은 교체, 사용자가 그린 것은 유지 — undo 1회로 취소
    updatePlan((pl) => ({
      ...pl,
      walls: [...pl.walls.filter((w) => !/-ad\d+$/.test(w.id)), ...walls],
      rooms: [...pl.rooms.filter((rm) => !/-ad\d+$/.test(rm.id)), ...rooms],
      openings: [...pl.openings.filter((o) => !/-ad\d+$/.test(o.id)), ...openings],
    }));
    setStatus(
      `벽 ${walls.length} · 공간 ${rooms.length} · 문/창 ${openings.length} 인식 — 필요 없으면 Cmd+Z`,
    );
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
      {status ? (
        <div className="underlay-panel__status">{status}</div>
      ) : (
        <div className="underlay-panel__status underlay-panel__status--muted">
          면적이 실제와 다르면 '스케일 맞추기'로 1회 보정하세요
        </div>
      )}
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
