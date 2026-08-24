import { describe, expect, it } from 'vitest';
import {
  canPlaceWallItem,
  clampWallT,
  createWallItem,
  defaultMountHeight,
  isWallCatalogItem,
  moveWallItem,
  wallItemOverlapsOpening,
} from '../src/model/wallItems';
import { createSamplePlan } from '../src/model/samplePlan';
import { priceByRoom, totalPrice } from '../src/model/geometry';
import { exportPlan, importPlan } from '../src/model/planIO';

describe('벽 부착 판별·기본 높이', () => {
  it('frame/wall-clock/wall-mirror 만 벽 부착', () => {
    expect(isWallCatalogItem('frame-s')).toBe(true);
    expect(isWallCatalogItem('frame-l')).toBe(true);
    expect(isWallCatalogItem('wall-clock')).toBe(true);
    expect(isWallCatalogItem('wall-mirror')).toBe(true);
    expect(isWallCatalogItem('sofa-linen-3')).toBe(false);
    expect(isWallCatalogItem('mirror-standing')).toBe(false); // 전신 거울은 바닥형
  });

  it('shape별 기본 부착 높이', () => {
    expect(defaultMountHeight('frame-s')).toBe(1.5);
    expect(defaultMountHeight('wall-clock')).toBe(1.85);
    expect(defaultMountHeight('wall-mirror')).toBe(1.35);
  });
});

describe('개구부 겹침 금지 (배치 가능 판정)', () => {
  const plan = createSamplePlan();
  // w-n(10.4m)의 거실 창: t=0.25, w=1.8 → span 1.7..3.5

  it('개구부와 겹치면 금지', () => {
    expect(wallItemOverlapsOpening(plan, 'w-n', 0.25, 0.9)).toBe(true);
    expect(canPlaceWallItem(plan, 'w-n', 0.25, 'frame-l')).toBe(false);
  });

  it('개구부 밖 빈 벽이면 허용', () => {
    // t=0.05 → span 0.32..0.72 (창 1.7 이전)
    expect(canPlaceWallItem(plan, 'w-n', 0.05, 'frame-s')).toBe(true);
  });

  it('없는 벽은 금지', () => {
    expect(canPlaceWallItem(plan, 'w-ghost', 0.5, 'frame-s')).toBe(false);
  });

  it('기존 벽 부착 아이템과 겹치면 금지, 자기 자신은 무시', () => {
    const wi = createWallItem('frame-l', 'w-n', 0.05, 'front');
    const withItem = { ...plan, wallItems: [wi] };
    expect(canPlaceWallItem(withItem, 'w-n', 0.06, 'frame-s')).toBe(false);
    expect(canPlaceWallItem(withItem, 'w-n', 0.05, 'frame-l', wi.id)).toBe(true);
  });
});

describe('clampWallT', () => {
  const plan = createSamplePlan();

  it('벽 끝에서 아이템이 온전히 들어가도록 클램프', () => {
    // w-n 길이 10.4, frame-l w=0.9 → half t = 0.0433
    expect(clampWallT(plan, 'w-n', 0, 0.9)).toBeCloseTo(0.9 / 2 / 10.4, 4);
    expect(clampWallT(plan, 'w-n', 1, 0.9)).toBeCloseTo(1 - 0.9 / 2 / 10.4, 4);
    expect(clampWallT(plan, 'w-n', 0.5, 0.9)).toBe(0.5);
  });
});

describe('moveWallItem + 견적 통합', () => {
  it('patch 적용·없는 id no-op', () => {
    const wi = createWallItem('wall-clock', 'w-n', 0.05, 'front');
    const plan = { ...createSamplePlan(), wallItems: [wi] };
    const moved = moveWallItem(plan, wi.id, { t: 0.1, heightM: 2.0 });
    expect(moved.wallItems![0].t).toBe(0.1);
    expect(moved.wallItems![0].heightM).toBe(2.0);
    expect(moveWallItem(plan, 'nope', { t: 0.2 })).toBe(plan);
  });

  it('totalPrice·priceByRoom 에 벽 부착 포함 (기타(벽) 그룹)', () => {
    const base = createSamplePlan();
    const wi = createWallItem('frame-l', 'w-n', 0.05, 'front');
    const plan = { ...base, wallItems: [wi] };
    expect(totalPrice(plan)).toBe(totalPrice(base) + wi.price);
    const etc = priceByRoom(plan).find((r) => r.roomId === null);
    expect(etc?.roomName).toBe('기타(벽)');
    expect(etc?.sum).toBe(wi.price);
  });
});

describe('planIO 벽 부착 round-trip', () => {
  it('wallItems 보존 + 잘못된 데이터 거부', () => {
    const wi = createWallItem('wall-mirror', 'w-w', 0.4, 'back', 1);
    const plan = { ...createSamplePlan(), wallItems: [wi] };
    const result = importPlan(exportPlan(plan));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.wallItems).toHaveLength(1);
      expect(result.plan.wallItems![0]).toEqual(wi);
    }
    // 없는 벽 참조 거부
    const bad = JSON.parse(exportPlan(plan));
    bad.plan.wallItems[0].wallId = 'w-ghost';
    const r2 = importPlan(JSON.stringify(bad));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain('w-ghost');
  });
});
