import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/state/store';
import { exportPlan, importPlan } from '../src/model/planIO';

const st = () => useStore.getState();
const cur = () => st().plans[st().currentPlanId];

describe('다층 (층=연결된 문서)', () => {
  beforeEach(() => {
    // 첫 문서로 이동
    st().openPlan(st().planOrder[st().planOrder.length - 1]);
  });

  it('addFloor(empty): 현재 문서 1층 승격 + 빈 2층 생성·전환', () => {
    const before = cur();
    st().addFloor('empty');
    const after = cur();
    expect(after.id).not.toBe(before.id);
    expect(after.floorLabel).toBe('2층');
    expect(after.walls).toHaveLength(0);
    expect(after.buildingId).toBeTruthy();
    // 원래 문서가 1층으로 승격
    const promoted = st().plans[before.id];
    expect(promoted.buildingId).toBe(after.buildingId);
    expect(promoted.floorLabel).toBe('1층');
    expect(after.name).toBe(before.name); // 건물 이름 공유
  });

  it('addFloor(duplicate): 현재 층 복제', () => {
    const src = cur();
    st().addFloor('duplicate');
    const dup = cur();
    expect(dup.walls.length).toBe(src.walls.length);
    expect(dup.items.length).toBe(src.items.length);
    expect(dup.id).not.toBe(src.id);
  });

  it('renameFloor / deleteFloor: 삭제 시 같은 건물 다른 층으로 전환', () => {
    st().addFloor('empty');
    const secondId = st().currentPlanId;
    st().renameFloor(secondId, '옥탑');
    expect(st().plans[secondId].floorLabel).toBe('옥탑');
    const buildingId = st().plans[secondId].buildingId;
    st().deleteFloor(secondId);
    expect(st().plans[secondId]).toBeUndefined();
    expect(cur().buildingId).toBe(buildingId); // 같은 건물의 남은 층
  });

  it('planIO: buildingId/floorLabel round-trip, v1(필드 없음) 그대로 유효', () => {
    const plan = { ...cur(), buildingId: 'bld-x', floorLabel: '3층' };
    const round = importPlan(exportPlan(plan));
    expect(round.ok).toBe(true);
    if (round.ok) {
      expect(round.plan.buildingId).toBe('bld-x');
      expect(round.plan.floorLabel).toBe('3층');
    }
    const legacy = { ...cur() };
    delete legacy.buildingId;
    delete legacy.floorLabel;
    expect(importPlan(exportPlan(legacy)).ok).toBe(true);
  });
});
