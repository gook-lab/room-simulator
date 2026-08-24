import type {
  DragState,
  Opening,
  PlacedItem,
  Plan,
  Room,
  Tool,
  Vec2,
} from '../../model/types';
import { catalogById } from '../../model/catalog';
import { doorZones } from '../../model/doorZones';
import { itemAabb, planBounds, wallPointAt } from '../../model/geometry';
import { FurnitureSymbol, shapeOf } from './symbols';
import { w2s, type ViewTransform } from './view';

const FLOOR_COLORS: Record<Room['floor'], string> = {
  living: '#fbf8f3',
  kitchen: '#f5f1ea',
  bath: '#f0f4f2',
};

export type WallDraft = { points: Vec2[]; cursor: Vec2 | null };
export type OpeningHover = { wallId: string; t: number; kind: 'door' | 'window' };
export type Measure = { a: Vec2; b: Vec2 };
export type PlacingGhost = { catalogId: string; pos: Vec2; valid: boolean };

export type PlanCanvasProps = {
  plan: Plan;
  t: ViewTransform;
  viewport: { w: number; h: number };
  tool: Tool;
  selection: string[];
  hoverItemId: string | null;
  drag: DragState | null;
  wallDraft: WallDraft | null;
  openingHover: OpeningHover | null;
  measure: Measure | null;
  placingGhost: PlacingGhost | null;
  rotatingItemId: string | null;
  resizingItemId: string | null;
  svgRef: React.RefObject<SVGSVGElement>;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  cursor: string;
};

/** 아이템 z-레이어: 러그 < 가구 < 조명 */
export function itemLayer(item: PlacedItem): number {
  const shape = shapeOf(item.catalogId);
  if (shape === 'rug') return 0;
  if (shape === 'floor-lamp' || shape === 'pendant-lamp') return 2;
  return 1;
}

export function sortedItems(plan: Plan): PlacedItem[] {
  return [...plan.items].sort((a, b) => itemLayer(a) - itemLayer(b));
}

const NSS = { vectorEffect: 'non-scaling-stroke' } as const;

function WallLines({ plan }: { plan: Plan }) {
  return (
    <g>
      {plan.walls.map((w) => (
        <line
          key={w.id}
          x1={w.a.x}
          y1={w.a.y}
          x2={w.b.x}
          y2={w.b.y}
          stroke="#17201c"
          strokeWidth={w.thickness}
          strokeLinecap="square"
        />
      ))}
    </g>
  );
}

