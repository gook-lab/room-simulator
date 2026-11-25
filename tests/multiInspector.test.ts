import { describe, expect, it } from 'vitest';
import { inspectorKind, selectionSummary } from '../src/features/editor2d/panels';
import { createSamplePlan } from '../src/model/samplePlan';

describe('인스펙터 종류 — 다중 선택도 패널이 뜬다 (QA B-14)', () => {
  const plan = createSamplePlan();
  const [a, b] = plan.items;
  const door = plan.openings.find((o) => o.kind === 'door')!;

  it('가구 2개 이상이면 다중 선택 패널', () => {
    expect(inspectorKind(plan, [a.id, b.id])).toBe('multi');
    expect(selectionSummary(plan, [a.id, b.id])).toBe('가구 2');
  });

  it('가구 · 문 · 벽이 섞여도 다중 선택 패널, 요약에 종류별 개수', () => {
    const sel = [a.id, door.id, plan.walls[0].id];
    expect(inspectorKind(plan, sel)).toBe('multi');
    expect(selectionSummary(plan, sel)).toBe('가구 1 · 벽 1 · 문 1');
  });

  it('벽만 고르면 벽 일괄 편집 패널은 그대로', () => {
    expect(inspectorKind(plan, [plan.walls[0].id, plan.walls[1].id])).toBe('walls');
  });

  it('하나만 고르면 종류별 패널, 아무것도 없으면 패널 없음 (카탈로그 목록이 펴진다)', () => {
    expect(inspectorKind(plan, [a.id])).toBe('item');
    expect(inspectorKind(plan, [door.id])).toBe('opening');
    expect(inspectorKind(plan, [plan.rooms[0].id])).toBe('room');
    expect(inspectorKind(plan, [])).toBeNull();
    expect(inspectorKind(plan, ['없는-id'])).toBeNull();
  });
});
