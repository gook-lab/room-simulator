import type { Plan, Room, Vec2 } from '../../model/types';
import { catalogById } from '../../model/catalog';
import { itemAabb, pointInPolygon } from '../../model/geometry';
import { doorSwingBox } from './view';

/** 이 면적(㎡)을 넘는 방은 이름과 면적을 두 줄로 크게 쓴다 */
const BIG_ROOM_SQM = 14;
const PAD_X = 6;

export type RoomLabelSpec = {
  /** big: 이름 17px + 면적 12px 두 줄 · line: 한 줄 12px · stack: 이름 12px + 면적 11px 두 줄 */
  kind: 'big' | 'line' | 'stack';
  /** big · stack 은 [이름, 면적], line 은 한 줄 */
  lines: string[];
  wPx: number;
  hPx: number;
};

type Box = { min: Vec2; max: Vec2 };

/**
 * 글자 폭 근사 (px). 측정 API 가 없는 내보내기 · 테스트에서도 같은 배치를 내야 해서
 * 글꼴 비율로 어림한다. 한글 · ㎡ 는 1em, 숫자 · 라틴은 0.62em, 점 · 공백은 0.32em.
 */
export function textWidthPx(text: string, fontPx: number): number {
  let em = 0;
  for (const ch of text) {
    if (/[\u1100-\u11ff\u3130-\u33ff\uac00-\ud7a3]/.test(ch)) em += 1;
    else if (ch === ' ' || ch === '.' || ch === '·') em += 0.32;
    else em += 0.62;
  }
  return em * fontPx;
}

/** 기본 모양 (큰 방은 두 줄, 작은 방은 한 줄) */
export function roomLabelSpec(room: Room): RoomLabelSpec {
  const area = `${room.areaSqm.toFixed(1)}㎡`;
  if (room.areaSqm > BIG_ROOM_SQM) {
    return {
      kind: 'big',
      lines: [room.name, area],
      wPx: Math.max(textWidthPx(room.name, 17), textWidthPx(area, 12)) + PAD_X * 2,
      hPx: 42,
    };
  }
  const line = `${room.name} · ${area}`;
  return { kind: 'line', lines: [line], wPx: textWidthPx(line, 12) + PAD_X * 2, hPx: 22 };
}

/** 가구 사이 좁은 틈에 들어가는 좁은 두 줄 모양 */
function compactSpec(room: Room): RoomLabelSpec {
  const area = `${room.areaSqm.toFixed(1)}㎡`;
  return {
    kind: 'stack',
    lines: [room.name, area],
    wPx: Math.max(textWidthPx(room.name, 12), textWidthPx(area, 11)) + PAD_X * 2,
    hPx: 34,
  };
}

export type RoomLabelPlacement = { at: Vec2; spec: RoomLabelSpec };

/** 넓이 중심. 꺾인 방은 꼭짓점 평균보다 이쪽이 방 몸통에 가깝다 */
function areaCentroid(poly: Vec2[]): Vec2 {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    x += (p.x + q.x) * cross;
    y += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: x / (3 * a), y: y / (3 * a) };
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const h = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function boxInside(box: Box, poly: Vec2[]): boolean {
  const { min, max } = box;
  return [
    min,
    max,
    { x: min.x, y: max.y },
    { x: max.x, y: min.y },
    { x: (min.x + max.x) / 2, y: min.y },
    { x: (min.x + max.x) / 2, y: max.y },
  ].every((p) => pointInPolygon(p, poly));
}

/**
 * 방 이름표 자리 (world 중심점) 와 모양. 가구 위에 그리면 면적 글자가 묻혀서(QA B-07),
 * 방 안에서 넓이 중심과 가까운 순으로 가구 · 러그 · 문 호를 피하는 자리를 찾는다.
 * 기본 모양 → 좁은 두 줄 모양 순으로, 1) 다 피하는 자리 2) 러그 · 문 호는 덮어도 되는 자리를
 * 찾고, 없으면 기본 모양으로 가구와 가장 덜 겹치는 자리에 둔다.
 * pxPerM 이 바뀌면 이름표의 world 크기가 바뀌므로 확대할 때마다 다시 잡는다.
 */
