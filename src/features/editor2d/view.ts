import type { Plan, Vec2 } from '../../model/types';
import { planBounds } from '../../model/geometry';

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

/**
 * 도면 전체가 여백을 두고 뷰포트에 들어오는 카메라 (fit-to-view).
 * 문서 오픈 시 1회 적용 — makeTransform이 pan=0에서 도면 중심을 뷰포트
 * 중앙에 정렬하므로 zoom만 계산하면 된다.
 */
export function fitCamera(
  plan: Plan,
  viewport: { w: number; h: number },
  paddingPx = 80,
): { pan: Vec2; zoom: number } {
  const b = planBounds(plan);
  const planW = Math.max(0.5, b.max.x - b.min.x);
  const planH = Math.max(0.5, b.max.y - b.min.y);
  const availW = Math.max(100, viewport.w - paddingPx * 2);
  const availH = Math.max(100, viewport.h - paddingPx * 2);
  const zoom = Math.min(availW / (planW * BASE_PX_PER_M), availH / (planH * BASE_PX_PER_M));
  return { pan: { x: 0, y: 0 }, zoom: Math.min(2, Math.max(0.3, zoom)) };
}

/** CSS px per meter ≈ 3779.5 → "1 : N" 표기용 축척 */
export function scaleRatioLabel(t: ViewTransform): string {
  const n = Math.round(3779.5 / t.s / 5) * 5;
  return `1 : ${Math.max(5, n)}`;
}