function OpeningGlyph({ plan, opening }: { plan: Plan; opening: Opening }) {
  const wall = plan.walls.find((w) => w.id === opening.wallId);
  if (!wall) return null;
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (len === 0) return null;
  const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
  const center = wallPointAt(wall, opening.t);
  const half = opening.width / 2;
  const p1 = { x: center.x - dir.x * half, y: center.y - dir.y * half };
  const p2 = { x: center.x + dir.x * half, y: center.y + dir.y * half };

  if (opening.kind === 'window') {
    return (
      <g>
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fbf8f3" strokeWidth={wall.thickness} />
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#7ba8c9" strokeWidth={3} {...NSS} />
      </g>
    );
  }

  // 문: 벽을 바닥색으로 지운다. 닫힘 = 문짝 슬래브, 열림 = 90° 스윙 호
  if (opening.open === false) {
    return (
      <g>
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fbf8f3" strokeWidth={wall.thickness + 0.01} />
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#c9a882" strokeWidth={5} {...NSS} />
      </g>
    );
  }
  const hinge = opening.swing === 'right' ? p2 : p1;
  const leaf = opening.swing === 'right' ? p1 : p2;
  const normal = { x: -dir.y, y: dir.x };
  const arcEnd = {
    x: hinge.x + normal.x * opening.width * (opening.swing === 'right' ? -1 : 1),
    y: hinge.y + normal.y * opening.width * (opening.swing === 'right' ? -1 : 1),
  };
  const sweep = opening.swing === 'right' ? 1 : 0;
  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fbf8f3" strokeWidth={wall.thickness + 0.01} />
      <path
        d={`M ${leaf.x} ${leaf.y} A ${opening.width} ${opening.width} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="#8b948e"
        strokeWidth={1.2}
        strokeDasharray="4 4"
        opacity={0.5}
        {...NSS}
      />
      <line x1={hinge.x} y1={hinge.y} x2={arcEnd.x} y2={arcEnd.y} stroke="#8b948e" strokeWidth={1.2} opacity={0.5} {...NSS} />
    </g>
  );
}

function centroid(poly: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

function RoomLabels({ plan, t }: { plan: Plan; t: ViewTransform }) {
  return (
    <g>
      {plan.rooms.map((r) => {
        const c = w2s(t, centroid(r.polygon));
        const big = r.areaSqm > 14;
        if (big) {
          return (
            <g key={r.id}>
              <text x={c.x} y={c.y - 4} textAnchor="middle" fontSize={17} fontWeight={700} fill="#17201c" fontFamily="var(--font-ui)">
                {r.name}
              </text>
              <text x={c.x} y={c.y + 14} textAnchor="middle" fontSize={12} fontWeight={500} fill="#8b948e" fontFamily="var(--font-ui)">
                {r.areaSqm.toFixed(1)}㎡
              </text>
            </g>
          );
        }
        return (
          <text key={r.id} x={c.x} y={c.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#8b948e" fontFamily="var(--font-ui)">
            {r.name} · {r.areaSqm.toFixed(1)}㎡
          </text>
        );
      })}
    </g>
  );
}

function DimLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 8 + 14;
  return (
    <g>
      <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={5} fill="#f2eee7" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="#4a544e" fontFamily="var(--font-mono)">
        {text}
      </text>
    </g>
  );
}

/** 도면 외곽 치수선 (상단 폭 / 우측 높이) */
function BoundsDimensions({ plan, t }: { plan: Plan; t: ViewTransform }) {
  const b = planBounds(plan);
  if (plan.walls.length === 0) return null;
  const tl = w2s(t, b.min);
  const br = w2s(t, b.max);
  const topY = tl.y - 34;
  const rightX = br.x + 34;
  const wLabel = `${(b.max.x - b.min.x).toFixed(1)} m`;
  const hLabel = `${(b.max.y - b.min.y).toFixed(1)} m`;
  return (
    <g stroke="#8b948e" strokeWidth={1}>
      <line x1={tl.x} y1={topY} x2={br.x} y2={topY} />
      <line x1={tl.x} y1={topY - 8} x2={tl.x} y2={topY + 8} />
      <line x1={br.x} y1={topY - 8} x2={br.x} y2={topY + 8} />
      <DimLabel x={(tl.x + br.x) / 2} y={topY} text={wLabel} />
      <line x1={rightX} y1={tl.y} x2={rightX} y2={br.y} />
      <line x1={rightX - 8} y1={tl.y} x2={rightX + 8} y2={tl.y} />
      <line x1={rightX - 8} y1={br.y} x2={rightX + 8} y2={br.y} />
      <DimLabel x={rightX} y={(tl.y + br.y) / 2} text={hLabel} />
    </g>
  );
}

function ScreenChip({
  x,
  y,
  text,
  bg,
  color = '#ffffff',
  mono = true,
}: {
  x: number;
  y: number;
  text: string;
  bg: string;
  color?: string;
  mono?: boolean;
}) {
  const w = text.length * (mono ? 7.6 : 7) + 18;
  return (
    <g>
      <rect x={x - w / 2} y={y - 12} width={w} height={24} rx={6} fill={bg} />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill={color}
        fontFamily={mono ? 'var(--font-mono)' : 'var(--font-ui)'}
      >
        {text}
      </text>
    </g>
  );
}

/** 선택 상태: 4px 오프셋 accent 박스 + 코너 핸들 + 회전 핸들 */
function SelectionUI({ item, t }: { item: PlacedItem; t: ViewTransform }) {
  const s = t.s;
  const off = 4 / s;
  const hw = item.size.w / 2 + off;
  const hd = item.size.d / 2 + off;
  const handle = 10 / s;
  const rotR = 9 / s;
  const rotGap = 22 / s;
  return (
    <g transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotationDeg})`}>
      <rect x={-hw} y={-hd} width={hw * 2} height={hd * 2} fill="none" stroke="#0e9f6e" strokeWidth={2} {...NSS} />
      <line x1={0} y1={-hd} x2={0} y2={-hd - rotGap} stroke="#0e9f6e" strokeWidth={2} {...NSS} />
      <circle cx={0} cy={-hd - rotGap - rotR} r={rotR} fill="#ffffff" stroke="#0e9f6e" strokeWidth={2} {...NSS} />
      {[
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={x - handle / 2}
          y={y - handle / 2}
          width={handle}
          height={handle}
          fill="#ffffff"
          stroke="#0e9f6e"
          strokeWidth={2}
          {...NSS}
        />
      ))}
    </g>
  );
}

