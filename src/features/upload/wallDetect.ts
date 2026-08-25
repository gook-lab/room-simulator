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
 * 외곽 폐합 후처리 — "집 둘레는 끊김 없이 벽으로 완결" 기대 기준.
 * 1) 코너 스냅: 세그먼트 끝점을 근처 수직 세그먼트 라인까지 연장 (T/L 접합 봉합)
 * 2) 외곽 브리징: 전체 bbox 가장자리에 붙은 라인은 동일선상 gap 을
 *    관대한 기준(boundaryBridge)으로 이어붙인다 — 내부 라인에는 미적용
 *    (복도 등 실제 통로를 오연결하지 않기 위해).
 */
export function closeOutline(
  segments: Segment[],
  opts: { cornerSnap: number; boundaryMargin: number; boundaryBridge: number },
): Segment[] {
  if (segments.length === 0) return segments;
  const hs = segments.filter((s) => s.axis === 'h');
  const vs = segments.filter((s) => s.axis === 'v');
  const snapEnds = (s: Segment, perps: Segment[]): Segment => {
    let { from, to } = s;
    for (const p of perps) {
      const coversAt =
        p.from - opts.cornerSnap <= s.at && p.to + opts.cornerSnap >= s.at;
      if (!coversAt) continue;
      if (Math.abs(from - p.at) <= opts.cornerSnap) from = Math.min(from, p.at);
      if (Math.abs(to - p.at) <= opts.cornerSnap) to = Math.max(to, p.at);
    }
    return { ...s, from, to };
  };
  const snapped = [...hs.map((s) => snapEnds(s, vs)), ...vs.map((s) => snapEnds(s, hs))];

  // 외곽 후보 판정용 전체 bbox
  const xs = snapped.map((s) => (s.axis === 'h' ? s.from : s.at));
  const xe = snapped.map((s) => (s.axis === 'h' ? s.to : s.at));
  const ys = snapped.map((s) => (s.axis === 'v' ? s.from : s.at));
  const ye = snapped.map((s) => (s.axis === 'v' ? s.to : s.at));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xe);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ye);
  const isBoundary = (s: Segment) =>
    s.axis === 'h'
      ? s.at <= minY + opts.boundaryMargin || s.at >= maxY - opts.boundaryMargin
      : s.at <= minX + opts.boundaryMargin || s.at >= maxX - opts.boundaryMargin;

  const boundary = snapped.filter(isBoundary);
  const interior = snapped.filter((s) => !isBoundary(s));
  // 동일선상(at 근접) 외곽 세그먼트를 관대한 gap 으로 병합
  const bridged: Segment[] = [];
  for (const axis of ['h', 'v'] as const) {
    const list = boundary
      .filter((s) => s.axis === axis)
      .sort((a, b) => a.at - b.at || a.from - b.from);
    const used = new Array(list.length).fill(false);
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      let cur = list[i];
      used[i] = true;
      for (let j = i + 1; j < list.length; j++) {
        if (used[j]) continue;
        if (Math.abs(list[j].at - cur.at) > opts.cornerSnap) continue;
        if (list[j].from - cur.to <= opts.boundaryBridge && list[j].to >= cur.from) {
          cur = { ...cur, from: Math.min(cur.from, list[j].from), to: Math.max(cur.to, list[j].to) };
          used[j] = true;
        }
      }
      bridged.push(cur);
    }
  }
  return [...interior, ...bridged];
}

/* ===== 영역 → 직교 폴리곤 추출 (L자 등 비직사각 지원) ===== */

/**
 * 라벨된 영역의 외곽 윤곽을 직교 폴리곤으로 추출한다.
 * 경계 셀 변을 "영역이 왼쪽"이 되는 방향의 단위 엣지로 수집해 체인으로 잇고,
 * 동일선 병합 후 tol 미만의 계단(지그재그)을 직선화한다. 구멍(내부 루프)은
 * 무시하고 가장 긴 루프만 반환한다.
 */
