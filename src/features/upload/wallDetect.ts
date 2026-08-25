import type { Vec2 } from '../../model/types';

/**
 * 업로드 도면 벽 자동 인식 — 순수 코어 (DOM 무관, 테스트 대상).
 *
 * 입력: 이진화된 격자(어두운 픽셀 = 벽 후보). 긴 수평/수직 어두운 런을
 * 벽 선분 후보로 스캔하고, 두꺼운 벽이 만드는 인접 평행 런을 하나로 병합한다.
 * 문자·가구 심볼 같은 짧은 런은 minLen 으로 걸러진다.
 */

export type Segment = { axis: 'h' | 'v'; at: number; from: number; to: number };

/** 행/열 방향 어두운 런 스캔 — gap 셀 이하 끊김은 이어붙인다 */
export function scanRuns(
  grid: Uint8Array,
  w: number,
  h: number,
  minLen: number,
  gap: number,
): Segment[] {
  const out: Segment[] = [];
  const emit = (axis: 'h' | 'v', at: number, from: number, to: number) => {
    if (to - from >= minLen) out.push({ axis, at, from, to });
  };
  // 수평 (행 단위)
  for (let y = 0; y < h; y++) {
    let start = -1;
    let miss = 0;
    let last = -1;
    for (let x = 0; x <= w; x++) {
      const dark = x < w && grid[y * w + x] === 1;
      if (dark) {
        if (start < 0) start = x;
        last = x;
        miss = 0;
      } else if (start >= 0) {
        miss++;
        if (miss > gap || x === w) {
          emit('h', y, start, last + 1);
          start = -1;
          miss = 0;
        }
      }
    }
  }
  // 수직 (열 단위)
  for (let x = 0; x < w; x++) {
    let start = -1;
    let miss = 0;
    let last = -1;
    for (let y = 0; y <= h; y++) {
      const dark = y < h && grid[y * w + x] === 1;
      if (dark) {
        if (start < 0) start = y;
        last = y;
        miss = 0;
      } else if (start >= 0) {
        miss++;
        if (miss > gap || y === h) {
          emit('v', x, start, last + 1);
          start = -1;
          miss = 0;
        }
      }
    }
  }
  return out;
}

/**
 * 인접 평행 런 병합 — 벽 두께(여러 행/열에 걸친 동일 선)를 하나의 선으로.
 * at 이 tol 이내이고 구간이 겹치면 묶어서 중심 at·합집합 구간으로 만든다.
 */
export function mergeParallel(segments: Segment[], tol: number): Segment[] {
  const byAxis = { h: [] as Segment[], v: [] as Segment[] };
  for (const s of segments) byAxis[s.axis].push(s);
  const out: Segment[] = [];
  for (const axis of ['h', 'v'] as const) {
    const list = [...byAxis[axis]].sort((a, b) => a.at - b.at || a.from - b.from);
    const used = new Array(list.length).fill(false);
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      const group = [list[i]];
      used[i] = true;
      for (let j = i + 1; j < list.length; j++) {
        if (used[j]) continue;
        const g = group[group.length - 1];
        if (list[j].at - g.at > tol) break;
        const overlaps = group.some(
          (m) => list[j].from < m.to + tol && list[j].to > m.from - tol,
        );
        if (overlaps) {
          group.push(list[j]);
          used[j] = true;
        }
      }
      const atAvg =
        group.reduce((s, m) => s + m.at * (m.to - m.from), 0) /
        group.reduce((s, m) => s + (m.to - m.from), 0);
      out.push({
        axis,
        at: atAvg,
        from: Math.min(...group.map((m) => m.from)),
        to: Math.max(...group.map((m) => m.to)),
      });
    }
  }
  return out;
}

export type DetectedLine = { points: Vec2[]; closed: boolean };

/**
 * 이진 격자 → 벽 선분 목록 (격자 좌표계).
 * maxLines 초과 시 긴 것 우선으로 자른다 (노이즈 억제).
 */
export function detectSegments(
  grid: Uint8Array,
  w: number,
  h: number,
  opts: { minLen: number; gap: number; mergeTol: number; maxLines: number },
): DetectedLine[] {
  const merged = mergeParallel(scanRuns(grid, w, h, opts.minLen, opts.gap), opts.mergeTol);
  merged.sort((a, b) => b.to - b.from - (a.to - a.from));
  return merged.slice(0, opts.maxLines).map((s) =>
    s.axis === 'h'
      ? { points: [{ x: s.from, y: s.at }, { x: s.to, y: s.at }], closed: false }
      : { points: [{ x: s.at, y: s.from }, { x: s.at, y: s.to }], closed: false },
  );
}
