import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/state/store';
import { floorDeleteConfirmText, floorDeletedText } from '../src/model/floorDelete';
import { floorsOfBuilding } from '../src/model/floorStack';
import { STORAGE_KEY } from '../src/state/persistence';
import type { Plan } from '../src/model/types';

const st = () => useStore.getState();
const cur = () => st().plans[st().currentPlanId];

describe('층 삭제 되돌리기 (QA B-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    st().openPlan(st().planOrder[0]);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const saved = (): Record<string, Plan> =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"plans":{}}').plans;

  it('1층을 지운 뒤 [되돌리기]로 벽 · 가구째 원래 자리에 되살리고 저장한다', () => {
    const firstId = st().currentPlanId;
    st().addFloor('empty');
    const secondId = st().currentPlanId;
    st().openPlan(firstId);
    const first = cur();
    const index = st().planOrder.indexOf(firstId);
    expect(first.items.length).toBeGreaterThan(0);

    st().deleteFloor(firstId);
    vi.advanceTimersByTime(2100);
    expect(st().plans[firstId]).toBeUndefined();
    expect(saved()[firstId]).toBeUndefined();
    expect(st().currentPlanId).toBe(secondId);

    st().restoreFloor(first, index);
    vi.advanceTimersByTime(2100);
    expect(st().currentPlanId).toBe(firstId);
    expect(st().planOrder.indexOf(firstId)).toBe(index);
    expect(cur().items).toHaveLength(first.items.length);
    expect(cur().walls).toHaveLength(first.walls.length);
    expect(floorsOfBuilding(st().plans, cur()).map((p) => p.id)).toEqual([firstId, secondId]);
    expect(saved()[firstId]?.items).toHaveLength(first.items.length);
  });

  it('이미 있는 문서는 다시 넣지 않는다', () => {
    const order = [...st().planOrder];
    st().restoreFloor(cur(), 0);
    expect(st().planOrder).toEqual(order);
  });
});

describe('층 삭제 확인 문구', () => {
  const base = { ...useStore.getState().plans[useStore.getState().planOrder[0]] };

  it('벽 · 가구가 있는 층은 함께 사라진다고 알린다', () => {
    const plan = { ...base, floorLabel: '1층' };
    const text = floorDeleteConfirmText(plan);
    expect(text).toContain("'1층'을 지울까요?");
    expect(text).toContain(
      `벽 ${plan.walls.length}개와 가구 ${plan.items.length + (plan.wallItems?.length ?? 0)}개도 함께 사라져요`,
    );
  });

  it('빈 층은 묻기만 한다', () => {
    const empty = { ...base, floorLabel: '2층', walls: [], items: [], wallItems: [] };
    expect(floorDeleteConfirmText(empty)).toBe("'2층'을 지울까요?");
  });

  it('층 이름 받침에 맞춰 을 · 를을 붙인다', () => {
    const empty = { ...base, walls: [], items: [], wallItems: [] };
    expect(floorDeleteConfirmText({ ...empty, floorLabel: '테라스' })).toBe("'테라스'를 지울까요?");
    expect(floorDeleteConfirmText({ ...empty, floorLabel: 'B1' })).toBe("'B1'을(를) 지울까요?");
    expect(floorDeletedText({ ...empty, floorLabel: '1층' })).toBe("'1층'을 지웠어요");
  });
});
