import { useEffect } from 'react';
import { useStore } from './store';

/**
 * 전역 Cmd+Z / Cmd+Shift+Z — 2D 에디터뿐 아니라 워크스루·조감도에서도 동작.
 * (포인터 락 중에도 keydown은 전달된다. 3D의 E-편집 소재 변경도 updatePlan
 * commit 경로라 명령 단위로 되돌려진다.)
 * App에서 한 번만 마운트할 것 — 화면별 핸들러에 중복 등록 금지.
 */
export function useUndoShortcut() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
}
