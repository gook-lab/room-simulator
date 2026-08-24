import { describe, expect, it } from 'vitest';
import { groupProblems, itemsInRect, translateItems } from '../src/features/editor2d/interactions';
import { createSamplePlan } from '../src/model/samplePlan';

describe('itemsInRect (마퀴 다중 선택)', () => {
  const plan = createSamplePlan();

  it('사각형 안 중심의 아이템만 선택', () => {
    // 거실 좌측 절반: 소파·커피·러그·체어·램프 등
    const ids = itemsInRect(plan, { x: 0, y: 3 }, { x: 3.5, y: 6 });
    expect(ids).toContain('i-sofa');
    expect(ids).toContain('i-coffee');
    expect(ids).not.toContain('i-bed'); // 침실
    expect(ids).not.toContain('i-tv'); // 북쪽 벽
  });

  it('좌표 순서 무관 (역방향 드래그)', () => {
    const a = itemsInRect(plan, { x: 0, y: 3 }, { x: 3.5, y: 6 });
    const b = itemsInRect(plan, { x: 3.5, y: 6 }, { x: 0, y: 3 });
    expect(b).toEqual(a);
  });

  it('빈 영역이면 빈 배열', () => {
    expect(itemsInRect(plan, { x: -3, y: -3 }, { x: -1, y: -1 })).toEqual([]);
  });
});

describe('translateItems (그룹 이동)', () => {
  it('선택된 아이템만 delta 만큼 이동 + roomId 재배정', () => {
    const plan = createSamplePlan();
    const moved = translateItems(plan, ['i-sofa', 'i-coffee'], { x: 0.5, y: -0.5 });
    const sofa0 = plan.items.find((i) => i.id === 'i-sofa')!;
    const sofa1 = moved.items.find((i) => i.id === 'i-sofa')!;
    expect(sofa1.position).toEqual({ x: sofa0.position.x + 0.5, y: sofa0.position.y - 0.5 });
    // 미선택 아이템 불변 (참조 동일)
    expect(moved.items.find((i) => i.id === 'i-bed')).toBe(
      plan.items.find((i) => i.id === 'i-bed'),
    );
  });

  it('거실 → 침실로 이동하면 roomId 갱신', () => {
    const plan = createSamplePlan();
    // 체어 (1.0,1.4) → 침실 중앙 근처로
    const moved = translateItems(plan, ['i-chair'], { x: 7.0, y: 0.5 });
    expect(moved.items.find((i) => i.id === 'i-chair')!.roomId).toBe('r-bed');
  });

  it('빈 ids·zero delta 는 no-op', () => {
    const plan = createSamplePlan();
    expect(translateItems(plan, [], { x: 1, y: 1 })).toBe(plan);
    expect(translateItems(plan, ['i-sofa'], { x: 0, y: 0 })).toBe(plan);
  });
});

describe('groupProblems (그룹 충돌·문 존)', () => {
  it('그룹 멤버끼리는 충돌로 치지 않는다', () => {
    const plan = createSamplePlan();
    // 소파와 커피 테이블은 서로 인접 — 함께 선택하면 상호 충돌 없음
    const { collisions } = groupProblems(plan, ['i-sofa', 'i-coffee', 'i-rug']);
    expect(collisions).toEqual([]);
  });

  it('그룹이 외부 아이템과 겹치면 검출', () => {
    const plan = createSamplePlan();
    // 소파를 침대 위치로 옮긴 상태의 그룹 검사
    const moved = translateItems(plan, ['i-sofa'], { x: 5.0, y: -3.45 }); // → (7.6, 1.45) = 침대 위
    const { collisions } = groupProblems(moved, ['i-sofa']);
    expect(collisions).toContain('i-bed');
  });

  it('그룹이 문 존을 막으면 blockedDoors 검출', () => {
    const plan = createSamplePlan();
    // 체어를 침실 문 스윙 존(4.45..5.35 × 2.46..3.36)으로
    const moved = translateItems(plan, ['i-chair'], { x: 3.9, y: 1.5 }); // → (4.9, 2.9)
    const { blockedDoors } = groupProblems(moved, ['i-chair']);
    expect(blockedDoors).toContain('o-door-bed');
  });
});
