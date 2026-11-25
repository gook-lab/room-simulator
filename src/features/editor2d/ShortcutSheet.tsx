import { useEffect, useRef } from 'react';
import { currentPlatform, isApplePlatform, sheetKeyAction, shortcutGroups } from './shortcuts';

type Focusable = { focus: () => void; isConnected?: boolean };

/**
 * 시트를 연 순간 포커스가 있던 곳을 기억했다가 닫을 때 돌려준다.
 * 키보드로 연 사람이 닫은 뒤 처음 자리부터 다시 탭하지 않게 한다.
 */
export function rememberFocus(active: Focusable | null | undefined): () => void {
  return () => {
    if (active && active.isConnected !== false) active.focus();
  };
}

/** 단축키 목록 — `?` 키 · 상태바 `?` 버튼으로 열고 Esc 로 닫는다 */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = shortcutGroups(isApplePlatform(currentPlatform()));

  useEffect(() => {
    const restore = rememberFocus(document.activeElement as HTMLElement | null);
    closeRef.current?.focus();
    // 캡처 단계에서 받아 뒤 캔버스의 도구 단축키 · 실행 취소가 눌리지 않게 막는다
    const onKey = (e: KeyboardEvent) => {
      const action = sheetKeyAction(true, e);
      if (action === 'pass') return;
      e.preventDefault();
      e.stopPropagation();
      if (action === 'close') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restore();
    };
  }, [onClose]);

  return (
    <div className="shortcut-sheet" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className="shortcut-sheet__card scroll-y"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-sheet-title"
      >
        <header className="shortcut-sheet__head">
          <h2 id="shortcut-sheet-title">단축키</h2>
          <button ref={closeRef} type="button" className="btn btn--outline" onClick={onClose}>
            닫기 <kbd>Esc</kbd>
          </button>
        </header>
        <div className="shortcut-sheet__groups">
          {groups.map((g) => (
            <div key={g.title} className="shortcut-sheet__group">
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map((r) => (
                  <div key={r.label} className="shortcut-sheet__row">
                    <dt>
                      {r.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </dt>
                    <dd>{r.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
