import { Component, type ReactNode } from 'react';

/**
 * WebGL 컨텍스트 생성 실패(가상화/헤드리스 환경 등) 시 앱 전체가 죽지 않도록
 * 3D Canvas만 폴백으로 대체한다.
 */
export class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--hud-text-2)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          3D 뷰를 사용할 수 없습니다 — WebGL을 지원하는 브라우저가 필요합니다.
        </div>
      );
    }
    return this.props.children;
  }
}