export function traceRegionPolygon(
  inRegion: (x: number, y: number) => boolean,
  bounds: { min: Vec2; max: Vec2 },
  simplifyTol: number,
): Vec2[] {
  // 1) 경계 엣지 수집 (셀 (x,y) 기준, 격자 정점 좌표계)
  const edges = new Map<string, Vec2[]>(); // startKey → [end,...]
  const key = (p: Vec2) => `${p.x},${p.y}`;
  const addEdge = (a: Vec2, b: Vec2) => {
    const list = edges.get(key(a));
    if (list) list.push(b);
    else edges.set(key(a), [b]);
  };
  for (let y = bounds.min.y; y <= bounds.max.y; y++) {
    for (let x = bounds.min.x; x <= bounds.max.x; x++) {
      if (!inRegion(x, y)) continue;
      if (!inRegion(x, y - 1)) addEdge({ x, y }, { x: x + 1, y }); // 위 → 우향
      if (!inRegion(x + 1, y)) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 }); // 우 → 하향
      if (!inRegion(x, y + 1)) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 }); // 아래 → 좌향
      if (!inRegion(x - 1, y)) addEdge({ x, y: y + 1 }, { x, y }); // 좌 → 상향
    }
  }
  // 2) 체인 걷기 — 가장 긴 루프 채택
  let best: Vec2[] = [];
  const visited = new Set<string>();
  for (const [startKey, ends] of edges) {
    for (let branch = 0; branch < ends.length; branch++) {
      const edgeId = `${startKey}>${key(ends[branch])}`;
      if (visited.has(edgeId)) continue;
      const loop: Vec2[] = [];
      const [sx, sy] = startKey.split(',').map(Number);
      let cur: Vec2 = { x: sx, y: sy };
      let guard = 0;
      while (guard++ < 100000) {
        const outs = edges.get(key(cur));
        if (!outs || outs.length === 0) break;
        let next: Vec2 | undefined;
        for (const cand of outs) {
          if (!visited.has(`${key(cur)}>${key(cand)}`)) {
            next = cand;
            break;
          }
        }
        if (!next) break;
        visited.add(`${key(cur)}>${key(next)}`);
        loop.push({ ...cur });
        cur = next;
        if (cur.x === sx && cur.y === sy) break;
      }
      if (loop.length > best.length) best = loop;
    }
  }
  if (best.length < 4) return best;
  // 3) 동일선 병합
  const collapse = (poly: Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const prev = poly[(i - 1 + poly.length) % poly.length];
      const cur = poly[i];
      const next = poly[(i + 1) % poly.length];
      const collinear =
        (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y);
      if (!collinear) out.push(cur);
    }
    return out;
  };
  let poly = collapse(best);
  // 4) 계단 직선화: H-V(짧음)-H / V-H(짧음)-V 패턴의 짧은 변 제거
  let changed = true;
  let guard2 = 0;
  while (changed && guard2++ < 200 && poly.length > 4) {
    changed = false;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len === 0 || len >= simplifyTol) continue;
      if (a.x === b.x) {
        // 짧은 수직 변 → 이웃 수평 변을 같은 y 로
        const y = Math.round((a.y + b.y) / 2);
        a.y = y;
        b.y = y;
      } else {
        const x = Math.round((a.x + b.x) / 2);
        a.x = x;
        b.x = x;
      }
      poly = collapse(poly);
      changed = true;
      break;
    }
  }
  return poly;
}

/* ===== 스케일 추정 — 벽 픽셀 두께 기반 ===== */

/**
 * 검출된 선분 위 여러 지점에서 수직 방향 어두운 런 길이를 재어
 * 벽의 픽셀 두께 중앙값을 구한다. 실제 벽 두께(≈0.15~0.2m)와 비교하면
 * 도면의 실세계 폭을 추정할 수 있다 — "폭 10m 가정"보다 훨씬 정확한 초기 스케일.
 */
