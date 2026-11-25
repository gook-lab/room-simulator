import { describe, expect, it } from 'vitest';
import type { Opening, Plan, PlacedItem, Vec2, Wall } from '../src/model/types';
import {
  WALL_FLUSH_TOLERANCE_M,
  collisionsFor,
  findFreeSpot,
  hasPlacementProblem,
  snapItemMove,
  wallHitsFor,
} from '../src/features/editor2d/interactions';
import { blockedDoorIds } from '../src/model/doorZones';
import { itemAabb } from '../src/model/geometry';
import { TEMPLATES } from '../src/model/templates';
import { createSamplePlan, createStudyPlan } from '../src/model/samplePlan';

const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, a, b, thickness: 0.15, height: 2.4 });

const item = (
  id: string,
  catalogId: string,
  position: Vec2,
  size: { w: number; d: number },
  rotationDeg = 0,
): PlacedItem => ({
  id,
  catalogId,
  position,
  rotationDeg,
  size: { ...size, h: 0.8 },
  variant: { material: 'm', color: '#000000' },
  roomId: 'r',
  price: 0,
});

/** 4 × 3 m 방 하나. 윗벽 w-n 은 y=0, 면은 y=0.075 */
function roomPlan(opts: { openings?: Opening[]; items?: PlacedItem[] } = {}): Plan {
  return {
    id: 'p',
    name: 'test',
    unitScale: 50,
    walls: [
      wall('w-n', { x: 0, y: 0 }, { x: 4, y: 0 }),
      wall('w-e', { x: 4, y: 0 }, { x: 4, y: 3 }),
      wall('w-s', { x: 0, y: 3 }, { x: 4, y: 3 }),
      wall('w-w', { x: 0, y: 0 }, { x: 0, y: 3 }),
    ],
    openings: opts.openings ?? [],
    rooms: [
      {
        id: 'r',
        name: '방',
        wallIds: ['w-n', 'w-e', 'w-s', 'w-w'],
        polygon: [
          { x: 0.075, y: 0.075 },
          { x: 3.925, y: 0.075 },
          { x: 3.925, y: 2.925 },
          { x: 0.075, y: 2.925 },
        ],
        areaSqm: 10.97,
        floor: 'living',
      },
    ],
    items: opts.items ?? [],
    updatedAt: '',
  };
}

const SOFA = { w: 2.0, d: 0.9 };
const FLUSH_Y = 0.075 + SOFA.d / 2; // 윗벽 면에 딱 붙은 소파 중심

describe('가구 · 벽 관통 판정', () => {
  it('벽에 걸친 소파는 그 벽과 겹친다', () => {
    const plan = roomPlan();
    expect(wallHitsFor(plan, item('s', 'sofa-linen-3', { x: 2, y: 0.3 }, SOFA))).toEqual(['w-n']);
  });

  it('벽 면에 딱 붙인 소파는 겹치지 않는다', () => {
    const plan = roomPlan();
    expect(wallHitsFor(plan, item('s', 'sofa-linen-3', { x: 2, y: FLUSH_Y }, SOFA))).toEqual([]);
  });

  it('허용 오차 안쪽으로 파고든 소파는 붙인 것으로 보고, 넘으면 겹침이다', () => {
    const plan = roomPlan();
    const inside = item('s', 'sofa-linen-3', { x: 2, y: FLUSH_Y - WALL_FLUSH_TOLERANCE_M * 0.75 }, SOFA);
    const beyond = item('s', 'sofa-linen-3', { x: 2, y: FLUSH_Y - WALL_FLUSH_TOLERANCE_M * 1.5 }, SOFA);
    expect(wallHitsFor(plan, inside)).toEqual([]);
    expect(wallHitsFor(plan, beyond)).toEqual(['w-n']);
  });

  it('벽 스냅 결과는 경고하지 않는다 (회전 가구 포함)', () => {
    const plan = roomPlan();
    for (const rotationDeg of [0, 90, 30]) {
      const sofa = item('s', 'sofa-linen-3', { x: 2, y: 1 }, SOFA, rotationDeg);
      // 벽을 5cm 파고든 후보 → 스냅이 면으로 밀어 낸다
      const aabbHalf = (itemAabb(sofa).max.y - itemAabb(sofa).min.y) / 2;
      const candidate = { x: 2, y: 0.075 + aabbHalf - 0.05 };
      expect(wallHitsFor(plan, { ...sofa, position: candidate }), `${rotationDeg}° 후보`).toEqual([
        'w-n',
      ]);
      const { position, snap } = snapItemMove(plan, sofa, candidate, 50, {
        enabled: true,
        gridCm: 10,
      });
      expect(snap?.kind, `${rotationDeg}°`).toBe('wall');
      expect(wallHitsFor(plan, { ...sofa, position }), `${rotationDeg}°`).toEqual([]);
    }
  });

  it('문 개구부 구간은 벽이 아니다 — 창은 벽이다', () => {
    const door: Opening = { id: 'd', wallId: 'w-n', t: 0.5, width: 1.0, kind: 'door' };
    const box = { w: 0.8, d: 0.8 };
    // 문틀 안(x 1.6~2.4)에 걸친 상자
    const inGap = item('b', 'storage-console', { x: 2, y: 0 }, box);
    expect(wallHitsFor(roomPlan({ openings: [door] }), inGap)).toEqual([]);
    // 문 옆 벽(x < 1.5)까지 걸치면 겹침
    const onJamb = item('b', 'storage-console', { x: 1.3, y: 0 }, box);
    expect(wallHitsFor(roomPlan({ openings: [door] }), onJamb)).toEqual(['w-n']);
    // 같은 자리가 창이면 벽 몸통이다
    const win: Opening = { ...door, kind: 'window' };
    expect(wallHitsFor(roomPlan({ openings: [win] }), inGap)).toEqual(['w-n']);
  });

  it('기울어진 벽도 판정한다', () => {
    const plan = { ...roomPlan(), walls: [wall('w-d', { x: 0, y: 0 }, { x: 4, y: 4 })] };
    const crossing = item('b', 'storage-console', { x: 2, y: 2 }, { w: 0.6, d: 0.6 });
    const clear = item('b', 'storage-console', { x: 3, y: 1 }, { w: 0.6, d: 0.6 });
    expect(wallHitsFor(plan, crossing)).toEqual(['w-d']);
    expect(wallHitsFor(plan, clear)).toEqual([]);
  });

  it('러그 · 계단 · 벽 부착 소품 · 표면 위 자식은 경고하지 않는다', () => {
    const plan = roomPlan();
    const at = { x: 2, y: 0.1 };
    expect(wallHitsFor(plan, item('r', 'rug-wool-l', at, SOFA))).toEqual([]);
    expect(wallHitsFor(plan, item('st', 'stairs-straight', at, SOFA))).toEqual([]);
    expect(wallHitsFor(plan, item('f', 'frame-s', at, SOFA))).toEqual([]);
    const child = { ...item('c', 'storage-console', at, SOFA), parentId: 'table' };
    expect(wallHitsFor(plan, child)).toEqual([]);
  });

  it('벽 관통만 있어도 드롭 뒤 "빈 자리로 이동"을 띄운다', () => {
    const sofa = item('s', 'sofa-linen-3', { x: 2, y: 0.3 }, SOFA);
    const plan = roomPlan({ items: [sofa] });
    expect(collisionsFor(plan, sofa)).toEqual([]);
    expect(hasPlacementProblem(plan, sofa)).toBe(true);
    expect(hasPlacementProblem(plan, { ...sofa, position: { x: 2, y: FLUSH_Y } })).toBe(false);
  });
});

