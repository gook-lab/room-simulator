import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/state/store';
import { STORAGE_KEY } from '../src/state/persistence';
import { discardDraft, withoutDraft } from '../src/state/draftPlan';
import type { Plan } from '../src/model/types';

const blank = (id: string): Plan => ({
  id,
  name: '새 도면',
  unitScale: 60,
  walls: [],
  openings: [],
  rooms: [],
  items: [],
  updatedAt: new Date().toISOString(),
});

/** UploadTrace 의 "빈 도면에서 시작" 과 같은 순서 */
function startBlank(id: string) {
  useStore.getState().addPlan(blank(id), { draft: true });
  useStore.getState().openPlan(id);
}

function stored(): { planOrder: string[] } {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"planOrder":[]}');
}

describe('빈 도면 — 첫 편집 전에는 저장하지 않는다 (QA B-13)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStore.getState().navigate('dashboard');
    vi.advanceTimersByTime(2100);
  });
  afterEach(() => {
    useStore.getState().navigate('dashboard');
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('열기만 하고 대시보드로 나가면 0㎡ 카드가 남지 않는다', () => {
    const before = useStore.getState().planOrder.length;
    startBlank('blank-a');
    expect(useStore.getState().currentPlanId).toBe('blank-a');
    useStore.getState().navigate('dashboard');
    const s = useStore.getState();
    expect(s.plans['blank-a']).toBeUndefined();
    expect(s.planOrder).toHaveLength(before);
    expect(s.planOrder).toContain(s.currentPlanId);
  });

  it('여러 번 눌렀다 나가도 쌓이지 않는다', () => {
    const before = useStore.getState().planOrder.length;
    for (const id of ['blank-1', 'blank-2', 'blank-3']) {
      startBlank(id);
      useStore.getState().navigate('upload');
    }
    expect(useStore.getState().planOrder).toHaveLength(before);
  });

  it('초안은 저장소에 쓰지 않는다 — 탭을 닫아도 다음 방문에 남지 않는다', () => {
    startBlank('blank-b');
    vi.advanceTimersByTime(2100);
    expect(stored().planOrder).not.toContain('blank-b');
    expect(stored().planOrder.length).toBeGreaterThan(0); // 기존 문서는 그대로 저장
  });

  it('첫 벽을 그리면 보통 문서가 되어 저장되고, 나가도 남는다', () => {
    startBlank('blank-c');
    useStore.getState().updatePlan((p) => ({
      ...p,
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness: 0.15, height: 2.4 }],
    }));
    expect(useStore.getState().draftPlanId).toBeNull();
    vi.advanceTimersByTime(2100);
    expect(stored().planOrder).toContain('blank-c');
    useStore.getState().navigate('dashboard');
    expect(useStore.getState().plans['blank-c']).toBeDefined();
  });

  it('이름을 바꾸거나 층을 붙여도 손댄 문서로 본다', () => {
    startBlank('blank-d');
    useStore.getState().renamePlan('blank-d', '우리 집');
    useStore.getState().navigate('dashboard');
    expect(useStore.getState().plans['blank-d']).toBeDefined();
  });

  it('다른 문서를 열면 초안은 지워지고, 저장 병합 가드가 되살리지 않는다', () => {
    const other = useStore.getState().planOrder.find((id) => !id.startsWith('blank'))!;
    startBlank('blank-e');
    useStore.getState().openPlan(other);
    expect(useStore.getState().plans['blank-e']).toBeUndefined();
    vi.advanceTimersByTime(2100);
    expect(stored().planOrder).not.toContain('blank-e');
    expect(useStore.getState().plans['blank-e']).toBeUndefined();
  });

  it('3D 보기로 바꾸는 것은 나가는 게 아니다', () => {
    startBlank('blank-f');
    useStore.getState().setView('walkthrough');
    useStore.getState().setView('2d');
    expect(useStore.getState().plans['blank-f']).toBeDefined();
    expect(useStore.getState().currentPlanId).toBe('blank-f');
  });
});

describe('draftPlan 순수 함수', () => {
  const a = blank('a');
  const d = blank('d');
  const shape = { plans: { a, d }, planOrder: ['d', 'a'] };

  it('withoutDraft 는 초안만 뺀다', () => {
    expect(withoutDraft(shape, 'd')).toEqual({ plans: { a }, planOrder: ['a'] });
    expect(withoutDraft(shape, null)).toBe(shape);
  });

  it('discardDraft 는 마지막 남은 문서는 지우지 않는다', () => {
    const only = discardDraft({ plans: { d }, planOrder: ['d'], currentPlanId: 'd', draftPlanId: 'd' });
    expect(only?.plans.d).toBeDefined();
    expect(only?.draftPlanId).toBeNull();
    const two = discardDraft({ ...shape, currentPlanId: 'd', draftPlanId: 'd' });
    expect(two?.planOrder).toEqual(['a']);
    expect(two?.currentPlanId).toBe('a');
  });
});
