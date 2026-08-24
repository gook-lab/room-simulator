import { beforeEach, describe, expect, it } from 'vitest';
import { dimensionNear } from '../src/features/editor2d/interactions';
import { createSamplePlan } from '../src/model/samplePlan';
import { useStore } from '../src/state/store';

const PX_PER_M = 66;

describe('영속 치수 주석', () => {
  it('dimensionNear: 치수선 근처 클릭을 검출', () => {
    const plan = {
      ...createSamplePlan(),
      dimensions: [
        { id: 'dim-1', a: { x: 1, y: 1 }, b: { x: 4, y: 1 } },
        { id: 'dim-2', a: { x: 6, y: 2 }, b: { x: 6, y: 5 } },
      ],
    };
    expect(dimensionNear(plan, { x: 2.5, y: 1.05 }, PX_PER_M)).toBe('dim-1');
    expect(dimensionNear(plan, { x: 6.08, y: 3.5 }, PX_PER_M)).toBe('dim-2');
    expect(dimensionNear(plan, { x: 2.5, y: 3.0 }, PX_PER_M)).toBeNull();
    // 임계(10px≈0.15m) 밖
    expect(dimensionNear(plan, { x: 2.5, y: 1.3 }, PX_PER_M)).toBeNull();
  });

  it('dimensions 없는 기존 plan에서도 안전 (optional 필드)', () => {
    const plan = createSamplePlan();
    expect(plan.dimensions).toBeUndefined();
    expect(dimensionNear(plan, { x: 2, y: 2 }, PX_PER_M)).toBeNull();
  });
});

describe('치수 주석 추가·삭제 (store, 명령 단위 undo)', () => {
  beforeEach(() => {
    const s = useStore.getState();
    s.openPlan(s.planOrder[0]);
  });

  it('추가 → undo → redo', () => {
    const s = useStore.getState();
    s.updatePlan((pl) => ({
      ...pl,
      dimensions: [...(pl.dimensions ?? []), { id: 'dim-t', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }],
    }));
    const cur = () => useStore.getState().plans[useStore.getState().currentPlanId];
    expect(cur().dimensions).toHaveLength(1);
    useStore.getState().undo();
    expect(cur().dimensions ?? []).toHaveLength(0);
    useStore.getState().redo();
    expect(cur().dimensions).toHaveLength(1);
  });

  it('삭제도 undo 대상', () => {
    const s = useStore.getState();
    s.updatePlan((pl) => ({
      ...pl,
      dimensions: [{ id: 'dim-t', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }],
    }));
    useStore.getState().updatePlan((pl) => ({
      ...pl,
      dimensions: (pl.dimensions ?? []).filter((d) => d.id !== 'dim-t'),
    }));
    const cur = () => useStore.getState().plans[useStore.getState().currentPlanId];
    expect(cur().dimensions).toHaveLength(0);
    useStore.getState().undo();
    expect(cur().dimensions).toHaveLength(1);
  });
});