function DragOverlay({ plan, drag, t }: { plan: Plan; drag: DragState; t: ViewTransform }) {
  const item = plan.items.find((i) => i.id === drag.itemId);
  if (!item) return null;
  const aabb = itemAabb(item);
  const topCenter = w2s(t, { x: item.position.x, y: aabb.min.y });
  const cm = (v: number) => Math.round(v * 100);
  const colliding = drag.collisions.length > 0;
  const doorBlocked = drag.blockedDoors.length > 0;
  const warn = colliding || doorBlocked;

  return (
    <g>
      {/* 침범 중인 문 클리어런스 존 */}
      {doorBlocked &&
        doorZones(plan)
          .filter((z) => drag.blockedDoors.includes(z.openingId))
          .map((z, i) => (
            <polygon
              key={`${z.openingId}-${z.kind}-${i}`}
              points={z.corners
                .map((p) => {
                  const s = w2s(t, p);
                  return `${s.x},${s.y}`;
                })
                .join(' ')}
              fill="#e8590c"
              opacity={0.12}
              stroke="#e8590c"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          ))}
      {/* 스냅 정렬선 + 라벨 (1c-2) */}
      {drag.snap && (
        <SnapGuides plan={plan} item={item} t={t} snap={drag.snap} />
      )}
      {/* 고스트 외곽 dashed (1c-1) / 충돌 시 warn (1c-4) */}
      <g transform={`translate(${item.position.x * t.s + t.ox} ${item.position.y * t.s + t.oy}) rotate(${item.rotationDeg}) scale(${t.s})`}>
        <rect
          x={-item.size.w / 2}
          y={-item.size.d / 2}
          width={item.size.w}
          height={item.size.d}
          fill={warn ? '#e8590c' : 'none'}
          opacity={warn ? 0.16 : 1}
          stroke={warn ? '#e8590c' : '#0e9f6e'}
          strokeWidth={2}
          strokeDasharray={warn ? undefined : '7 5'}
          {...NSS}
        />
      </g>
      {/* 치수/충돌/문 경고 칩 */}
      {colliding ? (
        <ScreenChip
          x={topCenter.x}
          y={topCenter.y - 20}
          text={`겹침 · ${plan.items.filter((i) => drag.collisions.includes(i.id)).map((i) => catalogById.get(i.catalogId)?.name ?? '가구')[0]}`}
          bg="#e8590c"
          mono={false}
        />
      ) : doorBlocked ? (
        <ScreenChip
          x={topCenter.x}
          y={topCenter.y - 20}
          text="문 앞 공간을 막음"
          bg="#e8590c"
          mono={false}
        />
      ) : (
        <ScreenChip
          x={topCenter.x}
          y={topCenter.y - 20}
          text={`${cm(item.size.w)} × ${cm(item.size.d)} cm`}
          bg="#17201c"
        />
      )}
    </g>
  );
}

function SnapGuides({
  plan,
  item,
  t,
  snap,
}: {
  plan: Plan;
  item: PlacedItem;
  t: ViewTransform;
  snap: NonNullable<DragState['snap']>;
}) {
  const b = planBounds(plan);
  const aabb = itemAabb(item);
  if (snap.axis === 'y') {
    const y = snap.line * t.s + t.oy;
    const x1 = b.min.x * t.s + t.ox;
    const x2 = b.max.x * t.s + t.ox;
    const cx = item.position.x * t.s + t.ox;
    return (
      <g>
        <line x1={x1} y1={y} x2={x2} y2={y} stroke="#0e9f6e" strokeWidth={1.5} strokeDasharray="6 4" />
        <ScreenChip x={cx} y={y + (aabb.min.y >= snap.line ? -16 : 16)} text="벽에 붙임" bg="#0e9f6e" mono={false} />
        {snap.clearance != null && snap.clearance > 0.1 && (
          <ClearanceLabel t={t} axis="y" item={item} aabb={aabb} snap={snap} />
        )}
      </g>
    );
  }
  const x = snap.line * t.s + t.ox;
  const y1 = b.min.y * t.s + t.oy;
  const y2 = b.max.y * t.s + t.oy;
  const cy = item.position.y * t.s + t.oy;
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#0e9f6e" strokeWidth={1.5} strokeDasharray="6 4" />
      <ScreenChip x={x + (aabb.min.x >= snap.line ? -46 : 46)} y={cy} text="벽에 붙임" bg="#0e9f6e" mono={false} />
      {snap.clearance != null && snap.clearance > 0.1 && (
        <ClearanceLabel t={t} axis="x" item={item} aabb={aabb} snap={snap} />
      )}
    </g>
  );
}

