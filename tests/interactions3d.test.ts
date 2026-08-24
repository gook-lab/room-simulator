import { describe, expect, it } from 'vitest';
import {
  isInteractiveItem,
  isLightItem,
  isPowered,
  togglePower,
} from '../src/model/interactions3d';
import { createSamplePlan } from '../src/model/samplePlan';

describe('isLightItem / isInteractiveItem', () => {
  it('플로어 램프·펜던트는 조명', () => {
    expect(isLightItem('lamp-floor')).toBe(true);
    expect(isLightItem('lamp-pendant')).toBe(true);
    expect(isInteractiveItem('lamp-stand-3')).toBe(true);
  });

  it('소파·러그는 조명 아님', () => {
    expect(isLightItem('sofa-linen-3')).toBe(false);
    expect(isLightItem('rug-wool-l')).toBe(false);
    expect(isLightItem('unknown-id')).toBe(false);
  });
});

describe('isPowered', () => {
  it('undefined 는 켜짐(기본)', () => {
    expect(isPowered({})).toBe(true);
    expect(isPowered({ powered: true })).toBe(true);
    expect(isPowered({ powered: false })).toBe(false);
  });
});

describe('togglePower', () => {
  it('조명 토글: 기본(켜짐) → 꺼짐 → 켜짐', () => {
    const plan = createSamplePlan();
    const off = togglePower(plan, 'i-lamp-floor');
    expect(isPowered(off.items.find((i) => i.id === 'i-lamp-floor')!)).toBe(false);
    const on = togglePower(off, 'i-lamp-floor');
    expect(isPowered(on.items.find((i) => i.id === 'i-lamp-floor')!)).toBe(true);
  });

  it('다른 아이템은 건드리지 않는다', () => {
    const plan = createSamplePlan();
    const off = togglePower(plan, 'i-lamp-floor');
    for (const item of off.items) {
      if (item.id !== 'i-lamp-floor') {
        expect(item).toBe(plan.items.find((i) => i.id === item.id));
      }
    }
  });

  it('조명이 아닌 아이템은 no-op (plan 그대로 반환)', () => {
    const plan = createSamplePlan();
    expect(togglePower(plan, 'i-sofa')).toBe(plan);
  });

  it('없는 아이템도 no-op', () => {
    const plan = createSamplePlan();
    expect(togglePower(plan, 'nope')).toBe(plan);
  });
});

describe('lampPartColors (조명 색상 배선 회귀)', () => {
  it('마감 스와치 색이 몸체에 반영된다', async () => {
    const { lampPartColors } = await import('../src/features/editor2d/symbols');
    const brass = lampPartColors('#e3c77e');
    expect(brass.body).toBe('#e3c77e');
    const black = lampPartColors('#3d4742');
    expect(black.body).toBe('#3d4742');
    expect(black.bodyDark).not.toBe(black.body);
  });

  it('발광부는 warm 고정 (variant 무관)', async () => {
    const { lampPartColors } = await import('../src/features/editor2d/symbols');
    expect(lampPartColors('#3d4742').glow).toBe('#efd9a8');
    expect(lampPartColors('#f2efe9').glow).toBe('#efd9a8');
  });
});
