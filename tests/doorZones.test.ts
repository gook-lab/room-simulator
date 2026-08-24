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
