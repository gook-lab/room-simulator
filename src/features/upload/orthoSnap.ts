import type { Vec2 } from '../../model/types';

/**
 * 업로드 인식 결과의 직교 보정 — 순수 함수 (DOM 무관, 테스트 대상).
 *
 * 래스터 윤곽은 셀 계단이라 그대로 쓰면 벽이 잘게 쪼개지고, 계단을 아무렇게나
 * 펴면 벽이 기운다(45차 QA B-01). 여기서는 계단을 직선으로 줄인 뒤, 축에서
 * ORTHO_SNAP_DEG 이내로 어긋난 변만 수평·수직으로 펴고 그보다 큰 각의 변은
 * 사선 그대로 둔다.
 */

/**
 * 직교 보정 각도 허용치(°) — 축과 이 각도 이내로 어긋난 변만 수평·수직으로 편다.
 * 에디터 벽 그리기의 각도 스냅이 15° 단위라, 의도한 사선은 15° 이상이다.
 */
export const ORTHO_SNAP_DEG = 10;

type AxisLine = { kind: 'h' | 'v'; c: number };
type FreeLine = { kind: 'free'; p: Vec2; q: Vec2 };
export type EdgeLine = AxisLine | FreeLine;

const EPS = 1e-9;

function perpDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** 닫힌 루프 Douglas–Peucker — 남길 정점 인덱스(오름차순) */
function simplifyIndices(pts: Vec2[], eps: number): number[] {
  const n = pts.length;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = pts[i0 % n];
    const b = pts[i1 % n];
    let maxD = -1;
    let idx = -1;
    for (let k = i0 + 1; k < i1; k++) {
      const d = perpDist(pts[k % n], a, b);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (idx >= 0 && maxD > eps) {
      keep[idx % n] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

function weightedMedian(samples: { v: number; w: number }[]): number {
  const sorted = [...samples].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const s of sorted) {
    acc += s.w;
    if (acc >= total / 2) return s.v;
  }
  return sorted[sorted.length - 1].v;
}

function intersect(l1: EdgeLine, l2: EdgeLine, fallback: Vec2): Vec2 {
  if (l1.kind === 'h' && l2.kind === 'v') return { x: l2.c, y: l1.c };
  if (l1.kind === 'v' && l2.kind === 'h') return { x: l1.c, y: l2.c };
  const asPQ = (l: EdgeLine): [Vec2, Vec2] =>
    l.kind === 'free'
      ? [l.p, l.q]
      : l.kind === 'h'
        ? [{ x: 0, y: l.c }, { x: 1, y: l.c }]
        : [{ x: l.c, y: 0 }, { x: l.c, y: 1 }];
  const [p1, q1] = asPQ(l1);
  const [p2, q2] = asPQ(l2);
  const d1x = q1.x - p1.x;
  const d1y = q1.y - p1.y;
  const d2x = q2.x - p2.x;
  const d2y = q2.y - p2.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-6 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y)) return fallback;
  const t = ((p2.x - p1.x) * d2y - (p2.y - p1.y) * d2x) / den;
  return { x: p1.x + d1x * t, y: p1.y + d1y * t };
}

/** 연속 중복점 · 일직선 중간점 제거 */
function tidy(poly: Vec2[]): Vec2[] {
  let pts = poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(q.x - p.x, q.y - p.y) > 1e-6;
  });
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
      if (Math.abs(cross) <= 1e-9 * Math.max(1, scale)) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** 변 직선 목록 → 정점 (이웃 변 직선의 교점) */
export function linesToPolygon(lines: EdgeLine[], hints: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[(i + 1) % lines.length];
    const hint = hints[(i + 1) % lines.length];
    if (cur.kind !== 'free' && cur.kind === next.kind) {
      // 같은 축 두 변이 이어지면 힌트 정점 자리에 수직 연결 변을 끼운다
      if (cur.kind === 'h') out.push({ x: hint.x, y: cur.c }, { x: hint.x, y: next.c });
      else out.push({ x: cur.c, y: hint.y }, { x: next.c, y: hint.y });
    } else {
      out.push(intersect(cur, next, hint));
    }
  }
  // out[i] 는 변 i 의 끝점 — 시작점 기준으로 한 칸 돌린다
  return tidy([out[out.length - 1], ...out.slice(0, -1)]);
}

/** 다각형 → 변 직선 (축 정렬 변은 좌표 하나로) */
export function polygonToLines(poly: Vec2[]): EdgeLine[] {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (Math.abs(p.y - q.y) < 1e-9) return { kind: 'h', c: p.y };
    if (Math.abs(p.x - q.x) < 1e-9) return { kind: 'v', c: p.x };
    return { kind: 'free', p, q };
  });
}

