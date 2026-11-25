import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/state/store';

const st = () => useStore.getState();
const cur = () => st().plans[st().currentPlanId];

describe('undo 뒤 선택 유지 (QA B-15)', () => {
  beforeEach(() => st().openPlan(st().planOrder[0]));

  it('되돌린 뒤에도 남아 있는 가구는 계속 선택돼 있다', () => {
    const target = cur().items[0];
    st().setSelection([target.id]);
    st().updatePlan((p) => ({
      ...p,
      items: p.items.map((i) =>
        i.id === target.id ? { ...i, size: { ...i.size, w: i.size.w + 0.3 } } : i,
      ),
    }));
    st().undo();
    expect(st().selection).toEqual([target.id]);
    expect(cur().items.find((i) => i.id === target.id)?.size.w).toBe(target.size.w);
    st().redo();
    expect(st().selection).toEqual([target.id]);
  });

  it('되돌려서 사라진 대상만 선택에서 빠진다', () => {
    const kept = cur().items[0];
    const added = { ...kept, id: 'item-added-for-undo', position: { x: 1, y: 1 } };
    st().updatePlan((p) => ({ ...p, items: [...p.items, added] }));
    st().setSelection([added.id, kept.id, cur().walls[0].id]);
    st().undo();
    expect(st().selection).toEqual([kept.id, cur().walls[0].id]);
  });
});
