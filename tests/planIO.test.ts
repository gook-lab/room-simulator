import { describe, expect, it } from 'vitest';
import {
  PLAN_EXPORT_FORMAT,
  PLAN_EXPORT_VERSION,
  exportPlan,
  importPlan,
} from '../src/model/planIO';
import { createSamplePlan } from '../src/model/samplePlan';
import { TEMPLATES } from '../src/model/templates';
import { setRoomFinish } from '../src/model/finishes';
import { toggleDoor, togglePower } from '../src/model/interactions3d';

describe('exportPlan', () => {
  it('format·version·exportedAt 포함', () => {
    const parsed = JSON.parse(exportPlan(createSamplePlan()));
    expect(parsed.format).toBe(PLAN_EXPORT_FORMAT);
    expect(parsed.version).toBe(PLAN_EXPORT_VERSION);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.plan.walls.length).toBeGreaterThan(0);
  });
});

describe('round-trip (내보내기 → 가져오기)', () => {
  it('샘플·템플릿 전부: id 외 모든 구조 보존', () => {
    const plans = [createSamplePlan(), ...TEMPLATES.map((t) => t.build())];
    for (const plan of plans) {
      const result = importPlan(exportPlan(plan));
      expect(result.ok, plan.name).toBe(true);
      if (!result.ok) continue;
      const { id: _a, updatedAt: _b, ...origRest } = plan;
      const { id: _c, updatedAt: _d, ...backRest } = result.plan;
      expect(backRest).toEqual(origRest);
      expect(result.plan.id).not.toBe(plan.id); // 새 문서 시맨틱
    }
  });

  it('확장 필드 보존: dimensions·finishes·powered·문 open 상태', () => {
    let plan = createSamplePlan();
    plan = setRoomFinish(plan, 'r-living', { floorFinish: 'herringbone', wallFinish: 'sage' });
    plan = togglePower(plan, 'i-lamp-floor'); // powered: false
    plan = toggleDoor(plan, 'o-door-bed'); // open: false
    plan = {
      ...plan,
      dimensions: [{ id: 'dim-1', a: { x: 0, y: 0 }, b: { x: 3.1, y: 0 } }],
    };
    const result = importPlan(exportPlan(plan));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = result.plan;
    expect(back.rooms.find((r) => r.id === 'r-living')!.floorFinish).toBe('herringbone');
    expect(back.rooms.find((r) => r.id === 'r-living')!.wallFinish).toBe('sage');
    expect(back.items.find((i) => i.id === 'i-lamp-floor')!.powered).toBe(false);
    expect(back.openings.find((o) => o.id === 'o-door-bed')!.open).toBe(false);
    expect(back.dimensions).toHaveLength(1);
  });
});

describe('importPlan 스키마 검증 (명확한 에러)', () => {
  const valid = () => JSON.parse(exportPlan(createSamplePlan()));

  it('JSON 아님', () => {
    const r = importPlan('not json{');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON');
  });

  it('format 불일치', () => {
    const r = importPlan(JSON.stringify({ format: 'other', version: 1, plan: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('룸 시뮬레이터');
  });

  it('미래 버전 거부', () => {
    const doc = valid();
    doc.version = PLAN_EXPORT_VERSION + 1;
    const r = importPlan(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('새로운 버전');
  });

  it('개구부 t 범위 밖 거부', () => {
    const doc = valid();
    doc.plan.openings[0].t = 1.5;
    const r = importPlan(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('개구부');
  });

  it('존재하지 않는 벽 참조 거부', () => {
    const doc = valid();
    doc.plan.openings[0].wallId = 'w-ghost';
    const r = importPlan(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('w-ghost');
  });

  it('가구 치수 0 이하 거부', () => {
    const doc = valid();
    doc.plan.items[0].size.w = 0;
    const r = importPlan(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('가구');
  });

  it('rooms 배열 아님 거부', () => {
    const doc = valid();
    doc.plan.rooms = 'oops';
    const r = importPlan(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('rooms');
  });
});
