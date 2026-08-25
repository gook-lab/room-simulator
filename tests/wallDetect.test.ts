import { describe, expect, it } from 'vitest';
import { closeOutline, detectEnclosedRegions, detectSegments, findGapsAlongLine, mergeParallel, rasterizeSegments, scanRuns } from '../src/features/upload/wallDetect';

/** 문자열 아트로 이진 격자 생성 ('#'=어두움) */
function gridOf(rows: string[]): { grid: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const grid = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) if (row[x] === '#') grid[y * w + x] = 1;
  });
  return { grid, w, h };
}

describe('벽 자동 인식 코어 (wallDetect)', () => {
  it('scanRuns: 긴 수평 런 검출, 짧은 노이즈(문자 등)는 minLen 필터', () => {
    const { grid, w, h } = gridOf([
      '............',
      '.##########.',
      '............',
      '...##.......', // 길이 2 — 노이즈
    ]);
    const segs = scanRuns(grid, w, h, 6, 1);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ axis: 'h', at: 1, from: 1, to: 11 });
  });

  it('scanRuns: gap 이하 끊김은 이어붙인다 (문 개구부 소거는 gap 초과로 분리)', () => {
    const { grid, w, h } = gridOf(['.####.####..']);
    // gap=1: 1칸 끊김 연결 → 한 런
    expect(scanRuns(grid, w, h, 6, 1)).toHaveLength(1);
    // gap=0: 두 런으로 분리 — 각각 minLen(4) 통과
    expect(scanRuns(grid, w, h, 4, 0)).toHaveLength(2);
  });

  it('scanRuns: 수직 런 검출', () => {
    const { grid, w, h } = gridOf(['..#..', '..#..', '..#..', '..#..', '..#..']);
    const segs = scanRuns(grid, w, h, 4, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ axis: 'v', at: 2, from: 0, to: 5 });
  });

  it('mergeParallel: 벽 두께(인접 평행 런)를 한 선으로 병합', () => {
    const { grid, w, h } = gridOf([
      '.##########.',
      '.##########.',
      '.##########.',
    ]);
    const merged = mergeParallel(scanRuns(grid, w, h, 6, 0), 2);
    expect(merged).toHaveLength(1);
    expect(merged[0].at).toBeCloseTo(1, 6); // 세 행의 중심
  });

  it('detectSegments: ㅁ자 방(두께 2) → 수평 2 + 수직 2 선분', () => {
    const rows = [
      '############',
      '############',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '############',
      '############',
    ];
    const { grid, w, h } = gridOf(rows);
    const lines = detectSegments(grid, w, h, { minLen: 5, gap: 0, mergeTol: 2, maxLines: 10 });
    const horizontals = lines.filter((l) => l.points[0].y === l.points[1].y);
    const verticals = lines.filter((l) => l.points[0].x === l.points[1].x);
    expect(horizontals).toHaveLength(2);
    expect(verticals).toHaveLength(2);
  });

  it('detectSegments: maxLines 초과 시 긴 선 우선', () => {
    const { grid, w, h } = gridOf([
      '##########..',
      '............',
      '#####.......',
      '............',
      '#######.....',
    ]);
    const lines = detectSegments(grid, w, h, { minLen: 4, gap: 0, mergeTol: 1, maxLines: 2 });
    expect(lines).toHaveLength(2);
    const lens = lines.map((l) => Math.abs(l.points[1].x - l.points[0].x));
    expect(Math.min(...lens)).toBeGreaterThanOrEqual(7); // 10, 7 이 살아남음
  });
});

