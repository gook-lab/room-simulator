import { describe, expect, it } from 'vitest';
import { createSamplePlan } from '../src/model/samplePlan';
import { item } from '../src/model/planBuilder';
import { aggregateLibrary, shoppingListText } from '../src/model/library';
import { useStore } from '../src/state/store';

describe('가구 라이브러리 (견적 재포지셔닝)', () => {
  it('카탈로그 단위 집계 — 실판매가 항목만 가격, 실합계/추정포함 분리', () => {
    const plan = createSamplePlan();
    plan.items = [
      item('a1', 'sofa-linen-3', { x: 1, y: 1 }, 0, null), // 실판매가 (KIVIK)
      item('a2', 'chair-dining', { x: 2, y: 1 }, 0, null), // 실판매가 (TEODORES)
      item('a3', 'chair-dining', { x: 3, y: 1 }, 0, null),
      item('a4', 'sofa-lounge-1', { x: 4, y: 1 }, 0, null), // 미연동 — 추정
    ];
    plan.wallItems = [];
    const lib = aggregateLibrary(plan);
    expect(lib.rows).toHaveLength(3);
    const chair = lib.rows.find((r) => r.catalogId === 'chair-dining')!;
    expect(chair.count).toBe(2);
    expect(chair.priceKrw).toBe(39900);
    const lounge = lib.rows.find((r) => r.catalogId === 'sofa-lounge-1')!;
    expect(lounge.priceKrw).toBeUndefined(); // 추정가는 행에 표시하지 않음
    expect(lib.realSum).toBe(749000 + 39900 * 2);
    expect(lib.realCount).toBe(3);
    expect(lib.estCount).toBe(1);
    expect(lib.totalSum).toBeGreaterThan(lib.realSum);
    // 실판매가 항목이 앞에 정렬
    expect(lib.rows[lib.rows.length - 1].catalogId).toBe('sofa-lounge-1');
  });

  it('shoppingListText: 링크·수량·실합계 포함', () => {
    const plan = createSamplePlan();
    plan.items = [
      item('a1', 'chair-dining', { x: 1, y: 1 }, 0, null),
      item('a2', 'chair-dining', { x: 2, y: 1 }, 0, null),
    ];
    plan.wallItems = [];
    const text = shoppingListText(plan);
    expect(text).toContain('×2');
    expect(text).toContain('ikea.com');
    expect(text).toContain('실판매가 합계(2점)');
  });
});

describe('문서 관리 액션 (rename/duplicate/delete)', () => {
  it('renamePlan: 층 연결 문서는 건물 전체 이름 변경', () => {
    const st = useStore.getState();
    st.openPlan(st.planOrder[st.planOrder.length - 1]);
    st.addFloor('empty'); // 1층 승격 + 2층
    const secondId = useStore.getState().currentPlanId;
    const buildingId = useStore.getState().plans[secondId].buildingId!;
    useStore.getState().renamePlan(secondId, '우리집 v2');
    const floors = Object.values(useStore.getState().plans).filter(
      (p) => p.buildingId === buildingId,
    );
    expect(floors.length).toBeGreaterThanOrEqual(2);
    for (const f of floors) expect(f.name).toBe('우리집 v2');
  });

  it('duplicatePlan: 사본은 건물 연결 해제 + " 사본" 이름', () => {
    const st = useStore.getState();
    const srcId = st.currentPlanId;
    st.duplicatePlan(srcId);
    const copy = Object.values(useStore.getState().plans).find((p) => p.name.endsWith(' 사본'))!;
    expect(copy).toBeDefined();
    expect(copy.buildingId).toBeUndefined();
    expect(copy.walls.length).toBe(useStore.getState().plans[srcId].walls.length);
  });
});
