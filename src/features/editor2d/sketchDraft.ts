import type { Plan, Vec2 } from '../../model/types';

/**
 * 선 그리기(S) 드래프트 — 프로그레시브 커밋 방식의 상태.
 * 각 세그먼트는 클릭 즉시 plan.walls 에 커밋되어 선 단위 undo 스택이 쌓이고,
 * 드래프트는 앵커(첫 점)+커밋된 벽 id 목록만 유지한다.
 */
export type SketchDraft = { anchor: Vec2; wallIds: string[]; cursor: Vec2 | null };

/**
 * 드래프트 미리보기 점열 — 앵커 + 살아있는(undo 안 된) 커밋 세그먼트 끝점.
 * undo 로 마지막 세그먼트가 제거되면 그 지점부터 이어그리기가 되도록
 * plan 에서 파생한다 (redo 로 돌아오면 자동 복원).
 */
export function sketchDraftPoints(
  plan: Plan,
  draft: { anchor: Vec2; wallIds: string[] },
): Vec2[] {
  const pts = [draft.anchor];
  for (const id of draft.wallIds) {
    const w = plan.walls.find((x) => x.id === id);
    if (!w) break; // undo 로 제거된 세그먼트 이후는 무효
    pts.push(w.b);
  }
  return pts;
}
