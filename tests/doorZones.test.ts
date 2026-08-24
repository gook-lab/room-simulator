import { describe, expect, it } from 'vitest';
import { DOOR_PASS_DEPTH, blockedDoorIds, doorZones } from '../src/model/doorZones';
import { createSamplePlan, createStudyPlan } from '../src/model/samplePlan';
import { TEMPLATES } from '../src/model/templates';
import type { Plan } from '../src/model/types';

function miniPlan(): Plan {
  return {
    id: 'p',
    name: 'p',
    unitScale: 50,
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thickness: 0.15, height: 2.4 }],
    openings: [
      { id: 'd-left', wallId: 'w1', t: 0.3, width: 1.0, kind: 'door', swing: 'left' },
      { id: 'd-right', wallId: 'w1', t: 0.7, width: 1.0, kind: 'door', swing: 'right' },
      { id: 'win', wallId: 'w1', t: 0.5, width: 1.0, kind: 'window' },
    ],
    rooms: [],
    items: [],
    updatedAt: '',
  };
}

describe('doorZones', () => {
  const zones = doorZones(miniPlan());

  it('문마다 swing + pass 존 2개, 창은 제외', () => {
    expect(zones).toHaveLength(4);
    expect(zones.filter((z) => z.kind === 'swing')).toHaveLength(2);
    expect(zones.some((z) => z.openingId === 'win')).toBe(false);
  });

  it('left 스윙은 +normal(y+) 쪽, right 스윙은 -normal(y-) 쪽', () => {
    const left = zones.find((z) => z.openingId === 'd-left' && z.kind === 'swing')!;
    const right = zones.find((z) => z.openingId === 'd-right' && z.kind === 'swing')!;
    expect(Math.max(...left.corners.map((c) => c.y))).toBeCloseTo(1.0); // 깊이 = 문 폭
    expect(Math.min(...right.corners.map((c) => c.y))).toBeCloseTo(-1.0);
  });

  it('pass 존 깊이는 0.3m, 스윙 반대편', () => {
    const pass = zones.find((z) => z.openingId === 'd-left' && z.kind === 'pass')!;
    expect(Math.min(...pass.corners.map((c) => c.y))).toBeCloseTo(-DOOR_PASS_DEPTH);
  });
});

describe('blockedDoorIds', () => {
  const plan = miniPlan();

  it('스윙 존 안의 가구를 검출', () => {
    const probe = {
      catalogId: 'sofa-linen-3',
      position: { x: 3.0, y: 0.5 },
      rotationDeg: 0,
      size: { w: 1.0, d: 0.8, h: 0.8 },
    };
    expect(blockedDoorIds(plan, probe)).toEqual(['d-left']);
  });

  it('pass 존(반대편 0.3m) 침범도 검출', () => {
    const probe = {
      catalogId: 'sofa-linen-3',
      position: { x: 7.0, y: 0.35 },
      rotationDeg: 0,
      size: { w: 0.8, d: 0.4, h: 0.8 },
    };
    expect(blockedDoorIds(plan, probe)).toEqual(['d-right']);
  });

  it('존 밖이면 빈 배열', () => {
    const probe = {
      catalogId: 'sofa-linen-3',
      position: { x: 5.0, y: 2.5 },
      rotationDeg: 0,
      size: { w: 1.0, d: 1.0, h: 0.8 },
    };
    expect(blockedDoorIds(plan, probe)).toEqual([]);
  });

  it('러그·펜던트는 무시', () => {
    const rug = {
      catalogId: 'rug-wool-l',
      position: { x: 3.0, y: 0.5 },
      rotationDeg: 0,
      size: { w: 2.4, d: 1.7, h: 0.02 },
    };
    expect(blockedDoorIds(plan, rug)).toEqual([]);
  });
});

describe('문 앞 가구 배치 금지 규칙 — 샘플·템플릿 전수', () => {
  const plans: [string, Plan][] = [
    ['샘플(우리집)', createSamplePlan()],
    ['샘플(서재)', createStudyPlan()],
    ...TEMPLATES.map((t) => [t.name, t.build()] as [string, Plan]),
  ];

  for (const [name, plan] of plans) {
    it(`${name}: 어떤 가구도 문 클리어런스를 막지 않는다`, () => {
      for (const item of plan.items) {
        const blocked = blockedDoorIds(plan, item);
        expect(blocked, `${item.id} → ${blocked.join(',')}`).toEqual([]);
      }
    });
  }
});

describe('미닫이문 (sliding) 존', () => {
  it('스윙 존 없음 — 양쪽 통행 스트립(0.3m)만', () => {
    const plan = miniPlan();
    plan.openings.push({
      id: 'd-slide', wallId: 'w1', t: 0.5, width: 1.2, kind: 'door', doorType: 'sliding',
    });
    const zones = doorZones(plan).filter((z) => z.openingId === 'd-slide');
    expect(zones).toHaveLength(2);
    expect(zones.every((z) => z.kind === 'pass')).toBe(true);
    const ys = zones.flatMap((z) => z.corners.map((c) => c.y));
    expect(Math.max(...ys)).toBeCloseTo(DOOR_PASS_DEPTH);
    expect(Math.min(...ys)).toBeCloseTo(-DOOR_PASS_DEPTH);
  });

  it('미닫이도 toggleDoor·충돌 연동 동일 (SSOT)', async () => {
    const { toggleDoor, isDoorOpen } = await import('../src/model/interactions3d');
    const { collisionSpans } = await import('../src/features/three/wallGeometry');
    const plan = miniPlan();
    const slide = {
      id: 'd-slide', wallId: 'w1', t: 0.5, width: 1.2,
      kind: 'door' as const, doorType: 'sliding' as const, open: false,
    };
    plan.openings = [slide];
    const wall = plan.walls[0];
    // 닫힘: 벽 전체 차단
    expect(collisionSpans(wall, plan.openings)).toEqual([{ start: 0, end: 10 }]);
    // 토글 → 열림: 개구부 통과
    const opened = toggleDoor(plan, 'd-slide');
    expect(isDoorOpen(opened.openings[0])).toBe(true);
    expect(collisionSpans(wall, opened.openings)).toEqual([
      { start: 0, end: 4.4 },
      { start: 5.6, end: 10 },
    ]);
  });
});