export function layoutRoomLabels(plan: Plan, pxPerM: number): Map<string, RoomLabelPlacement> {
  const hard: Box[] = [];
  const soft: Box[] = [];
  for (const it of plan.items) {
    if (it.parentId) continue; // 상판 위 소품은 부모 상자 안에 있다
    const cat = catalogById.get(it.catalogId);
    (cat?.category === 'rug' ? soft : hard).push(itemAabb(it));
  }
  for (const o of plan.openings) {
    const b = doorSwingBox(plan, o);
    if (b) soft.push(b);
  }

  const out = new Map<string, RoomLabelPlacement>();
  const gap = 3 / pxPerM;
  const wallMargin = 0.08;
  for (const room of plan.rooms) {
    const poly = room.polygon;
    if (poly.length < 3) continue;
    const centroid = areaCentroid(poly);
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const roomBox: Box = { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
    const near = (boxes: Box[]) => boxes.filter((b) => overlapArea(b, roomBox) > 0);
    const hardHere = near(hard);
    const softHere = near(soft);
    const d2 = (p: Vec2) => (p.x - centroid.x) ** 2 + (p.y - centroid.y) ** 2;
    // 후보 수를 방마다 수백 개로 묶는다 — 끌기 중에는 매 프레임 다시 잡는다
    const minStep = Math.sqrt(((roomBox.max.x - roomBox.min.x) * (roomBox.max.y - roomBox.min.y)) / 300);

    const tryShape = (spec: RoomLabelSpec) => {
      const hw = spec.wPx / 2 / pxPerM;
      const hh = spec.hPx / 2 / pxPerM;
      const boxAt = (c: Vec2, pad: number): Box => ({
        min: { x: c.x - hw - pad, y: c.y - hh - pad },
        max: { x: c.x + hw + pad, y: c.y + hh + pad },
      });
      const step = Math.max(0.06, minStep, Math.min(hw, hh) / 2);
      const candidates: Vec2[] = [centroid];
      for (let x = roomBox.min.x + hw; x <= roomBox.max.x - hw + 1e-9; x += step) {
        for (let y = roomBox.min.y + hh; y <= roomBox.max.y - hh + 1e-9; y += step) {
          candidates.push({ x, y });
        }
      }
      candidates.sort((a, b) => d2(a) - d2(b));
      const fits = candidates.filter((c) => boxInside(boxAt(c, wallMargin), poly));
      const clearOf = (c: Vec2, boxes: Box[]) => {
        const box = boxAt(c, gap);
        return boxes.every((b) => overlapArea(box, b) === 0);
      };
      const clear =
        fits.find((c) => clearOf(c, hardHere) && clearOf(c, softHere)) ?? fits.find((c) => clearOf(c, hardHere));
      const leastBad = () =>
        fits
          .map((c) => {
            const box = boxAt(c, gap);
            return { c, cost: hardHere.reduce((s, b) => s + overlapArea(box, b), 0) };
          })
          .sort((a, b) => a.cost - b.cost)[0]?.c;
      return { clear, leastBad };
    };

    const primary = roomLabelSpec(room);
    const a = tryShape(primary);
    if (a.clear) {
      out.set(room.id, { at: a.clear, spec: primary });
      continue;
    }
    const compact = compactSpec(room);
    const b = tryShape(compact);
    if (b.clear) {
      out.set(room.id, { at: b.clear, spec: compact });
      continue;
    }
    const aBad = a.leastBad();
    const bBad = aBad ? undefined : b.leastBad();
    out.set(room.id, { at: aBad ?? bBad ?? centroid, spec: aBad || !bBad ? primary : compact });
  }
  return out;
}
