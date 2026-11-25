import type { Plan, Vec2 } from '../../model/types';
import { itemAabb, planBounds } from '../../model/geometry';

/** 기본 화면 스케일 (px per meter, zoom=1) — 1a 목업의 도면 밀도에 맞춤 */
export const BASE_PX_PER_M = 66;

export type ViewTransform = {
  /** px per meter */
  s: number;
  /** screen = world * s + o */
  ox: number;
  oy: number;
};

export function makeTransform(
  plan: Plan,
  viewport: { w: number; h: number },
  camera: { pan: Vec2; zoom: number },
): ViewTransform {
  const s = BASE_PX_PER_M * camera.zoom;
  const b = planBounds(plan);
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  return {
    s,
    ox: viewport.w / 2 - cx * s + camera.pan.x,
    oy: viewport.h / 2 - cy * s + camera.pan.y,
  };
}

export function w2s(t: ViewTransform, p: Vec2): Vec2 {
  return { x: p.x * t.s + t.ox, y: p.y * t.s + t.oy };
}

export function s2w(t: ViewTransform, p: Vec2): Vec2 {
  return { x: (p.x - t.ox) / t.s, y: (p.y - t.oy) / t.s };
}

/** 뷰포트 기준 화면 사각형 (px) */
export type ScreenRect = { left: number; top: number; right: number; bottom: number };

type Bounds = { min: Vec2; max: Vec2 };

function grow(b: Bounds, p: Vec2): void {
  b.min.x = Math.min(b.min.x, p.x);
  b.min.y = Math.min(b.min.y, p.y);
  b.max.x = Math.max(b.max.x, p.x);
  b.max.y = Math.max(b.max.y, p.y);
}

/**
 * 화면 맞춤에 담을 도면 범위 (world). 벽 선만 보면 벽 두께 · 밖으로 열리는 문 호 ·
 * 벽 밖 가구 · 치수 주석이 화면 가장자리에서 잘린다.
 */
export function fitBounds(plan: Plan): Bounds {
  const base = planBounds(plan);
  const b: Bounds = { min: { ...base.min }, max: { ...base.max } };
  for (const w of plan.walls) {
    const h = w.thickness / 2;
    grow(b, { x: Math.min(w.a.x, w.b.x) - h, y: Math.min(w.a.y, w.b.y) - h });
    grow(b, { x: Math.max(w.a.x, w.b.x) + h, y: Math.max(w.a.y, w.b.y) + h });
  }
  for (const o of plan.openings) {
    if (o.kind !== 'door' || o.doorType === 'sliding' || o.open === false) continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (len === 0) continue;
    const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
    const c = { x: wall.a.x + (wall.b.x - wall.a.x) * o.t, y: wall.a.y + (wall.b.y - wall.a.y) * o.t };
    const side = o.swing === 'right' ? -1 : 1;
    const hinge = o.swing === 'right'
      ? { x: c.x + (dir.x * o.width) / 2, y: c.y + (dir.y * o.width) / 2 }
      : { x: c.x - (dir.x * o.width) / 2, y: c.y - (dir.y * o.width) / 2 };
    // 문짝이 90° 돌며 쓸고 가는 사분면의 바깥 모서리까지 (PlanCanvas OpeningGlyph 와 같은 방향)
    const swingTo = { x: -dir.y * o.width * side, y: dir.x * o.width * side };
    const leaf = { x: 2 * c.x - hinge.x, y: 2 * c.y - hinge.y };
    grow(b, { x: hinge.x + swingTo.x, y: hinge.y + swingTo.y });
    grow(b, { x: leaf.x + swingTo.x, y: leaf.y + swingTo.y });
  }
  for (const it of plan.items) {
    const a = itemAabb(it);
    grow(b, a.min);
    grow(b, a.max);
  }
  for (const d of plan.dimensions ?? []) {
    grow(b, d.a);
    grow(b, d.b);
  }
  return b;
}

/**
 * 도면 둘레의 화면 주석 자리 (px). 위 · 오른쪽 외곽 치수선(PlanCanvas BoundsDimensions)이
 * 벽에서 34px 밖에 22px 높이 라벨로 그려진다.
 */
