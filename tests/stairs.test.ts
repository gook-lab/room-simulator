import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER, catalogById, searchCatalog } from '../src/model/catalog';
import { NON_COLLIDING_SHAPES } from '../src/features/editor2d/symbols';
import { useStore } from '../src/state/store';

describe('계단 (수동 배치 + 층 전환)', () => {
  it('카탈로그: 직진·L자 계단, 검색 별칭 "계단"', () => {
    expect(catalogById.get('stairs-straight')?.shape).toBe('stairs');
    expect(catalogById.get('stairs-l')?.shape).toBe('stairs');
    const found = searchCatalog('계단').map((c) => c.id);
    expect(found).toContain('stairs-straight');
    expect(found).toContain('stairs-l');
  });

  it('계단은 워크스루 충돌 제외 (위로 걸어 들어가 트리거 사용)', () => {
    expect(NON_COLLIDING_SHAPES.has('stairs')).toBe(true);
  });

  it('switchFloor: 현재 화면 유지한 채 층 전환', () => {
    const st = useStore.getState();
    st.openPlan(st.planOrder[st.planOrder.length - 1]);
    st.addFloor('empty');
    const secondId = useStore.getState().currentPlanId;
    const buildingId = useStore.getState().plans[secondId].buildingId!;
    const firstId = Object.values(useStore.getState().plans).find(
      (p) => p.buildingId === buildingId && p.id !== secondId,
    )!.id;
    useStore.getState().setView('walkthrough');
    useStore.getState().switchFloor(firstId);
    const after = useStore.getState();
    expect(after.currentPlanId).toBe(firstId);
    expect(after.view).toBe('walkthrough'); // 화면 유지
    expect(after.walkthroughSpawn).toBeNull();
    useStore.getState().setView('2d');
  });
});

describe('계단 발견성 — 구조 카테고리', () => {
  it("계단 2종은 category 'structure' 이고, '구조' 탭은 pill 순서 앞쪽(3번째)", () => {
    expect(catalogById.get('stairs-straight')?.category).toBe('structure');
    expect(catalogById.get('stairs-l')?.category).toBe('structure');
    expect(CATEGORY_ORDER[2]).toBe('structure');
  });
});
