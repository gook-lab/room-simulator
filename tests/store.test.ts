import { beforeEach, describe, expect, it, vi } from 'vitest';
import { timeAgoLabel, useStore } from '../src/state/store';

function resetStore() {
  const s = useStore.getState();
  // 첫 플랜으로 복귀 + 히스토리 초기화
  s.openPlan(s.planOrder[0]);
}

describe('store: updatePlan + undo/redo (명령 단위)', () => {
  beforeEach(resetStore);

  it('commit 변경은 undo로 되돌아간다', () => {
    const s = useStore.getState();
    const before = s.plans[s.currentPlanId].items.length;
    s.updatePlan((pl) => ({ ...pl, items: pl.items.slice(1) }));
    expect(useStore.getState().plans[useStore.getState().currentPlanId].items).toHaveLength(before - 1);
    useStore.getState().undo();
    expect(useStore.getState().plans[useStore.getState().currentPlanId].items).toHaveLength(before);
  });

  it('redo는 undo를 재적용', () => {
    const s = useStore.getState();
    const before = s.plans[s.currentPlanId].items.length;
    s.updatePlan((pl) => ({ ...pl, items: pl.items.slice(1) }));
    useStore.getState().undo();
    useStore.getState().redo();
    expect(useStore.getState().plans[useStore.getState().currentPlanId].items).toHaveLength(before - 1);
  });

  it('commit:false 변경은 히스토리에 남지 않는다 (드래그 중간 프레임)', () => {
    const s = useStore.getState();
    const pastLen = s.history.past.length;
    s.updatePlan((pl) => ({ ...pl, name: '드래그 중' }), { commit: false });
    expect(useStore.getState().history.past).toHaveLength(pastLen);
  });

  it('pushHistory: 제스처 시작 스냅샷 1개가 undo 1회로 복원 (명령 단위)', () => {
    const s = useStore.getState();
    const snapshot = s.plans[s.currentPlanId];
    // 드래그 중간 프레임 여러 번 (비커밋)
    for (let i = 0; i < 5; i++) {
      useStore.getState().updatePlan(
        (pl) => ({
          ...pl,
          items: pl.items.map((it, idx) =>
            idx === 0 ? { ...it, position: { x: it.position.x + 0.1, y: it.position.y } } : it,
          ),
        }),
        { commit: false },
      );
    }
    useStore.getState().pushHistory(snapshot);
    const movedX = useStore.getState().plans[useStore.getState().currentPlanId].items[0].position.x;
    expect(movedX).toBeCloseTo(snapshot.items[0].position.x + 0.5);
    useStore.getState().undo();
    const restoredX = useStore.getState().plans[useStore.getState().currentPlanId].items[0].position.x;
    expect(restoredX).toBeCloseTo(snapshot.items[0].position.x);
  });

  it('새 커밋은 redo 스택을 비운다', () => {
    const s = useStore.getState();
    s.updatePlan((pl) => ({ ...pl, name: 'A' }));
    useStore.getState().undo();
    expect(useStore.getState().history.future.length).toBeGreaterThan(0);
    useStore.getState().updatePlan((pl) => ({ ...pl, name: 'B' }));
    expect(useStore.getState().history.future).toHaveLength(0);
  });
});

