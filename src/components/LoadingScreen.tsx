import type { ReactNode } from 'react';

/**
 * 앱 안 로딩 · 오류 화면. index.html 시작 화면(#boot)과 같은 .boot 클래스를 써서
 * 시작 화면 → 공유 도면 여는 중 → 3D 준비 중이 같은 모양으로 이어진다(스타일은 index.html).
 */
export function LoadingScreen({
  message,
  failed = false,
  children,
}: {
  message: string;
  /** 실패 상태면 진행 막대를 숨기고 children(버튼)을 보여 준다 */
  failed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="boot boot--inline" data-state={failed ? 'failed' : 'loading'}>
      <div className="boot__card">
        <BrandGlyph className="boot__mark" />
        <p className="boot__name">Room Simulator</p>
        <p className="boot__msg" role={failed ? 'alert' : 'status'}>
          {message}
        </p>
        {!failed && (
          <div className="boot__bar" aria-hidden="true">
            <span />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** 브랜드 표식 — 초록 칸 안에 문이 달린 방 평면. index.html · public/404.html 과 같은 그림 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 22 22" aria-hidden="true">
      <rect width="22" height="22" rx="6" fill="var(--accent, #0e9f6e)" />
      <path
        d="M11 16.5h5.5v-11h-11v11H7.5M11 5.5v5M11 16.5V13M7.5 16.5a3.5 3.5 0 0 1 3.5-3.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
