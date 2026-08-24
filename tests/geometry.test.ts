import { describe, expect, it } from 'vitest';
import {
  collidingItemIds,
  itemAabb,
  itemCorners,
  pointInPolygon,
  polygonArea,
  priceByRoom,
  roomAt,
  snapValue,
  totalPrice,
} from '../src/model/geometry';
import { createSamplePlan } from '../src/model/samplePlan';
import type { Plan } from '../src/model/types';

describe('polygonArea (shoelace)', () => {
  it('사각형 면적', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(polygonArea(rect)).toBeCloseTo(12);
  });

  it('시계/반시계 방향 모두 양수', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 0 },
    ];
    expect(polygonArea(cw)).toBeCloseTo(12);
  });

  it('L자 폴리곤', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(polygonArea(L)).toBeCloseTo(3);
  });
});

describe('pointInPolygon / roomAt', () => {
  const plan = createSamplePlan();

  it('거실 내부 좌표는 거실로 판정', () => {
    expect(roomAt(plan.rooms, { x: 2.5, y: 3.5 })?.id).toBe('r-living');
  });

  it('침실 내부 좌표', () => {
    expect(roomAt(plan.rooms, { x: 8, y: 1.5 })?.id).toBe('r-bed');
  });

  it('도면 밖은 null', () => {
    expect(roomAt(plan.rooms, { x: -1, y: -1 })).toBeNull();
  });
});

describe('itemCorners / itemAabb', () => {
  it('회전 0°: AABB가 size와 일치', () => {
    const box = itemAabb({
      position: { x: 5, y: 5 },
      rotationDeg: 0,
      size: { w: 2, d: 1 },
    });
    expect(box.min.x).toBeCloseTo(4);
    expect(box.max.x).toBeCloseTo(6);
    expect(box.min.y).toBeCloseTo(4.5);
    expect(box.max.y).toBeCloseTo(5.5);
  });

  it('회전 90°: 가로·세로 스왑', () => {
    const box = itemAabb({
      position: { x: 5, y: 5 },
      rotationDeg: 90,
      size: { w: 2, d: 1 },
    });
    expect(box.max.x - box.min.x).toBeCloseTo(1);
    expect(box.max.y - box.min.y).toBeCloseTo(2);
  });

  it('회전 45°: 코너가 중심에서 대각 반경만큼', () => {
    const corners = itemCorners({
      position: { x: 0, y: 0 },
      rotationDeg: 45,
      size: { w: 2, d: 2 },
    });
    const r = Math.hypot(1, 1);
    for (const c of corners) {
      expect(Math.hypot(c.x, c.y)).toBeCloseTo(r);
    }
  });
});

describe('SAT 충돌 (collidingItemIds)', () => {
  const shapeOf = () => 'sofa';
  const noIgnore = new Set<string>();

  const basePlan = (): Plan => {
    const plan = createSamplePlan();
    return { ...plan, items: [] };
  };

  const mk = (id: string, x: number, y: number, rot = 0) => ({
    id,
    catalogId: 'sofa-linen-3',
    position: { x, y },
    rotationDeg: rot,
    size: { w: 2, d: 1, h: 0.8 },
    variant: { material: 'sand', color: '#dcc7ae' },
    roomId: null,
    price: 0,
  });

  it('겹치면 검출', () => {
    const plan = basePlan();
    plan.items = [mk('a', 2, 2)];
    const hits = collidingItemIds(plan, mk('b', 2.5, 2.3), noIgnore, shapeOf);
    expect(hits).toEqual(['a']);
  });

  it('떨어져 있으면 미검출', () => {
    const plan = basePlan();
    plan.items = [mk('a', 2, 2)];
    expect(collidingItemIds(plan, mk('b', 6, 6), noIgnore, shapeOf)).toEqual([]);
  });

  it('모서리만 닿는 경우(접촉)는 미검출', () => {
    const plan = basePlan();
    plan.items = [mk('a', 2, 2)];
    // a: x∈[1,3] — b가 정확히 x=4에서 시작 (경계 접촉)
    expect(collidingItemIds(plan, mk('b', 5, 2), noIgnore, shapeOf)).toEqual([]);
  });

  it('회전된 OBB 충돌 검출', () => {
    const plan = basePlan();
    plan.items = [mk('a', 2, 2, 45)];
    const hits = collidingItemIds(plan, mk('b', 3.2, 2, 0), noIgnore, shapeOf);
    expect(hits).toEqual(['a']);
  });

  it('무시 shape은 충돌에서 제외', () => {
    const plan = basePlan();
    plan.items = [mk('a', 2, 2)];
    const hits = collidingItemIds(plan, mk('b', 2.5, 2.3), new Set(['sofa']), shapeOf);
    expect(hits).toEqual([]);
  });
});

describe('snapValue', () => {
  it('10cm 그리드 스냅', () => {
    expect(snapValue(1.234, 0.1)).toBeCloseTo(1.2);
    expect(snapValue(1.267, 0.1)).toBeCloseTo(1.3);
  });
});

describe('견적 셀렉터', () => {
  const plan = createSamplePlan();

  it('총액 = 아이템 가격 합', () => {
    const manual = plan.items.reduce((s, i) => s + i.price, 0);
    expect(totalPrice(plan)).toBe(manual);
    expect(totalPrice(plan)).toBeGreaterThan(0);
  });

  it('룸별 합계의 총합 = 전체 총액', () => {
    const rows = priceByRoom(plan);
    expect(rows.reduce((s, r) => s + r.sum, 0)).toBe(totalPrice(plan));
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(plan.items.length);
  });

  it('룸 이름 매핑', () => {
    const rows = priceByRoom(plan);
    const living = rows.find((r) => r.roomId === 'r-living');
    expect(living?.roomName).toBe('거실');
    expect(living!.count).toBeGreaterThan(0);
  });
});
