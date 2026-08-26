import { describe, expect, it } from 'vitest';
import type { Plan, Wall } from '../src/model/types';
import { createSamplePlan } from '../src/model/samplePlan';
import { detectRoomsFromWalls } from '../src/model/roomDetect';
import { polygonArea } from '../src/model/geometry';
import { detectEnclosedRegions, rasterizeSegments } from '../src/features/upload/wallDetect';

const seg = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness: 0.15,
  height: 2.4,
});

const bare = (walls: Wall[]): Plan =>
  ({
    id: 'p',
    name: 't',
    unitScale: 60,
    walls,
    openings: [],
    rooms: [],
    items: [],
    updatedAt: 'now',
  }) as unknown as Plan;

describe('방 인식 (수동 벽 → 닫힌 공간)', () => {
  it('사각 폐곡선 → 방 1개, 면적 근사 정확', () => {
    const plan = bare([
      seg('w1', 1, 1, 5, 1),
      seg('w2', 5, 1, 5, 4),
      seg('w3', 5, 4, 1, 4),
      seg('w4', 1, 4, 1, 1),
    ]);
    let n = 0;
    const rooms = detectRoomsFromWalls(plan, () => `r${n++}`);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaSqm).toBeGreaterThan(9.5); // 내측 ≈ (4-0.15)×(3-0.15) ≈ 11
    expect(rooms[0].areaSqm).toBeLessThan(11.5);
    expect(rooms[0].name).toBe('방 1');
  });

  it('L자 폐곡선 → 직교 폴리곤 6정점 (bbox 아님) + 면적 정확', () => {
    // L자: 6×4 에서 우하단 3×2 절개
    const plan = bare([
      seg('w1', 0, 0, 6, 0),
      seg('w2', 6, 0, 6, 2),
      seg('w3', 6, 2, 3, 2),
      seg('w4', 3, 2, 3, 4),
      seg('w5', 3, 4, 0, 4),
      seg('w6', 0, 4, 0, 0),
    ]);
    let n = 0;
    const rooms = detectRoomsFromWalls(plan, () => `r${n++}`);
    expect(rooms).toHaveLength(1);
    const poly = rooms[0].polygon;
    expect(poly.length).toBe(6); // L자 직교 폴리곤
    // 폴리곤 자체 면적도 L자(≈ 24-6=18㎡, 벽 두께만큼 작음)
    const a = polygonArea(poly);
    expect(a).toBeGreaterThan(15);
    expect(a).toBeLessThan(18.5);
  });

  it('기존 방과 겹치는 영역은 스킵, 열린 벽은 방 없음', () => {
    const sample = createSamplePlan();
    let n = 0;
    // 샘플 도면은 이미 방이 정의됨 — 재인식 시 기존 방 영역은 만들지 않는다
    const rooms = detectRoomsFromWalls(sample, () => `r${n++}`);
    for (const r of rooms) {
      // 새로 생긴 방 중심이 기존 방 내부면 실패
      const c = r.polygon.reduce(
        (acc, p) => ({ x: acc.x + p.x / r.polygon.length, y: acc.y + p.y / r.polygon.length }),
        { x: 0, y: 0 },
      );
      const inExisting = sample.rooms.some((ex) => {
        const xs = ex.polygon.map((p) => p.x);
        const ys = ex.polygon.map((p) => p.y);
        return (
          c.x > Math.min(...xs) && c.x < Math.max(...xs) && c.y > Math.min(...ys) && c.y < Math.max(...ys)
        );
      });
      expect(inExisting).toBe(false);
    }
    // 열린 ㄷ자
    const open = bare([seg('w1', 0, 0, 4, 0), seg('w2', 4, 0, 4, 3), seg('w3', 4, 3, 0, 3)]);
    expect(detectRoomsFromWalls(open, () => 'x')).toHaveLength(0);
  });

  it('폴리곤 추출: 직사각 영역은 4정점으로 단순화', () => {
    const lines = [
      { points: [{ x: 2, y: 2 }, { x: 30, y: 2 }], closed: false },
      { points: [{ x: 30, y: 2 }, { x: 30, y: 20 }], closed: false },
      { points: [{ x: 30, y: 20 }, { x: 2, y: 20 }], closed: false },
      { points: [{ x: 2, y: 20 }, { x: 2, y: 2 }], closed: false },
    ];
    const mask = rasterizeSegments(lines, 34, 24, 1);
    const regions = detectEnclosedRegions(mask, 34, 24, 20, { polygonTol: 3 });
    expect(regions).toHaveLength(1);
    expect(regions[0].polygon).toBeDefined();
    expect(regions[0].polygon!.length).toBe(4);
  });
});