export const FIT_ANNOTATION_PX = { top: 52, right: 72, bottom: 16, left: 16 };

/** 패널과 도면 사이 최소 간격 (px) */
const FIT_GAP_PX = 16;

type Side = 'left' | 'right' | 'top' | 'bottom';
const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

/**
 * 도면 전체가 패널에 가리지 않고 보이는 카메라 (fit-to-view).
 *
 * obstacles 는 캔버스 위에 떠 있는 패널(툴독 · 카탈로그 · 상태바 등)의 화면 사각형이다.
 * 패널마다 왼쪽 · 오른쪽 · 위 · 아래 중 한 띠를 비워 피하고, 조합 가운데 도면이
 * 가장 크게 보이는 것을 고른다. 좌하단 밑그림 패널처럼 모서리에 걸친 패널은 세로 도면이면
 * 왼쪽 띠, 가로 도면이면 아래 띠로 피하는 편이 넓기 때문이다.
 */
export function fitCamera(
  plan: Plan,
  viewport: { w: number; h: number },
  opts: { obstacles?: ScreenRect[]; paddingPx?: number } = {},
): { pan: Vec2; zoom: number } {
  const pad = opts.paddingPx ?? 24;
  const ann = FIT_ANNOTATION_PX;
  const obstacles = (opts.obstacles ?? []).filter(
    (r) => r.right > 0 && r.bottom > 0 && r.left < viewport.w && r.top < viewport.h,
  );
  const f = fitBounds(plan);
  const fw = Math.max(0.5, f.max.x - f.min.x);
  const fh = Math.max(0.5, f.max.y - f.min.y);

  let best: { zoom: number; area: ScreenRect } | null = null;
  const combos = 4 ** obstacles.length;
  for (let combo = 0; combo < combos; combo++) {
    const area: ScreenRect = { left: pad, top: pad, right: viewport.w - pad, bottom: viewport.h - pad };
    let code = combo;
    for (const r of obstacles) {
      const side = SIDES[code % 4];
      code = Math.floor(code / 4);
      if (side === 'left') area.left = Math.max(area.left, r.right + FIT_GAP_PX);
      if (side === 'right') area.right = Math.min(area.right, r.left - FIT_GAP_PX);
      if (side === 'top') area.top = Math.max(area.top, r.bottom + FIT_GAP_PX);
      if (side === 'bottom') area.bottom = Math.min(area.bottom, r.top - FIT_GAP_PX);
    }
    const availW = area.right - area.left - ann.left - ann.right;
    const availH = area.bottom - area.top - ann.top - ann.bottom;
    if (availW < 40 || availH < 40) continue;
    const zoom = Math.min(availW / (fw * BASE_PX_PER_M), availH / (fh * BASE_PX_PER_M));
    if (!best || zoom > best.zoom + 1e-9) best = { zoom, area };
  }
  const area = best?.area ?? { left: 0, top: 0, right: viewport.w, bottom: viewport.h };
  const zoom = Math.min(2, Math.max(0.3, best?.zoom ?? 1));

  // makeTransform 은 pan=0 일 때 planBounds 중심을 뷰포트 중앙에 둔다.
  // 주석까지 포함한 상자의 중심을 비운 영역의 중심으로 옮기는 pan 을 구한다.
  const s = BASE_PX_PER_M * zoom;
  const b = planBounds(plan);
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  const fcx = (f.min.x + f.max.x) / 2;
  const fcy = (f.min.y + f.max.y) / 2;
  const targetX = (area.left + area.right) / 2;
  const targetY = (area.top + area.bottom) / 2;
  return {
    pan: {
      x: targetX - viewport.w / 2 - (fcx - cx) * s - (ann.right - ann.left) / 2,
      y: targetY - viewport.h / 2 - (fcy - cy) * s - (ann.bottom - ann.top) / 2,
    },
    zoom,
  };
}

/** CSS px per meter ≈ 3779.5 → "1 : N" 표기용 축척 */
export function scaleRatioLabel(t: ViewTransform): string {
  const n = Math.round(3779.5 / t.s / 5) * 5;
  return `1 : ${Math.max(5, n)}`;
}