describe('store: localStorage 저장 (2s 디바운스 직렬화)', () => {
  beforeEach(resetStore);

  it('변경 2초 후 직렬화되어 저장된다', () => {
    vi.useFakeTimers();
    try {
      localStorage.removeItem('roomcast.plans.v1');
      useStore.getState().updatePlan((pl) => ({ ...pl, name: '저장 테스트' }));
      expect(localStorage.getItem('roomcast.plans.v1')).toBeNull();
      vi.advanceTimersByTime(2100);
      const raw = localStorage.getItem('roomcast.plans.v1');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.plans[useStore.getState().currentPlanId].name).toBe('저장 테스트');
      expect(parsed.planOrder).toEqual(useStore.getState().planOrder);
    } finally {
      vi.useRealTimers();
    }
  });

  it('연속 변경은 마지막 상태만 저장 (디바운스)', () => {
    vi.useFakeTimers();
    try {
      localStorage.removeItem('roomcast.plans.v1');
      useStore.getState().updatePlan((pl) => ({ ...pl, name: '1' }));
      vi.advanceTimersByTime(1000);
      useStore.getState().updatePlan((pl) => ({ ...pl, name: '2' }));
      vi.advanceTimersByTime(1000);
      expect(localStorage.getItem('roomcast.plans.v1')).toBeNull();
      vi.advanceTimersByTime(1100);
      const parsed = JSON.parse(localStorage.getItem('roomcast.plans.v1')!);
      expect(parsed.plans[useStore.getState().currentPlanId].name).toBe('2');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('store: openPlan / addPlan', () => {
  beforeEach(resetStore);

  it('openPlan은 히스토리·선택을 초기화한다', () => {
    const s = useStore.getState();
    s.updatePlan((pl) => ({ ...pl, name: 'X' }));
    s.openPlan(s.planOrder[1]);
    const after = useStore.getState();
    expect(after.currentPlanId).toBe(after.planOrder[1]);
    expect(after.history.past).toHaveLength(0);
    expect(after.selection).toHaveLength(0);
  });

  it('addPlan은 목록 맨 앞에 추가', () => {
    const s = useStore.getState();
    const plan = { ...s.plans[s.currentPlanId], id: 'plan-new', name: '새 도면' };
    s.addPlan(plan);
    expect(useStore.getState().planOrder[0]).toBe('plan-new');
    expect(useStore.getState().plans['plan-new'].name).toBe('새 도면');
  });
});

describe('timeAgoLabel', () => {
  it('방금 / N분 전 표기', () => {
    expect(timeAgoLabel(Date.now())).toBe('방금 저장');
    expect(timeAgoLabel(Date.now() - 3 * 60_000)).toBe('3분 전 저장');
    expect(timeAgoLabel(Date.now() - 2 * 60 * 60_000)).toBe('2시간 전 저장');
  });
});

describe('히스토리 코얼레싱 (400ms 연타 묶기)', () => {
  it('같은 coalesceKey 연속 커밋은 히스토리 1개 — undo 한 번에 복원', () => {
    vi.useFakeTimers();
    try {
      const s = useStore.getState();
      s.openPlan(s.planOrder[0]);
      const origName = useStore.getState().plans[useStore.getState().currentPlanId].name;
      const pastLen = () => useStore.getState().history.past.length;
      const base = pastLen();
      useStore.getState().updatePlan((pl) => ({ ...pl, name: 'A' }), { coalesceKey: 'k1' });
      vi.advanceTimersByTime(100);
      useStore.getState().updatePlan((pl) => ({ ...pl, name: 'B' }), { coalesceKey: 'k1' });
      vi.advanceTimersByTime(100);
      useStore.getState().updatePlan((pl) => ({ ...pl, name: 'C' }), { coalesceKey: 'k1' });
      expect(pastLen()).toBe(base + 1); // 3연타 = 히스토리 1개
      useStore.getState().undo();
      expect(useStore.getState().plans[useStore.getState().currentPlanId].name).toBe(origName);
    } finally {
      vi.useRealTimers();
    }
  });

  it('키가 다르거나 400ms 지나면 별도 엔트리', () => {
    vi.useFakeTimers();
    try {
      const s = useStore.getState();
      s.openPlan(s.planOrder[0]);
      const pastLen = () => useStore.getState().history.past.length;
      const base = pastLen();
      useStore.getState().updatePlan((pl) => ({ ...pl, name: 'A' }), { coalesceKey: 'k1' });
      useStore.getState().updatePlan((pl) => ({ ...pl, name: 'B' }), { coalesceKey: 'k2' });
      expect(pastLen()).toBe(base + 2);
      vi.advanceTimersByTime(500);
      useStore.getState().updatePlan((pl) => ({ ...pl, name: 'C' }), { coalesceKey: 'k2' });
      expect(pastLen()).toBe(base + 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('undo 후 같은 키 커밋은 코얼레싱되지 않는다 (체인 절단)', () => {
    const s = useStore.getState();
    s.openPlan(s.planOrder[0]);
    const pastLen = () => useStore.getState().history.past.length;
    useStore.getState().updatePlan((pl) => ({ ...pl, name: 'A' }), { coalesceKey: 'k1' });
    useStore.getState().undo();
    const base = pastLen();
    useStore.getState().updatePlan((pl) => ({ ...pl, name: 'B' }), { coalesceKey: 'k1' });
    expect(pastLen()).toBe(base + 1);
  });
});

describe('store: Hand 도구 (H)', () => {
  it("setTool('hand') — 도구 전환 + 진행 중 배치 취소", () => {
    const s = useStore.getState();
    s.setPlacing('sofa-linen-3');
    expect(useStore.getState().placingCatalogId).toBe('sofa-linen-3');
    useStore.getState().setTool('hand');
    expect(useStore.getState().tool).toBe('hand');
    expect(useStore.getState().placingCatalogId).toBeNull();
    useStore.getState().setTool('select');
  });

  it('팬 델타: 시작 pan + (현재 - 시작 스크린) — 순수 수식 고정', () => {
    // Editor2D pan 제스처의 수식 계약 (startPan + Δscreen)
    const startPan = { x: 30, y: -12 };
    const startScreen = { x: 400, y: 300 };
    const cur = { x: 460, y: 255 };
    expect({
      x: startPan.x + (cur.x - startScreen.x),
      y: startPan.y + (cur.y - startScreen.y),
    }).toEqual({ x: 90, y: -57 });
  });
});
