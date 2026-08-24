import { describe, expect, it } from 'vitest';
import type { Plan } from '../src/model/types';
import { createSamplePlan } from '../src/model/samplePlan';
import { item } from '../src/model/planBuilder';
import {
  childFitsSurface,
  deleteItemsWithChildren,
  isMountable,
  isSurfaceItem,
  mountBaseHeight,
  mountItem,
  moveItemWithChildren,
  rotateItemWithChildren,
  siblingOverlapIds,
  surfaceAt,
  unmountItem,
} from '../src/model/surfaces';
import { collidingItemIds } from '../src/model/geometry';
import { blockedDoorIds } from '../src/model/doorZones';
import { buildColliders } from '../src/features/three/collision';
import { exportPlan, importPlan } from '../src/model/planIO';
import { shapeOf, NON_COLLIDING_SHAPES } from '../src/features/editor2d/symbols';

/** 빈 방 한가운데 책상(1.51×0.65) + 그 위 탁상스탠드(mountable) 시나리오 */
function makePlan(): Plan {
  const plan = createSamplePlan();
  // 여유 공간에 책상 배치 (기존 가구와 충돌하지 않는 좌표는 테스트에서 중요하지 않음)
  const desk = item('t-desk', 'desk-oak', { x: 20, y: 20 }, 0, null);
  const lamp = { ...item('t-lamp', 'lamp-table', { x: 20.2, y: 20.1 }, 0, null), parentId: 't-desk' };
  plan.items = [...plan.items, desk, lamp];
  return plan;
}

