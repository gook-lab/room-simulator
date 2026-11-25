import { Component, type ReactNode } from 'react';

type Tone = 'dark' | 'light';

/** WebGL 을 못 쓰는 환경에서 3D 캔버스 자리에 띄우는 안내 카드 */
export function GlFallback({ tone, onBack }: { tone: Tone; onBack?: () => void }) {
  return (
    <div className={`gl-fallback gl-fallback--${tone}`}>
      <div className="gl-fallback__card" role="status">
        <p className="gl-fallback__title">이 브라우저에선 3D를 볼 수 없어요</p>
        <p className="gl-fallback__desc">최신 Chrome · Safari로 열어 주세요.</p>
        {onBack && (
          <button type="button" className="btn btn--primary" onClick={onBack}>
            평면도로 돌아가기
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * WebGL 컨텍스트 생성 실패(가상화/헤드리스 환경 등) 시 앱 전체가 죽지 않도록
 * 3D Canvas만 폴백으로 대체한다. onFail 로 부모가 3D 전용 HUD 를 걷어 낼 수 있다.
 */
export class CanvasBoundary extends Component<
  { children: ReactNode; tone?: Tone; onFail?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail?.();
  }

  render() {
    if (this.state.failed) {
      return <GlFallback tone={this.props.tone ?? 'dark'} />;
    }
    return this.props.children;
  }
}
