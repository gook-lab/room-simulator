import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TopBar } from './components/TopBar';
import { useStore } from './state/store';
import { useUndoShortcut } from './state/useUndoShortcut';
import { Editor2D } from './features/editor2d/Editor2D';
import { Walkthrough } from './features/walkthrough/Walkthrough';
import { Birdseye } from './features/birdseye/Birdseye';
import { Dashboard } from './features/dashboard/Dashboard';
import { UploadTrace } from './features/upload/UploadTrace';
import { SharedViewBar } from './features/share/SharedViewBar';
import { AppToast } from './features/share/AppToast';
import { isShareHash, readShareHash } from './model/shareLink';
import type { Screen, View } from './model/types';
import './features/share/share.css';

function clearShareHash() {
  if (isShareHash(window.location.hash)) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** 주소의 공유 링크(#share=…)를 읽어 보기 전용으로 연다. 열어 보는 동안 true. */
function useShareHash(): boolean {
  const openShared = useStore((s) => s.openShared);
  const navigate = useStore((s) => s.navigate);
  const showToast = useStore((s) => s.showToast);
  const [opening, setOpening] = useState(() => isShareHash(window.location.hash));

  useEffect(() => {
    let seq = 0;
    const open = async () => {
      const hash = window.location.hash;
      if (!isShareHash(hash)) return;
      const mine = ++seq;
      setOpening(true);
      const result = await readShareHash(hash);
      if (mine !== seq) return; // 그사이 다른 링크가 들어옴
      setOpening(false);
      if (result.ok) {
        openShared(result.bundle);
        return;
      }
      clearShareHash();
      navigate('dashboard');
      showToast(result.message, result.detail);
    };
    void open();
    window.addEventListener('hashchange', open);
    return () => {
      seq++;
      window.removeEventListener('hashchange', open);
    };
  }, [openShared, navigate, showToast]);

  // 공유 보기를 닫거나 내 도면으로 복사하면 해시를 지운다 — 새로고침이 보기를 다시 열지 않게
  const shared = useStore((s) => s.sharedView != null);
  const wasShared = useRef(shared);
  useEffect(() => {
    if (wasShared.current && !shared) clearShareHash();
    wasShared.current = shared;
  }, [shared]);

  return opening;
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const view = useStore((s) => s.view);
  const shared = useStore((s) => s.sharedView != null);
  useUndoShortcut(); // 전역 Cmd+Z / Cmd+Shift+Z (모든 화면·3D 뷰 포함)
  const openingShare = useShareHash();

  return (
    <>
      {openingShare ? (
        <div className="share-opening">공유받은 도면을 여는 중이에요</div>
      ) : (
        <CurrentScreen screen={screen} view={view} shared={shared} />
      )}
      <AppToast />
    </>
  );
}

function CurrentScreen({
  screen,
  view,
  shared,
}: {
  screen: Screen;
  view: View;
  shared: boolean;
}): ReactNode {
  if (screen === 'dashboard') return <Dashboard />;
  if (screen === 'upload') return <UploadTrace />;

  // editor: 워크스루/조감도는 상단바 없이 전체 뷰포트 (1d/1f)
  if (view === 'walkthrough' || view === 'birdseye') {
    const viewer = view === 'walkthrough' ? <Walkthrough /> : <Birdseye />;
    if (!shared) return viewer;
    return (
      <div className="shared-frame">
        <SharedViewBar />
        {viewer}
      </div>
    );
  }

  return (
    <div className={`app${shared ? ' is-shared' : ''}`}>
      {shared && <SharedViewBar />}
      <TopBar />
      <main className="screen">
        <Editor2D />
      </main>
    </div>
  );
}
