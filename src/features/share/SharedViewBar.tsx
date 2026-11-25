import { useStore } from '../../state/store';

/** 공유 링크 보기 안내 — 2D · 조감도 · 워크스루 모두 화면 맨 위에 붙는다 */
export function SharedViewBar() {
  const copySharedToMine = useStore((s) => s.copySharedToMine);
  const navigate = useStore((s) => s.navigate);
  const showToast = useStore((s) => s.showToast);

  return (
    <div className="shared-bar" role="region" aria-label="공유받은 도면">
      <span className="shared-bar__badge">보기 전용</span>
      <span className="shared-bar__text">
        공유받은 도면이에요. 고치려면 내 도면으로 복사해 주세요.
      </span>
      <button
        className="btn btn--primary shared-bar__copy"
        onClick={() => {
          copySharedToMine();
          showToast('내 도면에 담았어요', '이제 마음껏 고칠 수 있어요.');
        }}
      >
        내 도면으로 복사
      </button>
      <button className="shared-bar__leave" onClick={() => navigate('dashboard')}>
        나가기
      </button>
    </div>
  );
}
