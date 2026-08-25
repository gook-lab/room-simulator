import { describe, expect, it } from 'vitest';
import { createSamplePlan } from '../src/model/samplePlan';
import { exportPlan, importPlan } from '../src/model/planIO';
import { floorColor2d } from '../src/model/finishes';

describe('방 이름·용도 편집', () => {
  it('이름·용도 변경이 planIO round-trip 에 보존된다', () => {
    const plan = createSamplePlan();
    const target = plan.rooms[0];
    plan.rooms = plan.rooms.map((r) =>
      r.id === target.id ? { ...r, name: '서재', floor: 'bath' as const } : r,
    );
    const round = importPlan(exportPlan(plan));
    expect(round.ok).toBe(true);
    if (round.ok) {
      const r = round.plan.rooms.find((x) => x.id === target.id)!;
      expect(r.name).toBe('서재');
      expect(r.floor).toBe('bath');
    }
  });

  it('용도 변경 시 기본 바닥색이 따라온다 (마감 미지정 룸)', () => {
    const plan = createSamplePlan();
    const room = { ...plan.rooms[0], floorFinish: undefined };
    const living = floorColor2d({ ...room, floor: 'living' });
    const bath = floorColor2d({ ...room, floor: 'bath' });
    expect(living).not.toBe(bath);
  });

  it('잘못된 용도 값은 planIO 가 거부한다', () => {
    const plan = createSamplePlan();
    plan.rooms = plan.rooms.map((r, i) =>
      i === 0 ? { ...r, floor: 'garage' as unknown as 'living' } : r,
    );
    expect(importPlan(exportPlan(plan)).ok).toBe(false);
  });
});
