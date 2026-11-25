import { createSamplePlan, createStudyPlan } from '../../model/samplePlan';

/** 처음 열면 들어 있는 견본 문서 */
const BUILT_IN_IDS = new Set([createSamplePlan().id, createStudyPlan().id]);

/** 내가 만든 문서가 하나도 없으면 첫 방문으로 본다 — 기존 사용자 화면은 그대로 둔다 */
export function isFirstVisit(planOrder: string[]): boolean {
  return planOrder.every((id) => BUILT_IN_IDS.has(id));
}