/**
 * 사선 변 직선 — 양 끝 정점은 이웃 수평·수직 띠의 모서리라 사선에서 벗어나
 * 있으므로, 그 사이 계단 정점들에 주축을 맞춘다. 정점이 모자라면 양 끝을 잇는다.
 */
function fitLine(raw: Vec2[], i0: number, i1: number, p: Vec2, q: Vec2): FreeLine {
  const pts: Vec2[] = [];
  for (let k = i0 + 1; k < i1; k++) pts.push(raw[k % raw.length]);
  if (pts.length < 4) return { kind: 'free', p, q };
  const mx = pts.reduce((s, v) => s + v.x, 0) / pts.length;
  const my = pts.reduce((s, v) => s + v.y, 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const v of pts) {
    sxx += (v.x - mx) ** 2;
    syy += (v.y - my) ** 2;
    sxy += (v.x - mx) * (v.y - my);
  }
  const theta = Math.atan2(2 * sxy, sxx - syy) / 2;
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  return { kind: 'free', p: { x: mx, y: my }, q: { x: mx + ux, y: my + uy } };
}

/**
 * 셀 계단 루프 → 단순 다각형. eps 이하의 요철은 지우고, 축에서 maxDeg 이내인
 * 변은 수평·수직으로 편다(좌표 = 그 변이 덮는 원래 계단의 길이 가중 중앙값).
 * 결과가 원래 면적에서 크게 벗어나면 원래 루프를 돌려준다.
 */
export function simplifyLoop(raw: Vec2[], eps: number, maxDeg = ORTHO_SNAP_DEG): Vec2[] {
  if (raw.length <= 4 || eps <= 0) return raw;
  const keep = simplifyIndices(raw, eps);
  if (keep.length < 3) return raw;
  const tan = Math.tan((maxDeg * Math.PI) / 180);
  type Draft = { line: EdgeLine; samples: { v: number; w: number }[] };
  const drafts: Draft[] = [];
  for (let e = 0; e < keep.length; e++) {
    const i0 = keep[e];
    const i1 = e + 1 < keep.length ? keep[e + 1] : keep[0] + raw.length;
    const p = raw[i0 % raw.length];
    const q = raw[i1 % raw.length];
    const dx = Math.abs(q.x - p.x);
    const dy = Math.abs(q.y - p.y);
    const kind: EdgeLine['kind'] = dy <= dx * tan ? 'h' : dx <= dy * tan ? 'v' : 'free';
    if (kind === 'free') {
      drafts.push({ line: fitLine(raw, i0, i1, p, q), samples: [] });
      continue;
    }
    const samples: { v: number; w: number }[] = [];
    for (let k = i0; k < i1; k++) {
      const a = raw[k % raw.length];
      const b = raw[(k + 1) % raw.length];
      if (kind === 'h' && a.y === b.y) samples.push({ v: a.y, w: Math.abs(b.x - a.x) });
      if (kind === 'v' && a.x === b.x) samples.push({ v: a.x, w: Math.abs(b.y - a.y) });
    }
    const c = samples.length ? weightedMedian(samples) : kind === 'h' ? (p.y + q.y) / 2 : (p.x + q.x) / 2;
    drafts.push({ line: { kind, c }, samples });
  }
  // 같은 축으로 이어진 두 변이 eps 안에서 겹치면 한 변으로 합친다 (원형 순회)
  const hints = keep.map((i) => raw[i]);
  let merged = true;
  while (merged && drafts.length > 3) {
    merged = false;
    for (let i = 0; i < drafts.length; i++) {
      const j = (i + 1) % drafts.length;
      const a = drafts[i].line;
      const b = drafts[j].line;
      if (a.kind === 'free' || a.kind !== b.kind) continue;
      if (Math.abs((a as AxisLine).c - (b as AxisLine).c) > eps) continue;
      const samples = [...drafts[i].samples, ...drafts[j].samples];
      drafts[i] = { line: { kind: a.kind, c: weightedMedian(samples) }, samples };
      drafts.splice(j, 1);
      hints.splice(j, 1);
      merged = true;
      break;
    }
  }
  if (drafts.length < 3) return raw;
  const poly = linesToPolygon(
    drafts.map((d) => d.line),
    hints,
  );
  const rawArea = Math.abs(signedArea(raw));
  if (poly.length < 3 || Math.abs(Math.abs(signedArea(poly)) - rawArea) > rawArea * 0.25) return raw;
  return poly;
}

