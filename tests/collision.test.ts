import { describe, expect, it } from 'vitest';
import {
  FURNITURE_PAD,
  PLAYER_RADIUS,
  buildColliders,
  moveAndSlide,
  resolveCollisions,
} from '../src/features/three/collision';
import { collisionSpans, wallBoxes, DOOR_HEIGHT, WINDOW_HEAD, WINDOW_SILL } from '../src/features/three/wallGeometry';
import { createSamplePlan } from '../src/model/samplePlan';
import type { Opening, Wall } from '../src/model/types';

const wall: Wall = {
  id: 'w1',
  a: { x: 0, y: 0 },
  b: { x: 10, y: 0 },
  thickness: 0.15,
  height: 2.4,
};

describe('wallBoxes (3D 벽 분할)', () => {
  it('개구부 없으면 통짜 박스 1개', () => {
    const boxes = wallBoxes(wall, []);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ start: 0, end: 10, bottom: 0, top: 2.4, kind: 'solid' });
  });

  it('문: 좌우 벽 + 상인방(lintel)', () => {
    const door: Opening = { id: 'o1', wallId: 'w1', t: 0.5, width: 1, kind: 'door' };
    const boxes = wallBoxes(wall, [door]);
    // 좌측(0~4.5) / 상인방(4.5~5.5, 2.0~2.4) / 우측(5.5~10)
    expect(boxes).toHaveLength(3);
    const lintel = boxes.find((b) => b.bottom === DOOR_HEIGHT);
    expect(lintel).toMatchObject({ start: 4.5, end: 5.5, top: 2.4 });
  });

  it('창: 하단 + 상단 solid + 유리', () => {
    const win: Opening = { id: 'o2', wallId: 'w1', t: 0.5, width: 1.2, kind: 'window' };
    const boxes = wallBoxes(wall, [win]);
    const glass = boxes.filter((b) => b.kind === 'glass');
    expect(glass).toHaveLength(1);
    expect(glass[0]).toMatchObject({ bottom: WINDOW_SILL, top: WINDOW_HEAD });
    const sill = boxes.find((b) => b.kind === 'solid' && b.bottom === 0 && b.start === 4.4);
    expect(sill?.top).toBe(WINDOW_SILL);
  });
});

describe('collisionSpans (통행 가능 구간)', () => {
  it('문 구간은 충돌에서 제외', () => {
    const door: Opening = { id: 'o1', wallId: 'w1', t: 0.5, width: 1, kind: 'door' };
    const spans = collisionSpans(wall, [door]);
    expect(spans).toEqual([
      { start: 0, end: 4.5 },
      { start: 5.5, end: 10 },
    ]);
  });

  it('창은 충돌 유지 (통과 불가)', () => {
    const win: Opening = { id: 'o2', wallId: 'w1', t: 0.5, width: 1.2, kind: 'window' };
    const spans = collisionSpans(wall, [win]);
    expect(spans).toEqual([{ start: 0, end: 10 }]);
  });
});

describe('resolveCollisions (캡슐 0.25m)', () => {
  const colliders = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, pad: 0.075 }];

  it('벽에 파고들면 밀려남', () => {
    const p = resolveCollisions({ x: 5, y: 0.1 }, colliders, PLAYER_RADIUS);
    expect(p.y).toBeCloseTo(0.075 + PLAYER_RADIUS, 3);
    expect(p.x).toBeCloseTo(5);
  });

  it('충분히 떨어져 있으면 그대로', () => {
    const p = resolveCollisions({ x: 5, y: 1 }, colliders, PLAYER_RADIUS);
    expect(p).toEqual({ x: 5, y: 1 });
  });

  it('샘플 도면: 문 개구부는 통과, 벽 중앙은 차단', () => {
    const plan = createSamplePlan();
    const cs = buildColliders(plan);
    // 침실 문 (w-mid-v, t=0.41 → y≈2.91)에서 벽을 가로지르는 위치 → 통과 (밀리지 않음)
    const atDoor = resolveCollisions({ x: 5.35, y: 2.91 }, cs, PLAYER_RADIUS);
    expect(atDoor.x).toBeCloseTo(5.35, 1);
    // 문이 없는 y=1.0 지점의 벽 위 → 밀려남
    const atWall = resolveCollisions({ x: 5.35, y: 1.0 }, cs, PLAYER_RADIUS);
    expect(Math.abs(atWall.x - 5.35)).toBeGreaterThan(0.2);
  });

  it('가구 모서리 콜라이더에 막힘 (완화 패딩 반경)', () => {
    const plan = createSamplePlan();
    const cs = buildColliders(plan);
    // 주방 라운드 테이블(7.6, 4.35, Ø1.1) 좌측 변에 유효 반경보다 가깝게 접근
    const table = plan.items.find((i) => i.id === 'i-table-kitchen')!;
    const leftEdge = table.position.x - table.size.w / 2;
    const effective = PLAYER_RADIUS + FURNITURE_PAD; // 0.18
    const probe = { x: leftEdge - 0.1, y: table.position.y };
    const res = resolveCollisions(probe, cs, PLAYER_RADIUS);
    expect(leftEdge - res.x).toBeGreaterThanOrEqual(effective - 1e-6);
  });

  it('가구 유효 반경(0.18m) 밖은 밀리지 않는다 — 패딩 과대 보정', () => {
    const plan = createSamplePlan();
    const cs = buildColliders(plan);
    const table = plan.items.find((i) => i.id === 'i-table-kitchen')!;
    const leftEdge = table.position.x - table.size.w / 2;
    const probe = { x: leftEdge - 0.2, y: table.position.y }; // 0.18 < 0.2 < 0.25
    const res = resolveCollisions(probe, cs, PLAYER_RADIUS);
    expect(res).toEqual(probe);
  });

  it('낮은 오브젝트(러그·커피 테이블 h≤0.4)는 충돌 제외', () => {
    const plan = createSamplePlan();
    const cs = buildColliders(plan);
    const coffee = plan.items.find((i) => i.id === 'i-coffee')!;
    expect(coffee.size.h).toBeLessThanOrEqual(0.4);
    // 커피 테이블 중심 위에 서도 밀리지 않는다 (소파·러그와도 무관)
    const res = resolveCollisions({ ...coffee.position }, cs, PLAYER_RADIUS);
    expect(res).toEqual(coffee.position);
  });
});

