import { Component, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { LoadingScreen } from './LoadingScreen';

/**
 * 3D 화면 코드를 받지 못했을 때(망 끊김 · 배포 교체로 옛 청크가 사라짐) 앱 전체가 하얘지지 않게
 * 그 자리만 안내로 바꾼다. 다시 불러오기(새로고침)는 저장 전 편집을 잃을 수 있어 두지 않는다.
 */
export class ViewLoadBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <LoadingScreen failed message="3D 화면을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.">
        <div className="boot__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              this.setState({ failed: false });
              this.props.onRetry();
            }}
          >
            다시 시도
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => useStore.getState().setView('2d')}
          >
            평면도로 돌아가기
          </button>
        </div>
      </LoadingScreen>
    );
  }
}
