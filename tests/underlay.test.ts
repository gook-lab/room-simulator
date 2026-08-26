import { describe, expect, it } from 'vitest';
import { DEFAULT_UNDERLAY_WIDTH_M, linesToWalls, rescaleTracing, underlaySize } from '../src/model/underlay';
import { planBounds } from '../src/model/geometry';
import type { Plan, Tracing } from '../src/model/types';

const tracing: Tracing = {
  imageUrl: 'data:,x',
  opacity: 0.5,
  locked: true,
  visible: true,
  widthM: 10,
  heightM: 7,
};

describe('언더레이 즉시 로드 (underlay)', () => {
  it('underlaySize: 이미지 종횡비 유지, 기본 폭 10m', () => {
    const s = underlaySize(2897, 2049);
    expect(s.widthM).toBe(DEFAULT_UNDERLAY_WIDTH_M);
    expect(s.heightM).toBeCloseTo(10 * (2049 / 2897), 3);
  });

  it('rescaleTracing: 배율 적용, 무효 배율은 무시', () => {
    const r = rescaleTracing(tracing, 1.5);
    expect(r.widthM).toBeCloseTo(15, 6);
    expect(r.heightM).toBeCloseTo(10.5, 6);
    expect(rescaleTracing(tracing, 0)).toBe(tracing);
    expect(rescaleTracing(tracing, NaN)).toBe(tracing);
  });

  it('linesToWalls: 검출 px → 월드 비례 변환', () => {
    let n = 0;
    const walls = linesToWalls(
      [{ points: [{ x: 0, y: 0 }, { x: 390, y: 0 }] }],
      780,
      546,
      10,
      7,
      () => `w${n++}`,
    );
    expect(walls).toHaveLength(1);
    expect(walls[0].a).toEqual({ x: 0, y: 0 });
    expect(walls[0].b).toEqual({ x: 5, y: 0 });
  });

  it('planBounds: 벽 없는 언더레이 문서는 밑그림 영역이 범위', () => {
    const plan = { walls: [], tracing } as unknown as Plan;
    expect(planBounds(plan)).toEqual({ min: { x: 0, y: 0 }, max: { x: 10, y: 7 } });
  });
});

describe('rescalePlanGeometry (스케일 보정 = 문서 전체 배율)', () => {
  it('벽·방·가구 위치·언더레이 배율, 가구 크기는 불변', async () => {
    const { rescalePlanGeometry } = await import('../src/model/underlay');
    const { createSamplePlan } = await import('../src/model/samplePlan');
    const plan = createSamplePlan();
    plan.tracing = { ...tracing };
    const item0 = plan.items[0];
    const wall0 = plan.walls[0];
    const room0 = plan.rooms[0];
    const r = rescalePlanGeometry(plan, 2);
    expect(r.walls[0].a.x).toBeCloseTo(wall0.a.x * 2, 4);
    expect(r.rooms[0].areaSqm).toBeCloseTo(room0.areaSqm * 4, 1);
    expect(r.items[0].position.x).toBeCloseTo(item0.position.x * 2, 4);
    expect(r.items[0].size).toEqual(item0.size); // 실물 치수 불변
    expect(r.tracing!.widthM).toBeCloseTo(20, 4);
    expect(rescalePlanGeometry(plan, 0)).toBe(plan);
  });
});

describe('consolidateWalls (토막 병합·고아 제거)', () => {
  const seg = (id: string, ax: number, ay: number, bx: number, by: number, th = 0.15) => ({
    id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: th, height: 2.4,
  });

  it('동일선상 인접 세그먼트를 gap 이내 병합', async () => {
    const { consolidateWalls } = await import('../src/model/underlay');
    const out = consolidateWalls(
      [seg('a', 0, 2, 3, 2), seg('b', 3.5, 2.02, 7, 2.02), seg('c', 0, 5, 4, 5)],
      { axisTol: 0.08, gapMax: 0.8, minLen: 0.4, joinTol: 0.2 },
    );
    const h2 = out.filter((w) => Math.abs(w.a.y - 2.01) < 0.05);
    expect(h2).toHaveLength(1);
    expect(h2[0].a.x).toBe(0);
    expect(h2[0].b.x).toBe(7);
    expect(out).toHaveLength(2);
  });

  it('짧은 고아 토막 폐기, 양끝 접합된 짧은 벽은 유지', async () => {
    const { consolidateWalls } = await import('../src/model/underlay');
    const out = consolidateWalls(
      [
        seg('long1', 0, 0, 5, 0),
        seg('long2', 0, 0.3, 5, 0.3),
        seg('joint', 2, 0, 2, 0.3), // 짧지만 양끝이 두 벽에 접합 → 유지
        seg('orphan', 8, 8, 8.2, 8), // 0.2m 고아 → 폐기
      ],
      { axisTol: 0.05, gapMax: 0.5, minLen: 0.4, joinTol: 0.2 },
    );
    expect(out.some((w) => w.id === 'joint')).toBe(true);
    expect(out.some((w) => w.id === 'orphan')).toBe(false);
  });
});

describe('buildAutoGeometry — 개구부 부착·외곽 루프 보존', () => {
  it('갭 개구부가 가장 가까운 벽에 문/창으로 부착된다', async () => {
    const { buildAutoGeometry } = await import('../src/model/underlay');
    let n = 0;
    const r = buildAutoGeometry(
      {
        lines: [{ points: [{ x: 100, y: 200 }, { x: 500, y: 200 }] }],
        outline: [
          { x: 50, y: 50 },
          { x: 600, y: 50 },
          { x: 600, y: 400 },
          { x: 50, y: 400 },
        ],
        regions: [],
        gapOpenings: [
          { center: { x: 300, y: 200 }, width: 60, exterior: false }, // 내벽 → 문
          { center: { x: 300, y: 50 }, width: 80, exterior: true }, // 외곽 → 창
        ],
      },
      780,
      546,
      15.6, // 50px = 1m
      10.92,
      () => `id${n++}`,
    );
    expect(r.openings).toHaveLength(2);
    const door = r.openings.find((o) => o.kind === 'door')!;
    const win = r.openings.find((o) => o.kind === 'window')!;
    expect(door.width).toBeCloseTo(1.2, 1);
    expect(win).toBeDefined();
    // 외곽 벽 4변은 병합 없이 그대로 폐루프 유지
    const exterior = r.walls.filter((w) => w.thickness > 0.18);
    expect(exterior).toHaveLength(4);
  });
});

describe('썸네일 범위 (thumbnailBounds)', () => {
  it('벽 밖 가구·룸 폴리곤까지 포함해 중앙 정렬 기준을 잡는다', async () => {
    const { thumbnailBounds } = await import('../src/components/MiniPlan');
    const { createSamplePlan } = await import('../src/model/samplePlan');
    const { item } = await import('../src/model/planBuilder');
    const plan = createSamplePlan();
    // 벽 범위 밖에 가구 배치
    plan.items = [...plan.items, item('far', 'chair-dining', { x: 30, y: 30 }, 0, null)];
    const b = thumbnailBounds(plan);
    expect(b.max.x).toBeGreaterThan(29);
    expect(b.max.y).toBeGreaterThan(29);
    // 빈 문서는 planBounds 폴백
    const empty = { ...plan, walls: [], rooms: [], items: [] };
    const eb = thumbnailBounds(empty);
    expect(Number.isFinite(eb.min.x)).toBe(true);
  });
});
