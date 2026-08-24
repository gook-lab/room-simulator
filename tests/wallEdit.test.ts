import { describe, expect, it } from 'vitest';
import {
  deleteOpening,
  deleteWalls,
  moveWallVertex,
  reclampOpenings,
  translateWall,
  updateOpening,
} from '../src/model/wallEdit';
import { createSamplePlan } from '../src/model/samplePlan';
import { createWallItem } from '../src/model/wallItems';
import { doorZones } from '../src/model/doorZones';

describe('moveWallVertex (공유 정점 접합 유지)', () => {
  it('코너 이동 시 인접 벽 끝점 + 룸 폴리곤 꼭짓점이 함께 움직인다', () => {
    const plan = createSamplePlan();
    // 좌상단 코너 (0,0): w-n.a, w-w.a, 거실 폴리곤 꼭짓점 공유
    const moved = moveWallVertex(plan, 'w-n', 'a', { x: -0.5, y: -0.3 });
    expect(moved.walls.find((w) => w.id === 'w-n')!.a).toEqual({ x: -0.5, y: -0.3 });
    expect(moved.walls.find((w) => w.id === 'w-w')!.a).toEqual({ x: -0.5, y: -0.3 });
    const living = moved.rooms.find((r) => r.id === 'r-living')!;
    expect(living.polygon[0]).toEqual({ x: -0.5, y: -0.3 });
    // 면적 재계산
    expect(living.areaSqm).not.toBeCloseTo(
      createSamplePlan().rooms.find((r) => r.id === 'r-living')!.areaSqm,
    );
  });

  it('없는 벽·동일 좌표는 no-op', () => {
    const plan = createSamplePlan();
    expect(moveWallVertex(plan, 'nope', 'a', { x: 1, y: 1 })).toBe(plan);
    const wall = plan.walls[0];
    expect(moveWallVertex(plan, wall.id, 'a', { ...wall.a })).toBe(plan);
  });
});

describe('translateWall', () => {
  it('벽 평행 이동 — 개구부 t 비율 유지', () => {
    const plan = createSamplePlan();
    const before = plan.openings.find((o) => o.id === 'o-door-bed')!;
    const moved = translateWall(plan, 'w-mid-v', { x: 0.5, y: 0 });
    const wall = moved.walls.find((w) => w.id === 'w-mid-v')!;
    expect(wall.a.x).toBeCloseTo(5.85);
    expect(wall.b.x).toBeCloseTo(5.85);
    expect(moved.openings.find((o) => o.id === 'o-door-bed')!.t).toBe(before.t);
  });
});

describe('개구부 재클램프·연쇄 삭제', () => {
  it('벽이 개구부보다 짧아지면 개구부 삭제', () => {
    const plan = createSamplePlan();
    // w-mid-h1 (5.35,3.4)-(10.4,3.4)에 폭 1.0 문 가정
    const withDoor = {
      ...plan,
      openings: [
        ...plan.openings,
        { id: 'o-test', wallId: 'w-mid-h1', t: 0.5, width: 1.0, kind: 'door' as const },
      ],
    };
    // 벽을 0.8m 길이로 축소
    const shrunk = moveWallVertex(withDoor, 'w-mid-h1', 'b', { x: 6.15, y: 3.4 });
    expect(shrunk.openings.some((o) => o.id === 'o-test')).toBe(false);
  });

  it('t 재클램프 — 끝으로 밀리면 벽 안으로', () => {
    const plan = createSamplePlan();
    const clamped = reclampOpenings({
      ...plan,
      openings: plan.openings.map((o) =>
        o.id === 'o-door-bed' ? { ...o, t: 0.999 } : o,
      ),
    });
    const o = clamped.openings.find((x) => x.id === 'o-door-bed')!;
    const wallLen = 7.1;
    expect(o.t).toBeLessThanOrEqual(1 - o.width / 2 / wallLen + 1e-9);
  });

  it('deleteWalls: 벽+개구부+벽 부착 아이템 연쇄 삭제, room.wallIds 정리', () => {
    const plan = {
      ...createSamplePlan(),
      wallItems: [createWallItem('frame-s', 'w-mid-v', 0.1, 'front')],
    };
    const after = deleteWalls(plan, ['w-mid-v']);
    expect(after.walls.some((w) => w.id === 'w-mid-v')).toBe(false);
    expect(after.openings.some((o) => o.wallId === 'w-mid-v')).toBe(false);
    expect(after.wallItems).toHaveLength(0);
    expect(after.rooms.every((r) => !r.wallIds.includes('w-mid-v'))).toBe(true);
  });
});

describe('updateOpening (문 타입·스윙·폭 전환)', () => {
  it('여닫이 ↔ 미닫이 전환 시 doorZones 재계산 (스윙 존 유무)', () => {
    const plan = createSamplePlan();
    const zonesBefore = doorZones(plan).filter((z) => z.openingId === 'o-door-bed');
    expect(zonesBefore.some((z) => z.kind === 'swing')).toBe(true);
    const slid = updateOpening(plan, 'o-door-bed', { doorType: 'sliding' });
    const zonesAfter = doorZones(slid).filter((z) => z.openingId === 'o-door-bed');
    expect(zonesAfter.some((z) => z.kind === 'swing')).toBe(false);
    expect(zonesAfter.filter((z) => z.kind === 'pass')).toHaveLength(2);
  });

  it('스윙 방향·폭 변경 + 폭 변경 시 재클램프', () => {
    const plan = createSamplePlan();
    const swung = updateOpening(plan, 'o-door-bed', { swing: 'right' });
    expect(swung.openings.find((o) => o.id === 'o-door-bed')!.swing).toBe('right');
    const widened = updateOpening(plan, 'o-door-bath', { width: 2.0 });
    const o = widened.openings.find((x) => x.id === 'o-door-bath')!;
    expect(o.width).toBe(2.0);
    expect(o.t * 7.1 + 1.0).toBeLessThanOrEqual(7.1 + 1e-9); // 벽 안
  });

  it('deleteOpening·없는 id no-op', () => {
    const plan = createSamplePlan();
    expect(deleteOpening(plan, 'o-door-bed').openings.some((o) => o.id === 'o-door-bed')).toBe(false);
    expect(updateOpening(plan, 'nope', { width: 1 })).toBe(plan);
  });
});
