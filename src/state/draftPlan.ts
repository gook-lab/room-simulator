import type { Plan } from '../model/types';
import type { PersistShape } from './persistence';

/**
 * "빈 도면에서 시작"으로 만든 문서는 첫 편집 전까지 초안이다 (QA B-13).
 * 저장 스냅샷에서 빼서 탭을 닫아도 남지 않고, 손대지 않은 채 나가면 메모리에서도 지운다.
 * 저장본에 없던 문서라 병합 가드(persistence.mergeLostPlans)가 되살릴 일도 없다.
 */

/** 저장 스냅샷에서 초안 문서를 뺀다 */
export function withoutDraft(shape: PersistShape, draftId: string | null): PersistShape {
  if (!draftId || !shape.plans[draftId]) return shape;
  const plans = { ...shape.plans };
  delete plans[draftId];
  return { plans, planOrder: shape.planOrder.filter((id) => id !== draftId) };
}

type DocState = {
  plans: Record<string, Plan>;
  planOrder: string[];
  currentPlanId: string;
  draftPlanId: string | null;
};

/**
 * 손대지 않은 초안을 버린 상태. 초안이 없으면 null.
 * 지운 문서가 현재 문서였으면 목록 맨 앞 문서를 현재 문서로 둔다.
 */
export function discardDraft(s: DocState): DocState | null {
  const id = s.draftPlanId;
  if (!id) return null;
  const keep = { plans: s.plans, planOrder: s.planOrder, currentPlanId: s.currentPlanId, draftPlanId: null };
  if (!s.plans[id]) return keep;
  const plans = { ...s.plans };
  delete plans[id];
  const planOrder = s.planOrder.filter((p) => p !== id);
  if (planOrder.length === 0) return keep; // 마지막 문서는 남긴다
  const currentPlanId = s.currentPlanId === id ? planOrder[0] : s.currentPlanId;
  return { plans, planOrder, currentPlanId, draftPlanId: null };
}