export function estimateWallThickness(
  grid: Uint8Array,
  w: number,
  h: number,
  lines: DetectedLine[],
): number {
  const runs: number[] = [];
  const runAt = (x: number, y: number, dx: number, dy: number): number => {
    let n = 0;
    let px = x;
    let py = y;
    while (px >= 0 && px < w && py >= 0 && py < h && grid[py * w + px] === 1 && n < 50) {
      n++;
      px += dx;
      py += dy;
    }
    return n;
  };
  for (const line of lines) {
    const [a, b] = line.points;
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    for (const t of [0.25, 0.5, 0.75]) {
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      if (x < 0 || x >= w || y < 0 || y >= h || grid[y * w + x] !== 1) continue;
      const run = horizontal
        ? runAt(x, y, 0, 1) + runAt(x, y, 0, -1) - 1
        : runAt(x, y, 1, 0) + runAt(x, y, -1, 0) - 1;
      if (run > 0 && run < 40) runs.push(run);
    }
  }
  if (runs.length === 0) return 0;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

/* ===== 건물 풋프린트 외곽 폴리곤 ===== */

/**
 * 실루엣 마스크에서 외부(테두리 flood)를 제외한 풋프린트의 외곽 윤곽을
 * 직교 폴리곤으로 추출한다 — 외곽 벽 엔티티 생성용 (문·창 구간 포함 연속).
 */
export function footprintOutline(
  silhouette: Uint8Array,
  w: number,
  h: number,
  simplifyTol: number,
): Vec2[] {
  const exterior = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (silhouette[i] === 0 && exterior[i] === 0) {
      exterior[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  // 풋프린트 = 외부가 아닌 모든 셀 (벽 + 내부)
  return traceRegionPolygon(
    (x, y) => x >= 0 && x < w && y >= 0 && y < h && exterior[y * w + x] === 0,
    { min: { x: 0, y: 0 }, max: { x: w - 1, y: h - 1 } },
    simplifyTol,
  );
}

/* ===== 닫힌 공간(방) 검출 — best-effort ===== */

/**
 * 검출 선분을 마스크에 래스터라이즈.
 * 선분은 개구부(문·창)를 이미 관통해 이어져 있으므로, 원본 래스터와 달리
 * 이 마스크에서는 방이 개구부로 새지 않는다.
 */
export function rasterizeSegments(
  lines: DetectedLine[],
  w: number,
  h: number,
  thick: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  const paint = (x: number, y: number) => {
    for (let dy = -thick; dy <= thick; dy++) {
      for (let dx = -thick; dx <= thick; dx++) {
        const px = Math.round(x) + dx;
        const py = Math.round(y) + dy;
        if (px >= 0 && px < w && py >= 0 && py < h) mask[py * w + px] = 1;
      }
    }
  };
  for (const line of lines) {
    for (let i = 0; i < line.points.length - 1; i++) {
      const a = line.points[i];
      const b = line.points[i + 1];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
      for (let s = 0; s <= steps; s++) {
        paint(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
      }
    }
  }
  return mask;
}

/**
 * 실루엣 외피 — 도면의 외곽 테두리를 끊김 없이 봉합한다.
 * 각 행의 최좌/최우, 각 열의 최상/최하 벽 셀을 인접 행/열과 연결해
 * 도형의 외곽 엔벨로프를 닫힌 곡선으로 그린다. 외곽 벽의 인식 누락·개구부가
 * 있어도 둘레가 완결되어 flood fill 이 내부로 새지 않는다.
 */
export function silhouetteMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask); // 원본 포함
  const paintH = (y: number, x1: number, x2: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) out[y * w + x] = 1;
  };
  const paintV = (x: number, y1: number, y2: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) out[y * w + x] = 1;
  };
  // 좌/우 경계 (행 단위 연결)
  let prevL = -1;
  let prevR = -1;
  for (let y = 0; y < h; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (l < 0) l = x;
        r = x;
      }
    }
    if (l < 0) {
      prevL = -1;
      prevR = -1;
      continue;
    }
    out[y * w + l] = 1;
    out[y * w + r] = 1;
    if (prevL >= 0) paintH(y, prevL, l);
    if (prevR >= 0) paintH(y, prevR, r);
    prevL = l;
    prevR = r;
  }
  // 상/하 경계 (열 단위 연결)
  let prevT = -1;
  let prevB = -1;
  for (let x = 0; x < w; x++) {
    let tTop = -1;
    let b = -1;
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) {
        if (tTop < 0) tTop = y;
        b = y;
      }
    }
    if (tTop < 0) {
      prevT = -1;
      prevB = -1;
      continue;
    }
    out[tTop * w + x] = 1;
    out[b * w + x] = 1;
    if (prevT >= 0) paintV(x, prevT, tTop);
    if (prevB >= 0) paintV(x, prevB, b);
    prevT = tTop;
    prevB = b;
  }
  return out;
}

