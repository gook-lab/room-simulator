import { TopBar } from './components/TopBar';
import { useStore } from './state/store';
import { useUndoShortcut } from './state/useUndoShortcut';
import { Editor2D } from './features/editor2d/Editor2D';
import { Walkthrough } from './features/walkthrough/Walkthrough';
import { Birdseye } from './features/birdseye/Birdseye';
import { Dashboard } from './features/dashboard/Dashboard';
import { UploadTrace } from './features/upload/UploadTrace';

export default function App() {
  const screen = useStore((s) => s.screen);
  const view = useStore((s) => s.view);
  useUndoShortcut(); // 전역 Cmd+Z / Cmd+Shift+Z (모든 화면·3D 뷰 포함)

  if (screen === 'dashboard') return <Dashboard />;
  if (screen === 'upload') return <UploadTrace />;

  // editor: 워크스루/조감도는 상단바 없이 전체 뷰포트 (1d/1f)
  if (view === 'walkthrough') return <Walkthrough />;
  if (view === 'birdseye') return <Birdseye />;

  return (
    <div className="app">
      <TopBar />
      <main className="screen">
        <Editor2D />
      </main>
    </div>
  );
}
