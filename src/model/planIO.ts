import type { Plan, Vec2 } from './types';

/** 내보내기 포맷 버전 — 스키마 변경 시 올린다 */
export const PLAN_EXPORT_VERSION = 1;
export const PLAN_EXPORT_FORMAT = 'roomcast-plan';

export type PlanExport = {
  format: typeof PLAN_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  plan: Plan;
};

export function exportPlan(plan: Plan): string {
  const payload: PlanExport = {
    format: PLAN_EXPORT_FORMAT,
    version: PLAN_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    plan,
  };
  return JSON.stringify(payload, null, 2);
}

export type ImportResult = { ok: true; plan: Plan } | { ok: false; error: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isVec2 = (v: unknown): v is Vec2 =>
  v != null && typeof v === 'object' && isNum((v as Vec2).x) && isNum((v as Vec2).y);

/**
 * JSON 문자열 → Plan. 스키마 검증 실패 시 사람이 읽을 수 있는 에러를 돌려준다.
 * 성공 시 id 는 새로 발급 (기존 도면과의 충돌 방지 — 새 문서로 추가되는 시맨틱).
 */
export function importPlan(json: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON 파싱 실패 — 올바른 JSON 파일이 아닙니다.' };
  }
  const data = raw as Partial<PlanExport>;
  if (data?.format !== PLAN_EXPORT_FORMAT) {
    return { ok: false, error: `Roomcast 도면 파일이 아닙니다 (format: ${String(data?.format)})` };
  }
  if (!isNum(data.version) || data.version < 1) {
    return { ok: false, error: '버전 필드가 없거나 잘못되었습니다.' };
  }
  if (data.version > PLAN_EXPORT_VERSION) {
    return {
      ok: false,
      error: `이 파일은 더 새로운 버전(v${data.version})입니다 — 앱을 업데이트하세요 (지원: v${PLAN_EXPORT_VERSION}).`,
    };
  }
  const plan = data.plan as Plan | undefined;
  if (plan == null || typeof plan !== 'object') {
    return { ok: false, error: 'plan 객체가 없습니다.' };
  }
  if (!isStr(plan.name)) return { ok: false, error: 'plan.name 이 없습니다.' };
  if (!isNum(plan.unitScale) || plan.unitScale <= 0) {
    return { ok: false, error: 'plan.unitScale 이 잘못되었습니다.' };
  }
  for (const key of ['walls', 'openings', 'rooms', 'items'] as const) {
    if (!Array.isArray(plan[key])) {
      return { ok: false, error: `plan.${key} 가 배열이 아닙니다.` };
    }
  }
  for (const w of plan.walls) {
    if (!isStr(w.id) || !isVec2(w.a) || !isVec2(w.b) || !isNum(w.thickness) || !isNum(w.height)) {
      return { ok: false, error: `벽 데이터가 잘못되었습니다 (id: ${String(w?.id)})` };
    }
  }
  for (const o of plan.openings) {
    if (
      !isStr(o.id) ||
      !isStr(o.wallId) ||
      !isNum(o.t) ||
      o.t < 0 ||
      o.t > 1 ||
      !isNum(o.width) ||
      o.width <= 0 ||
      (o.kind !== 'door' && o.kind !== 'window') ||
      (o.doorType != null && o.doorType !== 'hinged' && o.doorType !== 'sliding')
    ) {
      return { ok: false, error: `개구부 데이터가 잘못되었습니다 (id: ${String(o?.id)})` };
    }
    if (!plan.walls.some((w) => w.id === o.wallId)) {
      return { ok: false, error: `개구부 ${o.id} 가 존재하지 않는 벽(${o.wallId})을 참조합니다.` };
    }
  }
  for (const r of plan.rooms) {
    if (
      !isStr(r.id) ||
      !isStr(r.name) ||
      !Array.isArray(r.polygon) ||
      r.polygon.length < 3 ||
      !r.polygon.every(isVec2) ||
      !isNum(r.areaSqm) ||
      !['living', 'kitchen', 'bath'].includes(r.floor)
    ) {
      return { ok: false, error: `룸 데이터가 잘못되었습니다 (id: ${String(r?.id)})` };
    }
  }
  for (const i of plan.items) {
    if (
      !isStr(i.id) ||
      !isStr(i.catalogId) ||
      !isVec2(i.position) ||
      !isNum(i.rotationDeg) ||
      i.size == null ||
      !isNum(i.size.w) ||
      !isNum(i.size.d) ||
      !isNum(i.size.h) ||
      i.size.w <= 0 ||
      i.size.d <= 0 ||
      i.size.h <= 0 ||
      !isNum(i.price)
    ) {
      return { ok: false, error: `가구 데이터가 잘못되었습니다 (id: ${String(i?.id)})` };
    }
  }
  if (plan.wallItems != null) {
    if (!Array.isArray(plan.wallItems)) {
      return { ok: false, error: 'plan.wallItems 가 배열이 아닙니다.' };
    }
    for (const wi of plan.wallItems) {
      if (
        !isStr(wi.id) ||
        !isStr(wi.catalogId) ||
        !isStr(wi.wallId) ||
        !isNum(wi.t) ||
        wi.t < 0 ||
        wi.t > 1 ||
        !isNum(wi.heightM) ||
        (wi.side !== 'front' && wi.side !== 'back') ||
        !isNum(wi.price)
      ) {
        return { ok: false, error: `벽 부착 아이템 데이터가 잘못되었습니다 (id: ${String(wi?.id)})` };
      }
      if (!plan.walls.some((w) => w.id === wi.wallId)) {
        return { ok: false, error: `벽 부착 아이템 ${wi.id} 가 존재하지 않는 벽(${wi.wallId})을 참조합니다.` };
      }
    }
  }
  if (plan.dimensions != null) {
    if (
      !Array.isArray(plan.dimensions) ||
      !plan.dimensions.every((d) => isStr(d.id) && isVec2(d.a) && isVec2(d.b))
    ) {
      return { ok: false, error: 'plan.dimensions 가 잘못되었습니다.' };
    }
  }
  // id 재발급 — "새 문서로 추가" 시맨틱, 기존 문서와 충돌 방지
  return {
    ok: true,
    plan: {
      ...plan,
      id: `plan-import-${Date.now().toString(36)}-${Math.floor(performance.now() % 1000)}`,
      updatedAt: new Date().toISOString(),
    },
  };
}