describe('빈 자리로 이동 — 벽도 피한다', () => {
  it('벽에 걸친 소파는 그 벽 면에 붙인 자리로 간다', () => {
    const sofa = item('s', 'sofa-linen-3', { x: 2, y: 0.3 }, SOFA);
    const plan = roomPlan({ items: [sofa] });
    const spot = findFreeSpot(plan, sofa)!;
    expect(spot).not.toBeNull();
    expect(spot.x).toBeCloseTo(2, 5);
    expect(spot.y).toBeGreaterThanOrEqual(FLUSH_Y);
    expect(spot.y).toBeLessThan(FLUSH_Y + 0.01);
    expect(wallHitsFor(plan, { ...sofa, position: spot })).toEqual([]);
  });

  it('모서리에서 두 벽에 걸치면 두 벽 모두에서 빠진다', () => {
    const box = item('b', 'storage-console', { x: 0.2, y: 0.2 }, { w: 0.8, d: 0.8 });
    const plan = roomPlan({ items: [box] });
    expect(wallHitsFor(plan, box).sort()).toEqual(['w-n', 'w-w']);
    const spot = findFreeSpot(plan, box)!;
    expect(wallHitsFor(plan, { ...box, position: spot })).toEqual([]);
    expect(spot.x).toBeLessThan(0.6);
    expect(spot.y).toBeLessThan(0.6);
  });

  it('벽 면 자리가 다른 가구로 막히면 가구 · 벽 · 문을 모두 피한 자리를 찾는다', () => {
    const blocker = item('k', 'storage-console', { x: 2, y: 0.6 }, { w: 2.4, d: 1.0 });
    const sofa = item('s', 'sofa-linen-3', { x: 2, y: 0.3 }, SOFA);
    const plan = roomPlan({ items: [blocker, sofa] });
    const spot = findFreeSpot(plan, sofa)!;
    expect(spot).not.toBeNull();
    const moved = { ...sofa, position: spot };
    expect(wallHitsFor(plan, moved)).toEqual([]);
    expect(collisionsFor(plan, moved)).toEqual([]);
    expect(blockedDoorIds(plan, moved)).toEqual([]);
  });
});

describe('기본 도면 전수 — 벽 관통 0건 (샘플 2종 + 템플릿 3종)', () => {
  const plans = [createSamplePlan(), createStudyPlan(), ...TEMPLATES.map((t) => t.build())];
  for (const plan of plans) {
    it(plan.name, () => {
      for (const placed of plan.items) {
        expect(wallHitsFor(plan, placed), `${placed.id} 벽 관통`).toEqual([]);
      }
    });
  }
});