export type EnclosedRegion = {
  min: Vec2;
  max: Vec2;
  /** 실제 채움 셀 수 (면적 근사용 — bbox 과대평가 보정) */
  areaCells: number;
  /** 직교 윤곽 폴리곤 (L자 지원) — 추출 실패 시 undefined (bbox 폴백) */
  polygon?: Vec2[];
};

/**
 * 벽 마스크로 둘러싸인 내부 영역 검출 — 테두리에서 외부를 flood fill 로
 * 제거하고, 남은 빈 영역 중 minAreaCells 이상을 방 후보로 반환한다.
 * 폴리곤은 bbox 근사 (L자 등 비직사각 공간은 과대평가 — best-effort).
 */
export function detectEnclosedRegions(
  mask: Uint8Array,
  w: number,
  h: number,
  minAreaCells: number,
  opts?: { polygonTol?: number },
): EnclosedRegion[] {
  const label = new Int32Array(w * h); // 0=미방문, -1=외부, n>0=영역 id
  const stack: number[] = [];
  const flood = (start: number, id: number): { min: Vec2; max: Vec2; count: number } => {
    stack.length = 0;
    stack.push(start);
    label[start] = id;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const push = (j: number) => {
        if (label[j] === 0 && mask[j] === 0) {
          label[j] = id;
          stack.push(j);
        }
      };
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY }, count };
  };
  // 외부 제거 (테두리에서 시작)
  for (let x = 0; x < w; x++) {
    for (const i of [x, (h - 1) * w + x]) {
      if (label[i] === 0 && mask[i] === 0) flood(i, -1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (const i of [y * w, y * w + w - 1]) {
      if (label[i] === 0 && mask[i] === 0) flood(i, -1);
    }
  }
  // 내부 영역 라벨링
  const out: EnclosedRegion[] = [];
  let nextId = 1;
  for (let i = 0; i < w * h; i++) {
    if (label[i] === 0 && mask[i] === 0) {
      const id = nextId++;
      const r = flood(i, id);
      if (r.count >= minAreaCells) {
        let polygon: Vec2[] | undefined;
        if (opts?.polygonTol != null) {
          const poly = traceRegionPolygon(
            (x, y) => x >= 0 && x < w && y >= 0 && y < h && label[y * w + x] === id,
            { min: r.min, max: r.max },
            opts.polygonTol,
          );
          if (poly.length >= 4) polygon = poly;
        }
        out.push({ min: r.min, max: r.max, areaCells: r.count, polygon });
      }
    }
  }
  return out.sort((a, b) => b.areaCells - a.areaCells);
}

/**
 * 이진 격자 → 벽 선분 목록 (격자 좌표계).
 * maxLines 초과 시 긴 것 우선으로 자른다 (노이즈 억제).
 */
export function detectSegments(
  grid: Uint8Array,
  w: number,
  h: number,
  opts: {
    minLen: number;
    gap: number;
    mergeTol: number;
    maxLines: number;
    /** 외곽 폐합 후처리 옵션 (미지정 시 생략) */
    close?: { cornerSnap: number; boundaryMargin: number; boundaryBridge: number };
  },
): DetectedLine[] {
  let merged = mergeParallel(scanRuns(grid, w, h, opts.minLen, opts.gap), opts.mergeTol);
  if (opts.close) merged = closeOutline(merged, opts.close);
  merged.sort((a, b) => b.to - b.from - (a.to - a.from));
  return merged.slice(0, opts.maxLines).map((s) =>
    s.axis === 'h'
      ? { points: [{ x: s.from, y: s.at }, { x: s.to, y: s.at }], closed: false }
      : { points: [{ x: s.at, y: s.from }, { x: s.at, y: s.to }], closed: false },
  );
}
