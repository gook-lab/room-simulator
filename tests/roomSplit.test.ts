import { describe, expect, it } from 'vitest';
import { splitRoomByPolyline } from '../src/model/roomSplit';
import type { Plan } from '../src/model/types';

function rectRoomPlan(): Plan {
  return {
    id: 'p',
    name: 'p',
    unitScale: 50,
    walls: [
      { id: 'w1', a: { x: 1, y: 1 }, b: { x: 9, y: 1 }, thickness: 0.15, height: 2.4 },
      { id: 'w2', a: { x: 9, y: 1 }, b: { x: 9, y: 7 }, thickness: 0.15, height: 2.4 },
      { id: 'w3', a: { x: 9, y: 7 }, b: { x: 1, y: 7 }, thickness: 0.15, height: 2.4 },
      { id: 'w4', a: { x: 1, y: 7 }, b: { x: 1, y: 1 }, thickness: 0.15, height: 2.4 },
    ],
    openings: [],
    rooms: [
      {
        id: 'r1',
        name: '거실',
        wallIds: ['w1', 'w2', 'w3', 'w4'],
        polygon: [
          { x: 1, y: 1 },
          { x: 9, y: 1 },
          { x: 9, y: 7 },
          { x: 1, y: 7 },
        ],
        areaSqm: 48,
        floor: 'living',
        floorFinish: 'wood-oak',
      },
    ],
    items: [
      {
        id: 'i-left',
        catalogId: 'sofa-linen-3',
        position: { x: 3, y: 4 },
        rotationDeg: 0,
        size: { w: 2.2, d: 0.92, h: 0.78 },
        variant: { material: 'sand', color: '#dcc7ae' },
        roomId: 'r1',
        price: 0,
      },
      {
        id: 'i-right',
        catalogId: 'table-oak-round',
        position: { x: 7, y: 4 },
        rotationDeg: 0,
        size: { w: 1.1, d: 1.1, h: 0.74 },
        variant: { material: 'oak', color: '#c9a882' },
        roomId: 'r1',
        price: 0,
      },
    ],
    updatedAt: '',
  };
}

describe('splitRoomByPolyline (내벽으로 룸 분할)', () => {
  it('수직 절단 → 2개 룸, 면적 보존, 마감 상속', () => {
    const plan = rectRoomPlan();
    const split = splitRoomByPolyline(plan, [
      { x: 5, y: 1 },
      { x: 5, y: 7 },
    ]);
    expect(split.rooms).toHaveLength(2);
    const [a, b] = split.rooms;
    expect(a.areaSqm + b.areaSqm).toBeCloseTo(48, 1);
    expect(a.areaSqm).toBeCloseTo(24, 1);
    expect(a.name).toBe('거실'); // 첫 조각은 기존 이름 유지
    expect(b.name).toBe('방 2');
    expect(a.floorFinish).toBe('wood-oak'); // 마감 상속
    expect(b.floorFinish).toBe('wood-oak');
  });

  it('가구 roomId 재배정 — 좌/우 조각으로 각각', () => {
    const plan = rectRoomPlan();
    const split = splitRoomByPolyline(plan, [
      { x: 5, y: 1 },
      { x: 5, y: 7 },
    ]);
    const left = split.items.find((i) => i.id === 'i-left')!;
    const right = split.items.find((i) => i.id === 'i-right')!;
    expect(left.roomId).not.toBe(right.roomId);
    const leftRoom = split.rooms.find((r) => r.id === left.roomId)!;
    expect(leftRoom.polygon.some((p) => p.x <= 1.01)).toBe(true); // 좌측 조각
  });

  it('꺾인 폴리라인(ㄱ자) 절단도 동작', () => {
    const plan = rectRoomPlan();
    const split = splitRoomByPolyline(plan, [
      { x: 5, y: 1 },
      { x: 5, y: 4 },
      { x: 9, y: 4 },
    ]);
    expect(split.rooms).toHaveLength(2);
    const total = split.rooms.reduce((s, r) => s + r.areaSqm, 0);
    expect(total).toBeCloseTo(48, 1);
  });

  it('끝점이 경계 위가 아니면 no-op', () => {
    const plan = rectRoomPlan();
    expect(
      splitRoomByPolyline(plan, [
        { x: 5, y: 2 },
        { x: 5, y: 6 },
      ]),
    ).toBe(plan);
  });

  it('같은 에지에서 시작·종료(절단 아님)면 no-op', () => {
    const plan = rectRoomPlan();
    expect(
      splitRoomByPolyline(plan, [
        { x: 3, y: 1 },
        { x: 6, y: 1 },
      ]),
    ).toBe(plan);
  });
});
