import { describe, expect, it } from 'vitest';
import { detectSegments, mergeParallel, scanRuns } from '../src/features/upload/wallDetect';

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