describe('표면 적층 (surfaces)', () => {
  it('isSurfaceItem: 책상은 표면, 자식은 표면 불가(1단), 러그는 표면 아님', () => {
    const plan = makePlan();
    const desk = plan.items.find((i) => i.id === 't-desk')!;
    const lamp = plan.items.find((i) => i.id === 't-lamp')!;
    const rug = plan.items.find((i) => shapeOf(i.catalogId) === 'rug')!;
    expect(isSurfaceItem(desk)).toBe(true);
    expect(isSurfaceItem({ ...desk, parentId: 'x' })).toBe(false);
    expect(isSurfaceItem(rug)).toBe(false);
    expect(isMountable(lamp.catalogId)).toBe(true);
    expect(isMountable(desk.catalogId)).toBe(false);
  });

  it('surfaceAt: 책상 위 점은 책상, 밖은 null, 자기 자신 제외', () => {
    const plan = makePlan();
    expect(surfaceAt(plan, { x: 20, y: 20 })?.id).toBe('t-desk');
    expect(surfaceAt(plan, { x: 25, y: 25 })).toBeNull();
    expect(surfaceAt(plan, { x: 20, y: 20 }, 't-desk')).toBeNull();
  });

  it('childFitsSurface: 상판 안은 통과, 걸치면 거부', () => {
    const plan = makePlan();
    const desk = plan.items.find((i) => i.id === 't-desk')!;
    const lamp = plan.items.find((i) => i.id === 't-lamp')!;
    expect(childFitsSurface(lamp, desk)).toBe(true);
    // 책상 우측 모서리(x = 20 + 1.51/2)에 걸침
    expect(childFitsSurface({ ...lamp, position: { x: 20.7, y: 20 } }, desk)).toBe(false);
  });

  it('siblingOverlapIds: 같은 상판 위 형제 겹침만 검출, 자신 제외', () => {
    const plan = makePlan();
    const lamp2 = {
      ...item('t-lamp2', 'lamp-table', { x: 20.21, y: 20.1 }, 0, null),
      parentId: 't-desk',
    };
    plan.items.push(lamp2);
    expect(siblingOverlapIds(plan, lamp2, 't-desk')).toEqual(['t-lamp']);
    const l = plan.items.find((i) => i.id === 't-lamp')!;
    expect(siblingOverlapIds(plan, l, 't-desk')).toEqual(['t-lamp2']);
    // 떨어뜨리면 없음
    expect(
      siblingOverlapIds(plan, { ...lamp2, position: { x: 19.6, y: 20 } }, 't-desk'),
    ).toEqual([]);
  });

  it('moveItemWithChildren: 부모 이동 시 자식 동반 (상대 위치 보존)', () => {
    const plan = makePlan();
    const moved = moveItemWithChildren(plan, 't-desk', { x: 22, y: 21 });
    const desk = moved.items.find((i) => i.id === 't-desk')!;
    const lamp = moved.items.find((i) => i.id === 't-lamp')!;
    expect(desk.position).toEqual({ x: 22, y: 21 });
    expect(lamp.position.x).toBeCloseTo(22.2, 6);
    expect(lamp.position.y).toBeCloseTo(21.1, 6);
  });

  it('rotateItemWithChildren: 자식 위치 공전 + 자식 각도 동반', () => {
    const plan = makePlan();
    const rotated = rotateItemWithChildren(plan, 't-desk', 90);
    const lamp = rotated.items.find((i) => i.id === 't-lamp')!;
    // (0.2, 0.1) 오프셋이 90° 회전 → (-0.1, 0.2)
    expect(lamp.position.x).toBeCloseTo(19.9, 6);
    expect(lamp.position.y).toBeCloseTo(20.2, 6);
    expect(lamp.rotationDeg).toBe(90);
  });

  it('deleteItemsWithChildren: 부모 삭제 시 자식 연쇄 삭제', () => {
    const plan = makePlan();
    const after = deleteItemsWithChildren(plan, ['t-desk']);
    expect(after.items.some((i) => i.id === 't-desk')).toBe(false);
    expect(after.items.some((i) => i.id === 't-lamp')).toBe(false);
    // 자식만 삭제하면 부모는 남는다
    const only = deleteItemsWithChildren(plan, ['t-lamp']);
    expect(only.items.some((i) => i.id === 't-desk')).toBe(true);
  });

  it('mount/unmount: roomId 상속·parentId 해제, mountBaseHeight = 부모 높이', () => {
    const plan = makePlan();
    const desk = plan.items.find((i) => i.id === 't-desk')!;
    const lamp = plan.items.find((i) => i.id === 't-lamp')!;
    expect(mountBaseHeight(plan, lamp)).toBeCloseTo(desk.size.h, 6);
    expect(mountBaseHeight(plan, desk)).toBe(0);
    const un = unmountItem(plan, 't-lamp');
    expect(un.items.find((i) => i.id === 't-lamp')!.parentId).toBeUndefined();
    const re = mountItem(un, 't-lamp', 't-desk');
    const reLamp = re.items.find((i) => i.id === 't-lamp')!;
    expect(reLamp.parentId).toBe('t-desk');
    expect(reLamp.roomId).toBe(desk.roomId);
  });

  it('자식은 바닥 충돌·문 클리어런스·3D 충돌체 대상이 아니다', () => {
    const plan = makePlan();
    const lamp = plan.items.find((i) => i.id === 't-lamp')!;
    // 바닥 아이템이 자식 위치로 이동해도 자식과는 충돌하지 않는다 (책상과만)
    const probe = {
      id: 'probe',
      catalogId: 'chair-dining',
      position: { x: 20.2, y: 20.1 },
      rotationDeg: 0,
      size: { w: 0.46, d: 0.54 },
    };
    const hits = collidingItemIds(plan, probe, NON_COLLIDING_SHAPES, shapeOf);
    expect(hits).toContain('t-desk');
    expect(hits).not.toContain('t-lamp');
    expect(blockedDoorIds(plan, lamp)).toEqual([]);
    // 3D: 책상 콜라이더 세그먼트는 있고, 램프 것은 없다
    const before = buildColliders({ ...plan, items: plan.items.filter((i) => i.id !== 't-lamp') });
    const after = buildColliders(plan);
    expect(after.length).toBe(before.length);
  });

  it('planIO round-trip: parentId 보존, 잘못된 참조·2단 적층 거부', () => {
    const plan = makePlan();
    const round = importPlan(exportPlan(plan));
    expect(round.ok).toBe(true);
    if (round.ok) {
      expect(round.plan.items.find((i) => i.id === 't-lamp')!.parentId).toBe('t-desk');
    }
    const dangling = { ...plan, items: plan.items.map((i) => (i.id === 't-lamp' ? { ...i, parentId: 'ghost' } : i)) };
    expect(importPlan(exportPlan(dangling)).ok).toBe(false);
    // 2단 적층: 부모가 이미 자식인 경우
    const nested = {
      ...plan,
      items: [
        ...plan.items,
        { ...item('t-lamp3', 'lamp-table', { x: 20.3, y: 20.3 }, 0, null), parentId: 't-lamp' },
      ],
    };
    expect(importPlan(exportPlan(nested)).ok).toBe(false);
  });
});
