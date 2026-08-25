import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOOR_HEIGHT,
  autoAlignOffset,
  floorBaseY,
  floorsOfBuilding,
  translatePlanGeometry,
  wallsCenter,
} from '../src/model/floorStack';
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

describe('translatePlanGeometry — 층 정렬 이동', () => {
  it('벽·룸·가구·치수·밑그림 오프셋이 함께 이동하고 면적·가구 크기는 불변', () => {
    const plan = createSamplePlan();
    const moved = translatePlanGeometry(plan, { x: 2, y: -1.5 });
    expect(moved.walls[0].a.x).toBeCloseTo(plan.walls[0].a.x + 2, 3);
    expect(moved.walls[0].a.y).toBeCloseTo(plan.walls[0].a.y - 1.5, 3);
    expect(moved.rooms[0].polygon[0].x).toBeCloseTo(plan.rooms[0].polygon[0].x + 2, 3);
    expect(moved.rooms[0].areaSqm).toBe(plan.rooms[0].areaSqm);
    expect(moved.items[0].position.y).toBeCloseTo(plan.items[0].position.y - 1.5, 3);
    expect(moved.items[0].size).toEqual(plan.items[0].size);
    if (plan.tracing) {
      expect(moved.tracing?.offset).toEqual({ x: 2, y: -1.5 });
    }
  });

  it('0 이동·비정상 값은 원본 그대로', () => {
    const plan = createSamplePlan();
    expect(translatePlanGeometry(plan, { x: 0, y: 0 })).toBe(plan);
    expect(translatePlanGeometry(plan, { x: NaN, y: 1 })).toBe(plan);
  });
});

describe('autoAlignOffset — 벽 bbox 중심 맞춤', () => {
  it('아래층 중심으로의 오프셋을 계산하고, 적용하면 중심이 일치한다', () => {
    const below = createSamplePlan();
    const current = translatePlanGeometry(createSamplePlan(), { x: 5, y: 3 });
    const d = autoAlignOffset(current, below)!;
    expect(d.x).toBeCloseTo(-5, 3);
    expect(d.y).toBeCloseTo(-3, 3);
    const aligned = translatePlanGeometry(current, d);
    expect(wallsCenter(aligned)!.x).toBeCloseTo(wallsCenter(below)!.x, 3);
    expect(wallsCenter(aligned)!.y).toBeCloseTo(wallsCenter(below)!.y, 3);
  });

  it('벽 없는 문서는 null', () => {
    const empty = { ...createSamplePlan(), walls: [] };
    expect(autoAlignOffset(empty, createSamplePlan())).toBeNull();
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
