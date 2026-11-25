import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// tokens.css 값이 바뀌어도 작은 글자 대비(WCAG AA 4.5:1)가 무너지지 않게 묶어 둔다.
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`토큰 없음: --${name}`);
  return m[1].trim();
}

type Rgba = [number, number, number, number];

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], +rgba[4]];
  throw new Error(`색 해석 실패: ${value}`);
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const t = (name: string) => parse(token(name));
const WHITE = parse('#ffffff');

describe('글자 대비 — 작은 글자 4.5:1', () => {
  it.each([
    ['text-muted', 'panel'],
    ['text-muted', 'app-bg'],
    ['text-muted', 'canvas-bg'],
    ['text-muted', 'panel-sunken'],
    ['text-3', 'neutral-fill'],
    ['accent-deep', 'panel'],
    ['accent-deep', 'accent-tint'],
    ['accent-deep', 'app-bg'],
    ['warn-deep', 'warn-tint'],
  ])('--%s 글자 / --%s 바탕', (fg, bg) => {
    expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('기본 버튼 흰 글자 / --accent-deep 바탕, hover 바탕은 더 진하다', () => {
    expect(contrast(WHITE, t('accent-deep'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, t('accent-deeper'))).toBeGreaterThan(contrast(WHITE, t('accent-deep')));
  });
});