/**
 * 다각형 변을 근처 평행 벽 중심선으로 옮긴다. 래스터 윤곽은 벽 바깥 면을
 * 따라가므로, 같은 벽의 중심선에 맞춰야 내벽 끝과 만난다. 후보는 방향이 같고
 * (축 변은 같은 축, 사선 변은 3° 이내) tol 이내에 있는 중심선 중 변과 가장 길게
 * 겹치는 것 — 겹침이 변 길이의 절반 미만이면 옮기지 않는다.
 */
export function snapPolygonToCenterlines(
  poly: Vec2[],
  centerlines: { points: Vec2[] }[],
  tol: number,
): Vec2[] {
  if (poly.length < 3 || centerlines.length === 0) return poly;
  const cosTol = Math.cos((3 * Math.PI) / 180);
  const snapped = polygonToLines(poly).map((l, i): EdgeLine => {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < EPS) return l;
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    let best: { line: EdgeLine; overlap: number; d: number } | null = null;
    for (const c of centerlines) {
      const [a, b] = c.points;
      const cLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (cLen < EPS) continue;
      const cx = (b.x - a.x) / cLen;
      const cy = (b.y - a.y) / cLen;
      const isH = Math.abs(a.y - b.y) < EPS;
      const isV = Math.abs(a.x - b.x) < EPS;
      if (l.kind === 'h' ? !isH : l.kind === 'v' ? !isV : Math.abs(ux * cx + uy * cy) < cosTol) continue;
      // 변 중점에서 중심선(무한 직선)까지 거리
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const d = Math.abs((mx - a.x) * cy - (my - a.y) * cx);
      if (d > tol) continue;
      // 변 방향으로 투영한 겹침 길이
      const ta = (a.x - p.x) * ux + (a.y - p.y) * uy;
      const tb = (b.x - p.x) * ux + (b.y - p.y) * uy;
      const overlap = Math.min(len, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
      if (overlap < len / 2) continue;
      if (!best || overlap > best.overlap + EPS || (Math.abs(overlap - best.overlap) <= EPS && d < best.d)) {
        const line: EdgeLine =
          l.kind === 'h' ? { kind: 'h', c: a.y } : l.kind === 'v' ? { kind: 'v', c: a.x } : { kind: 'free', p: a, q: b };
        best = { line, overlap, d };
      }
    }
    return best ? best.line : l;
  });
  return linesToPolygon(snapped, poly);
}

/**
 * 선분 끝을 가까운 교차 대상(다른 선분 · 외곽 변)까지 늘이거나 줄여 정확히
 * 만나게 한다. 끝에서 선 방향으로 tol 이내인 교점 중 가장 가까운 것을 쓴다.
 * 선 방향은 바뀌지 않으므로 수평·수직 선은 그대로 수평·수직이다.
 */
export function joinLineEnds<T extends { points: Vec2[] }>(
  lines: T[],
  targets: [Vec2, Vec2][],
  tol: number,
): T[] {
  const all: [Vec2, Vec2][] = [...lines.map((l) => [l.points[0], l.points[1]] as [Vec2, Vec2]), ...targets];
  return lines.map((line, li) => {
    const [a, b] = line.points;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < EPS) return line;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const solve = (end: Vec2, dir: 1 | -1): Vec2 => {
      let best: { p: Vec2; s: number } | null = null;
      for (let k = 0; k < all.length; k++) {
        if (k === li) continue;
        const [p, q] = all[k];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const tLen = Math.hypot(dx, dy);
        if (tLen < EPS) continue;
        const den = ux * dy - uy * dx;
        if (Math.abs(den) < 0.2 * tLen) continue; // 거의 평행 (약 11° 미만)
        // end + u·s = p + d·w
        const s = ((p.x - end.x) * dy - (p.y - end.y) * dx) / den;
        const w = ((p.x - end.x) * uy - (p.y - end.y) * ux) / den;
        if (Math.abs(s) > tol) continue;
        if (w * tLen < -tol || (w - 1) * tLen > tol) continue;
        // 반대쪽 끝을 넘어서까지 줄이지 않는다
        if (s * dir < -(len - tol)) continue;
        if (!best || Math.abs(s) < Math.abs(best.s)) {
          best = { p: { x: end.x + ux * s, y: end.y + uy * s }, s };
        }
      }
      return best ? best.p : end;
    };
    const na = solve(a, -1);
    const nb = solve(b, 1);
    // 축 정렬 선은 교점 계산의 부동소수 오차로 축이 흔들리지 않게 고정한다
    if (Math.abs(a.y - b.y) < EPS) {
      na.y = a.y;
      nb.y = b.y;
    } else if (Math.abs(a.x - b.x) < EPS) {
      na.x = a.x;
      nb.x = b.x;
    }
    return { ...line, points: [na, nb] };
  });
}