describe('외곽 폐합 + 닫힌 공간 검출', () => {
  it('closeOutline: 코너 스냅으로 ㄱ자 틈 봉합', () => {
    // 수평선이 수직선에 3칸 못 미침 → cornerSnap 4로 연장
    const segs = [
      { axis: 'h' as const, at: 0, from: 3, to: 17 },
      { axis: 'v' as const, at: 0, from: 0, to: 20 },
    ];
    const closed = closeOutline(segs, { cornerSnap: 4, boundaryMargin: 2, boundaryBridge: 10 });
    const h = closed.find((s) => s.axis === 'h')!;
    expect(h.from).toBe(0); // 수직선(at=0)까지 연장
  });

  it('closeOutline: 외곽 라인만 관대한 브리징, 내부는 미적용', () => {
    const segs = [
      // 외곽 상단: 두 조각 (gap 8)
      { axis: 'h' as const, at: 0, from: 0, to: 10 },
      { axis: 'h' as const, at: 0, from: 18, to: 30 },
      // 내부: 같은 gap 8 — 이어지면 안 됨
      { axis: 'h' as const, at: 15, from: 0, to: 10 },
      { axis: 'h' as const, at: 15, from: 18, to: 30 },
      // bbox 확장용 수직 외곽
      { axis: 'v' as const, at: 0, from: 0, to: 30 },
      { axis: 'v' as const, at: 30, from: 0, to: 30 },
    ];
    const closed = closeOutline(segs, { cornerSnap: 2, boundaryMargin: 2, boundaryBridge: 10 });
    const topH = closed.filter((s) => s.axis === 'h' && s.at === 0);
    const midH = closed.filter((s) => s.axis === 'h' && s.at === 15);
    expect(topH).toHaveLength(1); // 브리징됨
    expect(topH[0]).toMatchObject({ from: 0, to: 30 });
    expect(midH).toHaveLength(2); // 내부는 그대로
  });

  it('detectEnclosedRegions: 선분으로 둘러싸인 내부만 방 후보', () => {
    // 20x16 사각 외곽 (문 gap 은 rasterize 전 선분이 관통해 이어져 있다고 가정)
    const lines = [
      { points: [{ x: 2, y: 2 }, { x: 22, y: 2 }], closed: false },
      { points: [{ x: 22, y: 2 }, { x: 22, y: 18 }], closed: false },
      { points: [{ x: 22, y: 18 }, { x: 2, y: 18 }], closed: false },
      { points: [{ x: 2, y: 18 }, { x: 2, y: 2 }], closed: false },
    ];
    const mask = rasterizeSegments(lines, 26, 22, 1);
    const regions = detectEnclosedRegions(mask, 26, 22, 20);
    expect(regions).toHaveLength(1);
    // 내부 bbox 는 벽 안쪽
    expect(regions[0].min.x).toBeGreaterThan(2);
    expect(regions[0].max.x).toBeLessThan(22);
  });
});

describe('개구부 검출 (findGapsAlongLine)', () => {
  it('벽 선 위 밝은 갭을 개구부로, 끝단 갭·과대 갭은 제외', () => {
    // 가로 벽 y=5, x 0..60 — x 20~28 문 갭, x 45~47 미세 갭(minGap 미달)
    const isDark = (x: number, y: number) =>
      Math.abs(y - 5) <= 1 && x >= 0 && x <= 60 && !(x >= 20 && x < 28) && !(x >= 45 && x < 47);
    const gaps = findGapsAlongLine(isDark, { x: 0, y: 5 }, { x: 60, y: 5 }, {
      band: 1,
      minGap: 5,
      maxGap: 15,
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].center.x).toBeGreaterThan(21);
    expect(gaps[0].center.x).toBeLessThan(27);
    expect(gaps[0].width).toBeGreaterThanOrEqual(6);
  });

  it('갭 없는 벽·전부 밝은 선은 개구부 없음', () => {
    const solid = (x: number, y: number) => Math.abs(y - 3) <= 1 && x >= 0 && x <= 40;
    expect(
      findGapsAlongLine(solid, { x: 0, y: 3 }, { x: 40, y: 3 }, { band: 1, minGap: 5, maxGap: 15 }),
    ).toHaveLength(0);
    const empty = () => false;
    // 전부 갭 = 끝단 접합 갭 취급이라 제외 (maxGap 로도 걸러짐)
    expect(
      findGapsAlongLine(empty, { x: 0, y: 3 }, { x: 40, y: 3 }, { band: 1, minGap: 5, maxGap: 15 }),
    ).toHaveLength(0);
  });
});
