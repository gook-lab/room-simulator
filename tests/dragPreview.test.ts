import { describe, expect, it } from 'vitest';
import { createSamplePlan } from '../src/model/samplePlan';
import { item } from '../src/model/planBuilder';
import { dragOriginPoses } from '../src/features/editor2d/dragPreview';

describe('미리보기=커밋 — 원본 잔상 포즈 (dragOriginPoses)', () => {
  it('단일 이동/회전: 대상 + 표면 적층 자식 포함', () => {
    const plan = createSamplePlan();
    const desk = item('g-desk', 'desk-oak', { x: 20, y: 20 }, 0, null);
    const lamp = {
      ...item('g-lamp', 'lamp-table', { x: 20.2, y: 20.1 }, 0, null),
      parentId: 'g-desk',
    };
    plan.items = [...plan.items, desk, lamp];
    const o = dragOriginPoses(plan, { type: 'move', itemId: 'g-desk' });
    expect(o.items.map((i) => i.id).sort()).toEqual(['g-desk', 'g-lamp']);
    expect(o.walls).toEqual([]);
    // 잔상 포즈는 스냅샷 그대로 (참조 동일 — 복사·변형 없음)
    expect(o.items.find((i) => i.id === 'g-desk')).toBe(desk);
  });

  it('그룹 이동: itemIds 전체', () => {
    const plan = createSamplePlan();
    const ids = plan.items.slice(0, 2).map((i) => i.id);
    const o = dragOriginPoses(plan, { type: 'groupMove', itemIds: ids });
    expect(o.items.map((i) => i.id)).toEqual(ids);
  });

  it('벽 끝점/몸통: 해당 벽 선만', () => {
    const plan = createSamplePlan();
    const wallId = plan.walls[0].id;
    const o = dragOriginPoses(plan, { type: 'wallEndpointMove', wallId });
    expect(o.items).toEqual([]);
    expect(o.walls.map((w) => w.id)).toEqual([wallId]);
    expect(o.walls[0]).toBe(plan.walls[0]);
  });
});