function ClearanceLabel({
  t,
  axis,
  item,
  aabb,
  snap,
}: {
  t: ViewTransform;
  axis: 'x' | 'y';
  item: PlacedItem;
  aabb: { min: Vec2; max: Vec2 };
  snap: NonNullable<DragState['snap']>;
}) {
  const clearance = snap.clearance!;
  if (axis === 'y') {
    const snappedTop = aabb.min.y >= snap.line;
    const edgeY = snappedTop ? aabb.max.y : aabb.min.y;
    const farY = snappedTop ? edgeY + clearance : edgeY - clearance;
    const p1 = w2s(t, { x: item.position.x, y: edgeY });
    const p2 = w2s(t, { x: item.position.x, y: farY });
    return (
      <g>
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8b948e" strokeWidth={1} strokeDasharray="4 4" />
        <ScreenChip x={(p1.x + p2.x) / 2 + 52} y={(p1.y + p2.y) / 2} text={`여유 ${clearance.toFixed(2)} m`} bg="#f2eee7" color="#4a544e" />
      </g>
    );
  }
  const snappedLeft = aabb.min.x >= snap.line;
  const edgeX = snappedLeft ? aabb.max.x : aabb.min.x;
  const farX = snappedLeft ? edgeX + clearance : edgeX - clearance;
  const p1 = w2s(t, { x: edgeX, y: item.position.y });
  const p2 = w2s(t, { x: farX, y: item.position.y });
  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8b948e" strokeWidth={1} strokeDasharray="4 4" />
      <ScreenChip x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 16} text={`여유 ${clearance.toFixed(2)} m`} bg="#f2eee7" color="#4a544e" />
    </g>
  );
}

/** 회전 중 오버레이 (1c-3): 15° 틱 링 + 각도 칩 */
export function RotationRing({ item, t }: { item: PlacedItem; t: ViewTransform }) {
  const c = w2s(t, item.position);
  const R = 96;
  const ticks = [];
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    ticks.push(
      <line
        key={a}
        x1={c.x + Math.cos(rad) * (R - 7)}
        y1={c.y + Math.sin(rad) * (R - 7)}
        x2={c.x + Math.cos(rad) * (R + 1)}
        y2={c.y + Math.sin(rad) * (R + 1)}
        stroke="#17201c"
        strokeWidth={2}
        opacity={0.28}
      />,
    );
  }
  return (
    <g>
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke="#17201c" strokeWidth={1.5} opacity={0.18} />
      {ticks}
      <ScreenChip x={c.x} y={c.y - R - 22} text={`${Math.round(((item.rotationDeg % 360) + 360) % 360)}°`} bg="#17201c" />
    </g>
  );
}

function WallDraftPreview({ draft, t }: { draft: WallDraft; t: ViewTransform }) {
  const pts = draft.points;
  if (pts.length === 0) return null;
  const cursor = draft.cursor;
  const screenPts = pts.map((p) => w2s(t, p));
  const last = pts[pts.length - 1];
  return (
    <g>
      <polyline
        points={screenPts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#17201c"
        strokeWidth={7}
        strokeLinecap="square"
        opacity={0.85}
      />
      {cursor && (
        <>
          <line
            x1={screenPts[screenPts.length - 1].x}
            y1={screenPts[screenPts.length - 1].y}
            x2={cursor.x * t.s + t.ox}
            y2={cursor.y * t.s + t.oy}
            stroke="#0e9f6e"
            strokeWidth={3}
            strokeDasharray="7 5"
          />
          <ScreenChip
            x={(cursor.x * t.s + t.ox + screenPts[screenPts.length - 1].x) / 2}
            y={(cursor.y * t.s + t.oy + screenPts[screenPts.length - 1].y) / 2 - 18}
            text={`${Math.hypot(cursor.x - last.x, cursor.y - last.y).toFixed(2)} m`}
            bg="#17201c"
          />
        </>
      )}
      {screenPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={5} fill="#ffffff" stroke="#0e9f6e" strokeWidth={2} />
      ))}
      {/* 시작점 닫기 힌트 */}
      {pts.length >= 3 && (
        <circle cx={screenPts[0].x} cy={screenPts[0].y} r={12} fill="none" stroke="#0e9f6e" strokeWidth={1.5} strokeDasharray="3 3" />
      )}
    </g>
  );
}

