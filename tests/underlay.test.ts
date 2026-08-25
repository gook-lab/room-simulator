import { describe, expect, it } from 'vitest';
import { DEFAULT_UNDERLAY_WIDTH_M, linesToWalls, rescaleTracing, underlaySize } from '../src/model/underlay';
import { planBounds } from '../src/model/geometry';
import type { Plan, Tracing } from '../src/model/types';

const tracing: Tracing = {
  imageUrl: 'data:,x',
  opacity: 0.5,
  locked: true,
  visible: true,
  widthM: 10,
  heightM: 7,
};

describe('언더레이 즉시 로드 (underlay)', () => {
  it('underlaySize: 이미지 종횡비 유지, 기본 폭 10m', () => {
    const s = underlaySize(2897, 2049);
    expect(s.widthM).toBe(DEFAULT_UNDERLAY_WIDTH_M);
    expect(s.heightM).toBeCloseTo(10 * (2049 / 2897), 3);
  });

  it('rescaleTracing: 배율 적용, 무효 배율은 무시', () => {
    const r = rescaleTracing(tracing, 1.5);
    expect(r.widthM).toBeCloseTo(15, 6);
    expect(r.heightM).toBeCloseTo(10.5, 6);
    expect(rescaleTracing(tracing, 0)).toBe(tracing);
    expect(rescaleTracing(tracing, NaN)).toBe(tracing);
  });

  it('linesToWalls: 검출 px → 월드 비례 변환', () => {
    let n = 0;
    const walls = linesToWalls(
      [{ points: [{ x: 0, y: 0 }, { x: 390, y: 0 }] }],
      780,
      546,
      10,
      7,
      () => `w${n++}`,
    );
    expect(walls).toHaveLength(1);
    expect(walls[0].a).toEqual({ x: 0, y: 0 });
    expect(walls[0].b).toEqual({ x: 5, y: 0 });
  });

  it('planBounds: 벽 없는 언더레이 문서는 밑그림 영역이 범위', () => {
    const plan = { walls: [], tracing } as unknown as Plan;
    expect(planBounds(plan)).toEqual({ min: { x: 0, y: 0 }, max: { x: 10, y: 7 } });
  });
});
