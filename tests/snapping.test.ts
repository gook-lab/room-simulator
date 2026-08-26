import { describe, expect, it } from 'vitest';
import { findFreeSpot, snapItemMove } from '../src/features/editor2d/interactions';
import { createSamplePlan } from '../src/model/samplePlan';

const PX_PER_M = 66;
const snapping = { enabled: true, gridCm: 10 };

describe('snapItemMove', () => {
  const plan = createSamplePlan();
  const sofa = { id: 'probe', rotationDeg: 0, size: { w: 2.2, d: 0.92 } };

  it('그리드 10cm 스냅', () => {
    // 순수 그리드 검증 — 다른 가구가 있으면 정렬 스냅(우선순위 상위)이 개입하므로 비운다
    const empty = { ...plan, items: [] };
    const { position } = snapItemMove(empty, sofa, { x: 2.533, y: 3.348 }, PX_PER_M, snapping);
    // 벽에서 멀면 그리드에만 스냅
    expect(position.x * 10).toBeCloseTo(Math.round(position.x * 10));
    expect(position.y * 10).toBeCloseTo(Math.round(position.y * 10));
  });

  it('벽면 12px 이내면 벽에 붙는다 (좌측 외벽)', () => {
    // 좌측 벽 안쪽 면 x=0.075. 소파 좌측 에지가 면에서 10px(≈0.15m) 이내
    const candidate = { x: 0.075 + 1.1 + 0.1, y: 3.5 };
    const { position, snap } = snapItemMove(plan, sofa, candidate, PX_PER_M, snapping);
    expect(snap).not.toBeNull();
    expect(snap!.axis).toBe('x');
    expect(snap!.line).toBeCloseTo(0.075);
    expect(position.x).toBeCloseTo(0.075 + 1.1, 3); // 에지가 면에 밀착
  });

  it('벽에서 멀면 snap 결과 없음', () => {
    const { snap } = snapItemMove(plan, sofa, { x: 2.6, y: 3.5 }, PX_PER_M, snapping);
    expect(snap).toBeNull();
  });

  it('스냅 비활성화 시 원시 좌표 유지', () => {
    const raw = { x: 2.533, y: 3.348 };
    const { position, snap } = snapItemMove(plan, sofa, raw, PX_PER_M, {
      enabled: false,
      gridCm: 10,
    });
    expect(position).toEqual(raw);
    expect(snap).toBeNull();
  });

  it('벽 스냅 시 반대편 여유(clearance)가 룸 폭 기반으로 계산된다', () => {
    const candidate = { x: 0.075 + 1.1 + 0.05, y: 3.5 };
    const { snap } = snapItemMove(plan, sofa, candidate, PX_PER_M, snapping);
    expect(snap?.clearance).not.toBeNull();
    // 거실 폭 5.35 - 소파 2.2 - 벽 보정 → 3m 안팎
    expect(snap!.clearance!).toBeGreaterThan(2);
    expect(snap!.clearance!).toBeLessThan(3.5);
  });
});

describe('findFreeSpot', () => {
  it('충돌 위치에서 빈 자리를 찾아낸다', () => {
    const plan = createSamplePlan();
    const sofa = plan.items.find((i) => i.id === 'i-sofa')!;
    // 침대 위에 겹쳐 놓은 러운지 체어
    const chair = {
      ...plan.items.find((i) => i.id === 'i-chair')!,
      position: { ...sofa.position },
    };
    const planWithOverlap = {
      ...plan,
      items: plan.items.map((i) => (i.id === chair.id ? chair : i)),
    };
    const spot = findFreeSpot(planWithOverlap, chair);
    expect(spot).not.toBeNull();
    // 원위치와 달라야 하고 룸 내부여야 함
    expect(Math.hypot(spot!.x - sofa.position.x, spot!.y - sofa.position.y)).toBeGreaterThan(0.1);
  });
});