function OpeningHoverMarker({
  plan,
  hover,
  t,
}: {
  plan: Plan;
  hover: OpeningHover;
  t: ViewTransform;
}) {
  const wall = plan.walls.find((w) => w.id === hover.wallId);
  if (!wall) return null;
  const p = w2s(t, wallPointAt(wall, hover.t));
  const width = hover.kind === 'door' ? 0.9 : 1.2;
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
  const half = (width / 2) * t.s;
  return (
    <g opacity={0.8}>
      <line
        x1={p.x - dir.x * half}
        y1={p.y - dir.y * half}
        x2={p.x + dir.x * half}
        y2={p.y + dir.y * half}
        stroke={hover.kind === 'door' ? '#0e9f6e' : '#7ba8c9'}
        strokeWidth={6}
        strokeLinecap="butt"
      />
      <ScreenChip x={p.x} y={p.y - 22} text={hover.kind === 'door' ? '문 추가' : '창 추가'} bg="#17201c" mono={false} />
    </g>
  );
}

/** 영속 치수 주석 — 틱 달린 치수선 + 길이 칩. 선택 시 accent */
function DimensionNotes({
  plan,
  t,
  selection,
}: {
  plan: Plan;
  t: ViewTransform;
  selection: string[];
}) {
  const dims = plan.dimensions ?? [];
  if (dims.length === 0) return null;
  return (
    <g>
      {dims.map((dim) => {
        const a = w2s(t, dim.a);
        const b = w2s(t, dim.b);
        const len = Math.hypot(dim.b.x - dim.a.x, dim.b.y - dim.a.y);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const sl = Math.hypot(dx, dy) || 1;
        const nx = (-dy / sl) * 8;
        const ny = (dx / sl) * 8;
        const selected = selection.includes(dim.id);
        const color = selected ? '#0e9f6e' : '#8b948e';
        return (
          <g key={dim.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={selected ? 1.8 : 1.2} />
            <line x1={a.x - nx} y1={a.y - ny} x2={a.x + nx} y2={a.y + ny} stroke={color} strokeWidth={selected ? 1.8 : 1.2} />
            <line x1={b.x - nx} y1={b.y - ny} x2={b.x + nx} y2={b.y + ny} stroke={color} strokeWidth={selected ? 1.8 : 1.2} />
            <ScreenChip
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 14}
              text={`${len.toFixed(2)} m`}
              bg={selected ? '#0e9f6e' : '#f2eee7'}
              color={selected ? '#ffffff' : '#4a544e'}
            />
          </g>
        );
      })}
    </g>
  );
}

function MeasureOverlay({ measure, t }: { measure: Measure; t: ViewTransform }) {
  const a = w2s(t, measure.a);
  const b = w2s(t, measure.b);
  const d = Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y);
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8b948e" strokeWidth={1.5} />
      <circle cx={a.x} cy={a.y} r={3.5} fill="#4a544e" />
      <circle cx={b.x} cy={b.y} r={3.5} fill="#4a544e" />
      <ScreenChip x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 18} text={`${d.toFixed(2)} m`} bg="#17201c" />
    </g>
  );
}

function PlacingGhostPreview({ ghost, t }: { ghost: PlacingGhost; t: ViewTransform }) {
  const cat = catalogById.get(ghost.catalogId);
  if (!cat) return null;
  const cm = (v: number) => Math.round(v * 100);
  const fake: PlacedItem = {
    id: '__ghost',
    catalogId: ghost.catalogId,
    position: ghost.pos,
    rotationDeg: 0,
    size: { ...cat.size },
    variant: { material: cat.swatches[0].id, color: cat.swatches[0].color },
    roomId: null,
    price: cat.price,
  };
  const p = w2s(t, ghost.pos);
  return (
    <g>
      <g
        transform={`translate(${p.x} ${p.y}) scale(${t.s})`}
        opacity={0.45}
      >
        <FurnitureSymbol item={fake} />
        <rect
          x={-cat.size.w / 2}
          y={-cat.size.d / 2}
          width={cat.size.w}
          height={cat.size.d}
          fill="none"
          stroke={ghost.valid ? '#0e9f6e' : '#e8590c'}
          strokeWidth={2}
          strokeDasharray="7 5"
          {...NSS}
        />
      </g>
      <circle cx={p.x} cy={p.y} r={16} fill="#0e9f6e" opacity={0.18} />
      <circle cx={p.x} cy={p.y} r={5} fill="#0e9f6e" />
      <ScreenChip x={p.x} y={p.y - cat.size.d / 2 * t.s - 24} text={`${cm(cat.size.w)} × ${cm(cat.size.d)} cm`} bg="#17201c" />
    </g>
  );
}

