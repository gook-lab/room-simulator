import type { Plan } from '../../model/types';

/** 만 원 단위 금액. 카드처럼 좁은 자리에 쓰는 대략값이에요. */
export function formatManwon(won: number): string {
  if (won <= 0) return '0원';
  const man = Math.round(won / 10_000);
  if (man < 1) return '1만 원 미만';
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (eok === 0) return `${man.toLocaleString('ko-KR')}만 원`;
  return rest === 0 ? `${eok}억 원` : `${eok}억 ${rest.toLocaleString('ko-KR')}만 원`;
}

/**
 * 도면 카드 메타 줄 — 면적 · 가구 수 · 금액(가구가 없으면 "가구 없음").
 * 금액은 쇼핑 리스트 패널의 "추정 포함 합계"와 같은 값이라 같은 말로 짚는다.
 */
export function planCardMeta(areaSqm: number, itemCount: number, totalWon: number): string {
  const area = `${Math.round(areaSqm)}㎡`;
  if (totalWon <= 0) return itemCount === 0 ? `${area} · 가구 없음` : `${area} · 가구 ${itemCount}개`;
  return `${area} · 가구 ${itemCount}개 · 추정 포함 약 ${formatManwon(totalWon)}`;
}

/**
 * 대시보드가 "작업 중"으로 짚는 도면 — 오른쪽 라이브러리 패널과 같은 도면이어야 한다.
 * 마지막으로 연 도면이 지워졌으면 목록 첫 도면으로 물러난다.
 */
export function workingPlan(
  plans: Record<string, Plan>,
  orderedPlans: Plan[],
  currentPlanId: string,
): Plan | undefined {
  return plans[currentPlanId] ?? orderedPlans[0];
}
