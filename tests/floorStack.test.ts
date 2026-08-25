import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOOR_HEIGHT, floorBaseY, floorsOfBuilding } from '../src/model/floorStack';
import { exportPlan, importPlan } from '../src/model/planIO';
import { createSamplePlan } from '../src/model/samplePlan';
import type { Plan } from '../src/model/types';

const floor = (id: string, label: string, height?: number): Plan => ({
  id,
  name: '집',
  buildingId: 'bld-1',
  floorLabel: label,
  defaultWallHeight: height,
  unitScale: 50,
  walls: [],
  openings: [],
  rooms: [],
  items: [],
  updatedAt: '2026-08-25T00:00:00.000Z',
});

describe('floorsOfBuilding', () => {
  it('같은 건물 층을 라벨 숫자순으로 정렬한다 (10층 > 2층 오류 없음)', () => {
    const f1 = floor('a', '1층');
    const f2 = floor('b', '2층');
    const f10 = floor('c', '10층');
    const other: Plan = { ...floor('x', '1층'), buildingId: 'bld-2' };
    const plans = { c: f10, a: f1, x: other, b: f2 };
    expect(floorsOfBuilding(plans, f2).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('건물 연결이 없는 문서는 자기 자신 하나', () => {
    const solo: Plan = { ...floor('s', '1층'), buildingId: undefined };
    expect(floorsOfBuilding({ s: solo }, solo)).toEqual([solo]);
  });
});

describe('floorBaseY — 층 y 오프셋', () => {
  it('아래층들의 defaultWallHeight 합 (미지정은 2.4 폴백)', () => {
    const floors = [floor('a', '1층', 2.7), floor('b', '2층'), floor('c', '3층', 2.2)];
    expect(floorBaseY(floors, 'a')).toBe(0);
    expect(floorBaseY(floors, 'b')).toBe(2.7);
    expect(floorBaseY(floors, 'c')).toBe(2.7 + DEFAULT_FLOOR_HEIGHT);
  });
});

describe('openCeiling — 보이드 플래그', () => {
  it('round-trip 으로 보존된다', () => {
    let plan = createSamplePlan();
    plan = {
      ...plan,
      rooms: plan.rooms.map((r, i) => (i === 0 ? { ...r, openCeiling: true } : r)),
    };
    const result = importPlan(exportPlan(plan));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.rooms[0].openCeiling).toBe(true);
    expect(result.plan.rooms[1]?.openCeiling).toBeUndefined();
  });
});