export function PlanCanvas(props: PlanCanvasProps) {
  const { plan, t, viewport, selection, hoverItemId, drag } = props;
  const items = sortedItems(plan);
  const selectedItems = plan.items.filter((i) => selection.includes(i.id));

  return (
    <svg
      ref={props.svgRef}
      className="plan-canvas"
      width={viewport.w}
      height={viewport.h}
      style={{ cursor: props.cursor }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
    >
      {/* ===== world 좌표 레이어 (1 unit = 1 m) ===== */}
      <g transform={`translate(${t.ox} ${t.oy}) scale(${t.s})`}>
        {/* 룸 바닥 */}
        {plan.rooms.map((r) => (
          <polygon
            key={r.id}
            points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={FLOOR_COLORS[r.floor]}
          />
        ))}
        {/* 트레이싱 원본 */}
        {plan.tracing?.visible && plan.tracing.widthM != null && (
          <image
            href={plan.tracing.imageUrl}
            x={0}
            y={0}
            width={plan.tracing.widthM}
            height={plan.tracing.heightM}
            opacity={plan.tracing.opacity}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {/* 가구 (러그 → 가구 → 조명) */}
        {items.map((item) => {
          const isGhost = drag?.itemId === item.id;
          const isHover = hoverItemId === item.id && !isGhost;
          return (
            <g
              key={item.id}
              transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotationDeg})`}
              opacity={isGhost ? 0.45 : 1}
            >
              <FurnitureSymbol item={item} />
              {isHover && (
                <rect
                  x={-item.size.w / 2}
                  y={-item.size.d / 2}
                  width={item.size.w}
                  height={item.size.d}
                  fill="none"
                  stroke="#0e9f6e"
                  strokeWidth={1}
                  opacity={0.6}
                  {...NSS}
                />
              )}
            </g>
          );
        })}
        {/* 벽 + 개구부 */}
        <WallLines plan={plan} />
        {plan.openings.map((o) => (
          <OpeningGlyph key={o.id} plan={plan} opening={o} />
        ))}
        {/* 선택 UI (world 스케일, 논스케일 스트로크) */}
        {!drag &&
          selectedItems.map((item) => <SelectionUI key={item.id} item={item} t={t} />)}
      </g>

      {/* ===== screen 좌표 레이어 (라벨·오버레이) ===== */}
      <RoomLabels plan={plan} t={t} />
      <BoundsDimensions plan={plan} t={t} />
      <DimensionNotes plan={plan} t={t} selection={selection} />
      {drag && <DragOverlay plan={plan} drag={drag} t={t} />}
      {props.rotatingItemId &&
        (() => {
          const it = plan.items.find((i) => i.id === props.rotatingItemId);
          return it ? <RotationRing item={it} t={t} /> : null;
        })()}
      {props.resizingItemId &&
        (() => {
          const it = plan.items.find((i) => i.id === props.resizingItemId);
          if (!it) return null;
          const aabb = itemAabb(it);
          const p = w2s(t, { x: it.position.x, y: aabb.min.y });
          const cm = (v: number) => Math.round(v * 100);
          return (
            <ScreenChip
              x={p.x}
              y={p.y - 20}
              text={`${cm(it.size.w)} × ${cm(it.size.d)} cm`}
              bg="#17201c"
            />
          );
        })()}
      {props.wallDraft && <WallDraftPreview draft={props.wallDraft} t={t} />}
      {props.openingHover && (
        <OpeningHoverMarker plan={plan} hover={props.openingHover} t={t} />
      )}
      {props.measure && <MeasureOverlay measure={props.measure} t={t} />}
      {props.placingGhost && <PlacingGhostPreview ghost={props.placingGhost} t={t} />}
    </svg>
  );
}
