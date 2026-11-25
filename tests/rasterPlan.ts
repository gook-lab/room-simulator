import type { Vec2 } from '../src/model/types';

/**
 * 테스트용 도면 래스터 — 캔버스 없이 autoTrace 가 받는 RGBA 픽셀을 만든다.
 * 도형마다 4×4 부분 표본으로 덮인 비율을 재어 회색을 섞으므로, 축소해 그린
 * 이미지의 가장자리 반투명 픽셀(캔버스 drawImage 의 보간)과 비슷해진다.
 */
export type Shape =
  /** 채운 축 정렬 사각형 (원본 px) */
  | { rect: [number, number, number, number]; lum?: number }
  /** 채운 다각형 (원본 px) — 사선 벽용 */
  | { poly: Vec2[]; lum?: number };

const SUB = 4;

function inPoly(x: number, y: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** w×h 흰 종이에 shapes 를 scale 배로 그린 RGBA 배열 */
export function rasterPlan(w: number, h: number, shapes: Shape[], scale = 1): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const s of shapes) {
    const lum = s.lum ?? 0;
    const pts =
      'rect' in s
        ? [
            { x: s.rect[0], y: s.rect[1] },
            { x: s.rect[2], y: s.rect[1] },
            { x: s.rect[2], y: s.rect[3] },
            { x: s.rect[0], y: s.rect[3] },
          ]
        : s.poly;
    const poly = pts.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const x0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.x))));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(...poly.map((p) => p.x))));
    const y0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let hit = 0;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            if (inPoly(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB, poly)) hit++;
          }
        }
        if (!hit) continue;
        const cov = hit / (SUB * SUB);
        const i = (y * w + x) * 4;
        const v = Math.round(data[i] * (1 - cov) + lum * cov);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
    }
  }
  return data;
}

/** 선분 a→b 를 굵기 t 의 띠(사각 끝)로 — SVG stroke 의 사각 모서리 대용 */
export function strokeBand(a: Vec2, b: Vec2, t: number): Vec2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const nx = -uy * (t / 2);
  const ny = ux * (t / 2);
  const ex = ux * (t / 2);
  const ey = uy * (t / 2);
  return [
    { x: a.x - ex + nx, y: a.y - ey + ny },
    { x: b.x + ex + nx, y: b.y + ey + ny },
    { x: b.x + ex - nx, y: b.y + ey - ny },
    { x: a.x - ex - nx, y: a.y - ey - ny },
  ];
}