describe('moveAndSlide (슬라이딩 충돌 응답)', () => {
  const hWall = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, pad: 0.075 }];
  const touchY = 0.075 + PLAYER_RADIUS; // 벽면 밀착 y

  it('벽에 비스듬히 이동 → 접선 성분 보존 (미끄러짐)', () => {
    const pos = { x: 5, y: touchY };
    const res = moveAndSlide(pos, { x: 0.2, y: -0.1 }, hWall, PLAYER_RADIUS);
    expect(res.x).toBeCloseTo(5.2, 5); // 접선(x) 성분은 그대로
    expect(res.y).toBeGreaterThanOrEqual(touchY - 1e-6); // 법선(y) 침투 성분만 제거
  });

  it('벽과 평행 이동은 무손실', () => {
    const pos = { x: 5, y: touchY };
    const res = moveAndSlide(pos, { x: 0.3, y: 0 }, hWall, PLAYER_RADIUS);
    expect(res.x).toBeCloseTo(5.3, 5);
    expect(res.y).toBeCloseTo(touchY, 5);
  });

  it('벽에서 떨어져 있으면 그대로 이동', () => {
    const res = moveAndSlide({ x: 5, y: 2 }, { x: 0.1, y: -0.1 }, hWall, PLAYER_RADIUS);
    expect(res.x).toBeCloseTo(5.1, 5);
    expect(res.y).toBeCloseTo(1.9, 5);
  });

  it('코너(법선 2개 동시 접촉)로 파고들면 정지 — 관통·떨림 없음', () => {
    const corner = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, pad: 0.075 },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, pad: 0.075 },
    ];
    const pos = { x: touchY, y: touchY };
    const res = moveAndSlide(pos, { x: -0.1, y: -0.1 }, corner, PLAYER_RADIUS);
    expect(res.x).toBeCloseTo(pos.x, 5);
    expect(res.y).toBeCloseTo(pos.y, 5);
  });

  it('코너에서 한 축만 열려 있으면 그 방향으로는 미끄러진다', () => {
    const corner = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, pad: 0.075 },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, pad: 0.075 },
    ];
    const pos = { x: touchY, y: touchY };
    const res = moveAndSlide(pos, { x: 0.2, y: -0.1 }, corner, PLAYER_RADIUS);
    expect(res.x).toBeCloseTo(pos.x + 0.2, 5);
    expect(res.y).toBeGreaterThanOrEqual(touchY - 1e-6);
  });

  it('가구 사이 좁은 통로(0.4m)도 완화 반경으로 통과 가능', () => {
    // 두 가구 에지가 0.4m 간격 — 유효 지름 0.36 < 0.4 → 통과
    const gapWalls = [
      { a: { x: 2, y: 0 }, b: { x: 2, y: 5 }, pad: FURNITURE_PAD },
      { a: { x: 2.4, y: 0 }, b: { x: 2.4, y: 5 }, pad: FURNITURE_PAD },
    ];
    let p = { x: 2.2, y: 0.5 };
    for (let i = 0; i < 20; i++) {
      p = moveAndSlide(p, { x: 0, y: 0.1 }, gapWalls, PLAYER_RADIUS);
    }
    expect(p.y).toBeGreaterThan(2); // 전진했는가
    expect(p.x).toBeCloseTo(2.2, 1); // 통로 중앙 유지
  });
});
