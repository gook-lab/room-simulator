import type { Plan } from './types';

/** 마지막 글자에 받침이 있으면 '을', 없으면 '를'. 한글로 끝나지 않으면 둘 다 적는다 */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 === 0 ? '를' : '을';
}

function quotedLabel(plan: Plan): string {
  const label = plan.floorLabel ?? plan.name;
  return `'${label}'${objectParticle(label)}`;
}

/** 층 삭제 확인 문구 — 층 이름만 보고 지우면 그 층의 벽 · 가구까지 사라진다는 걸 놓친다 */
export function floorDeleteConfirmText(plan: Plan): string {
  const walls = plan.walls.length;
  const furniture = plan.items.length + (plan.wallItems?.length ?? 0);
  const question = `${quotedLabel(plan)} 지울까요?`;
  if (walls === 0 && furniture === 0) return question;
  const contents =
    walls > 0 && furniture > 0
      ? `벽 ${walls}개와 가구 ${furniture}개`
      : walls > 0
        ? `벽 ${walls}개`
        : `가구 ${furniture}개`;
  return `${question}\n이 층의 ${contents}도 함께 사라져요.`;
}

export function floorDeletedText(plan: Plan): string {
  return `${quotedLabel(plan)} 지웠어요`;
}
