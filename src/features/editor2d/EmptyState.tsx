import type { Plan, Tool } from '../../model/types';
import { isEmptyPlan } from './editorState';

/**
 * 빈 도면 안내 (디자인 B-4 · QA B-12). 첫 벽이 생기면 사라진다.
 * 선 그리기를 고른 뒤에는 카드가 캔버스 가운데를 막지 않게 위쪽 안내 칩으로 줄인다.
 */
export function EmptyState({
  plan,
  tool,
  onDraw,
  onPickTemplate,
}: {
  plan: Plan;
  tool: Tool;
  onDraw: () => void;
  onPickTemplate: () => void;
}) {
  if (!isEmptyPlan(plan)) return null;
  if (tool === 'wall') {
    return (
      <div className="empty-state empty-state--hint" role="status">
        빈 곳을 눌러 점을 찍어 보세요. 첫 점을 다시 누르면 방이 만들어져요
      </div>
    );
  }
  // 층 문서는 템플릿으로 바꿀 수 없어 그리기만 권한다
  const isFloor = plan.buildingId != null;
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <h2 id="empty-state-title" className="empty-state__title">
        벽부터 그려 볼까요?
      </h2>
      <p className="empty-state__desc">
        방 둘레를 따라 점을 찍으면 벽이 생겨요.
        {!isFloor && ' 처음이면 템플릿에서 시작해도 좋아요.'}
      </p>
      <div className="empty-state__actions">
        <button type="button" className="btn btn--primary" onClick={onDraw}>
          선 그리기 <kbd>S</kbd>
        </button>
        {!isFloor && (
          <button type="button" className="btn btn--outline" onClick={onPickTemplate}>
            템플릿 고르기
          </button>
        )}
      </div>
    </section>
  );
}
