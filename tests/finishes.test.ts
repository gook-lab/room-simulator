import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WALL_3D,
  FLOOR_FINISHES,
  WALL_FINISHES,
  floorColor2d,
  floorColor3d,
  resolveWallColor,
  setRoomFinish,
} from '../src/model/finishes';
import { createSamplePlan } from '../src/model/samplePlan';

describe('마감재 팔레트 무결성', () => {
  it('id 유일성 + hex 색상', () => {
    for (const list of [FLOOR_FINISHES, WALL_FINISHES]) {
      const ids = list.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const f of list) {
        expect(f.color3d).toMatch(/^#[0-9a-f]{6}$/);
        expect(f.label).toBeTruthy();
      }
    }
    for (const f of FLOOR_FINISHES) expect(f.color2d).toMatch(/^#[0-9a-f]{6}$/);
    expect(FLOOR_FINISHES.length).toBeGreaterThanOrEqual(5);
    expect(WALL_FINISHES.length).toBeGreaterThanOrEqual(5);
  });
});

describe('floorColor2d/3d', () => {
  const plan = createSamplePlan();

  it('미지정이면 용도(FloorKind) 기본색', () => {
    const bath = plan.rooms.find((r) => r.floor === 'bath')!;
    expect(floorColor2d(bath)).toBe('#f0f4f2');
    expect(floorColor3d(bath)).toBe('#dce9e4');
  });

  it('마감 지정 시 팔레트 색', () => {
    const room = { ...plan.rooms[0], floorFinish: 'tile-grey' };
    expect(floorColor2d(room)).toBe('#eef0ef');
    expect(floorColor3d(room)).toBe('#b9bfbc');
  });

  it('알 수 없는 finish id는 기본색 fallback', () => {
    const room = { ...plan.rooms[0], floorFinish: 'nope' };
    expect(floorColor2d(room)).toBe('#fbf8f3');
  });
});

describe('setRoomFinish (undo 대상 patch)', () => {
  it('지정·해제(null)·없는 룸 no-op', () => {
    const plan = createSamplePlan();
    const withFloor = setRoomFinish(plan, 'r-living', { floorFinish: 'herringbone' });
    expect(withFloor.rooms.find((r) => r.id === 'r-living')!.floorFinish).toBe('herringbone');
    const cleared = setRoomFinish(withFloor, 'r-living', { floorFinish: null });
    expect(cleared.rooms.find((r) => r.id === 'r-living')!.floorFinish).toBeUndefined();
    expect(setRoomFinish(plan, 'nope', { floorFinish: 'marble' })).toBe(plan);
    // 다른 룸 불변
    expect(withFloor.rooms.find((r) => r.id === 'r-bed')).toBe(
      plan.rooms.find((r) => r.id === 'r-bed'),
    );
  });
});

describe('resolveWallColor (3D 벽지 동기화)', () => {
  it('벽에 접한 룸의 wallFinish 적용, 미지정은 기본 벽색', () => {
    const plan = createSamplePlan();
    const wall = plan.walls.find((w) => w.id === 'w-w')!; // 거실 서쪽 외벽
    const mid = { x: 0, y: 3.55 };
    expect(resolveWallColor(plan.rooms, wall, mid)).toBe(DEFAULT_WALL_3D);
    const painted = setRoomFinish(plan, 'r-living', { wallFinish: 'sage' });
    expect(resolveWallColor(painted.rooms, wall, mid)).toBe('#c3cec2');
  });

  it('내벽: 한쪽 룸만 finish면 그 색', () => {
    const plan = setRoomFinish(createSamplePlan(), 'r-bed', { wallFinish: 'skyblue' });
    const wall = plan.walls.find((w) => w.id === 'w-mid-v')!; // 거실|침실 경계
    const mid = { x: 5.35, y: 1.5 };
    expect(resolveWallColor(plan.rooms, wall, mid)).toBe('#ccd8e2');
  });
});
