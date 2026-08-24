import { describe, expect, it } from 'vitest';
import type { Plan, Wall } from '../src/model/types';
import { createSamplePlan } from '../src/model/samplePlan';
import { sketchDraftPoints } from '../src/features/editor2d/sketchDraft';
import { useStore } from '../src/state/store';

const seg = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Wall => ({
  id,
  a,
  b,
  thickness: 0.15,
  height: 2.4,
});

describe('선 그리기 프로그레시브 커밋 (선 단위 undo)', () => {
  it('sketchDraftPoints: 앵커 + 커밋 세그먼트 끝점, undo 된 세그먼트부터 무효', () => {
    const plan = createSamplePlan();
    const p0 = { x: 20, y: 20 };
    const p1 = { x: 22, y: 20 };
    const p2 = { x: 22, y: 22 };
    plan.walls = [...plan.walls, seg('s1', p0, p1), seg('s2', p1, p2)];
    const draft = { anchor: p0, wallIds: ['s1', 's2'] };
    expect(sketchDraftPoints(plan, draft)).toEqual([p0, p1, p2]);
    // s2 가 undo 로 제거되면 s1 끝점까지만 — 그 지점부터 이어그리기
    const undone: Plan = { ...plan, walls: plan.walls.filter((w) => w.id !== 's2') };
    expect(sketchDraftPoints(undone, draft)).toEqual([p0, p1]);
    // 전부 제거되면 앵커만
    const empty: Plan = { ...plan, walls: plan.walls.filter((w) => !w.id.startsWith('s')) };
    expect(sketchDraftPoints(empty, draft)).toEqual([p0]);
  });

  it('스토어: 세그먼트 3개 커밋 → undo×1 은 마지막 선만, undo×3 은 전부 제거', () => {
    const s = useStore.getState();
    s.openPlan(s.planOrder[0]);
    const wallCount = () =>
      useStore.getState().plans[useStore.getState().currentPlanId].walls.length;
    const base = wallCount();
    const pts = [
      { x: 20, y: 20 },
      { x: 22, y: 20 },
      { x: 22, y: 22 },
      { x: 24, y: 22 },
    ];
    for (let i = 0; i < 3; i++) {
      useStore.getState().updatePlan((pl) => ({
        ...pl,
        walls: [...pl.walls, seg(`u${i}`, pts[i], pts[i + 1])],
      }));
    }
    expect(wallCount()).toBe(base + 3);
    useStore.getState().undo();
    expect(wallCount()).toBe(base + 2); // 마지막 선 하나만 되돌아감
    useStore.getState().undo();
    useStore.getState().undo();
    expect(wallCount()).toBe(base); // 세 번이면 전부
    useStore.getState().redo();
    expect(wallCount()).toBe(base + 1); // redo 로 한 선씩 복원
  });
});
