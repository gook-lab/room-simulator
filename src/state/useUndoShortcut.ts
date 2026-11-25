import { useEffect } from 'react';
import { useStore } from './store';

type UndoKey = Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'key' | 'target'> & {
  preventDefault: () => void;
};

/**
 * Cmd+Z / Cmd+Shift+Z 한 번을 처리한다. 도면을 보여 주는 에디터 화면(2D · 워크스루 ·
 * 조감도)에서만 되돌린다 — 대시보드 · 업로드에서는 안 보이는 도면의 편집을 조용히
 * 되돌리게 된다.
 */
export function handleUndoKey(e: UndoKey): void {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
  const tag = (e.target as { tagName?: string } | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const { screen, undo, redo } = useStore.getState();
  if (screen !== 'editor') return;
  e.preventDefault();
  if (e.shiftKey) redo();
  else undo();
}

/**
 * 전역 Cmd+Z / Cmd+Shift+Z — 2D 에디터뿐 아니라 워크스루·조감도에서도 동작.
 * (포인터 락 중에도 keydown은 전달된다. 3D의 E-편집 소재 변경도 updatePlan
 * commit 경로라 명령 단위로 되돌려진다.)
 * App에서 한 번만 마운트할 것 — 화면별 핸들러에 중복 등록 금지.
 */
export function useUndoShortcut() {
  useEffect(() => {
    window.addEventListener('keydown', handleUndoKey);
    return () => window.removeEventListener('keydown', handleUndoKey);
  }, []);
}
