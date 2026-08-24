import { describe, expect, it } from 'vitest';
import { alignmentSnap, axisLock } from '../src/features/editor2d/alignGuides';
import { alignmentTargets, snapItemMove } from '../src/features/editor2d/interactions';
import { createSamplePlan } from '../src/model/samplePlan';
import { item } from '../src/model/planBuilder';

const box = (x: number, y: number, w: number, h: number) => ({
  min: { x, y },
  max: { x: x + w, y: y + h },
});

describe('alignmentSnap (정렬 가이드)', () => {
  const target = { id: 't1', aabb: box(2, 2, 1, 1) }; // x: 2~3(c2.5), y: 2~3(c2.5)

  it('엣지-엣지: 좌측 엣지가 임계 내면 그 좌표로 스냅 + 수직 가이드', () => {
    // dragged left=3.03 vs target right=3.0 (0.03 ≤ 0.05)
    const r = alignmentSnap(box(3.03, 5, 1, 1), [target], 0.05);
    expect(r.dx).toBeCloseTo(-0.03, 9);
    expect(r.guides.some((g) => g.axis === 'x' && g.line === 3)).toBe(true);
    // 가이드 구간은 두 바운즈 y 범위를 잇는다
    const g = r.guides.find((g) => g.axis === 'x')!;
    expect(g.from).toBe(2);
    expect(g.to).toBe(6);
  });

  it('센터-센터: 중심 정렬 스냅 (동률 시 첫 매치 유지)', () => {
    // dragged top/center/bottom 이 모두 0.04 차 — 첫 매치(top-top, line=2)로 스냅
    const r = alignmentSnap(box(6, 2.04, 1, 1), [target], 0.05);
    expect(r.dy).toBeCloseTo(-0.04, 9);
    expect(r.guides.some((g) => g.axis === 'y')).toBe(true);
    // 센터만 정렬 가능한 배치: dragged 높이 2 → centerY=2.5 만 매치
    const rc = alignmentSnap(box(6, 1.46, 1, 2), [target], 0.05);
    expect(rc.dy).toBeCloseTo(0.04, 9);
    expect(rc.guides.some((g) => g.axis === 'y' && g.line === 2.5)).toBe(true);
  });

  it('임계 밖은 스냅 없음, 데드존 안이면 free 플래그 (그리드 억제)', () => {
    // 좌측 엣지 차이 0.08: threshold 0.05 밖, deadzone 0.1 안
    const r = alignmentSnap(box(3.08, 5, 1, 1), [target], 0.05, 0.1);
    expect(r.dx).toBeNull();
    expect(r.freeX).toBe(true);
    // 완전 밖 (0.5)
    const far = alignmentSnap(box(3.5, 5, 1, 1), [target], 0.05, 0.1);
    expect(far.dx).toBeNull();
    expect(far.freeX).toBe(false);
  });

  it('같은 정렬선의 여러 대상 → 가이드 구간이 전체를 잇는다', () => {
    const t2 = { id: 't2', aabb: box(2, 8, 1, 1) }; // 같은 x 범위, 아래쪽
    const r = alignmentSnap(box(2.02, 5, 1, 1), [target, t2], 0.05);
    const g = r.guides.find((g) => g.axis === 'x' && g.line === 2)!;
    expect(g.targetIds.sort()).toEqual(['t1', 't2']);
    expect(g.from).toBe(2);
    expect(g.to).toBe(9);
  });
});

describe('axisLock (Shift 직선 이동)', () => {
  it('이동량 큰 축으로만 이동', () => {
    expect(axisLock({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual({ x: 3, y: 0 });
    expect(axisLock({ x: 0, y: 0 }, { x: 1, y: -4 })).toEqual({ x: 0, y: -4 });
  });
});

describe('snapItemMove 통합 (정렬 > 데드존 > 그리드)', () => {
  it('다른 가구 엣지 정렬이 그리드보다 우선한다', () => {
    const plan = createSamplePlan();
    const a = item('al-a', 'chair-dining', { x: 20, y: 20 }, 0, null);
    const b = item('al-b', 'chair-dining', { x: 22, y: 20 }, 0, null);
    plan.items = [...plan.items, a, b];
    // b를 y로 살짝 어긋난 위치(20.033 — 그리드면 20.05로 갈 값)로 이동
    const r = snapItemMove(plan, b, { x: 22, y: 20.033 }, 55, { enabled: true, gridCm: 10 });
    expect(r.position.y).toBeCloseTo(20, 9); // a와 센터 정렬 (그리드 20.05 아님)
    expect(r.guides.length).toBeGreaterThan(0);
  });

  it('정렬 대상은 표면 적층 자식 제외', () => {
    const plan = createSamplePlan();
    const desk = item('al-desk', 'desk-oak', { x: 30, y: 30 }, 0, null);
    const lamp = { ...item('al-lamp', 'lamp-table', { x: 30.2, y: 30.1 }, 0, null), parentId: 'al-desk' };
    plan.items = [...plan.items, desk, lamp];
    const targets = alignmentTargets(plan, { x: 30, y: 31 }, new Set(), 5);
    expect(targets.some((t) => t.id === 'al-desk')).toBe(true);
    expect(targets.some((t) => t.id === 'al-lamp')).toBe(false);
  });
});
