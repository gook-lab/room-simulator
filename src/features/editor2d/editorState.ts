import type { Plan } from '../../model/types';
import { roomConnectivity } from '../../model/roomConnectivity';

/** 손댈 것이 없는 도면 — 벽 · 가구 · 밑그림이 하나도 없다. 빈 도면 안내 카드 조건 */
export function isEmptyPlan(plan: Plan): boolean {
  return plan.walls.length === 0 && plan.items.length === 0 && !plan.tracing;
}

export type InspectorKind = 'walls' | 'multi' | 'item' | 'opening' | 'wallItem' | 'room';

/** 선택에 맞는 인스펙터 종류. 인스펙터가 뜨면 카탈로그 목록을 접는다 (디자인 B-6) */
export function inspectorKind(plan: Plan, selection: string[]): InspectorKind | null {
  if (selection.length === 0) return null;
  const has = (list: { id: string }[]) => (id: string) => list.some((x) => x.id === id);
  if (selection.every(has(plan.walls))) return 'walls';
  if (selection.length >= 2) return 'multi';
  const id = selection[0];
  if (has(plan.items)(id)) return 'item';
  if (has(plan.openings)(id)) return 'opening';
  if (has(plan.wallItems ?? [])(id)) return 'wallItem';
  if (has(plan.rooms)(id)) return 'room';
  return null;
}

/** 다중 선택 요약 — "가구 3 · 문 1" */
export function selectionSummary(plan: Plan, selection: string[]): string {
  const count = (list: { id: string }[]) => list.filter((x) => selection.includes(x.id)).length;
  const doors = plan.openings.filter((o) => o.kind === 'door' && selection.includes(o.id)).length;
  const windows = plan.openings.filter((o) => o.kind === 'window' && selection.includes(o.id)).length;
  return [
    ['가구', count(plan.items) + count(plan.wallItems ?? [])],
    ['벽', count(plan.walls)],
    ['문', doors],
    ['창', windows],
    ['방', count(plan.rooms)],
    ['치수', count(plan.dimensions ?? [])],
  ]
    .filter(([, n]) => (n as number) > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(' · ');
}


/**
 * 문 · 통로로 어느 방과도 이어지지 않은 방 (기획 후보 7). 업로드 인식은 문을 못 찾는 일이 많아
 * 워크스루에서 방에 못 들어가므로 "문이 없는 방 N개" 칩으로 알린다.
 */
export function isolatedRoomIds(plan: Plan): string[] {
  return roomConnectivity(plan).isolatedRoomIds;
}
