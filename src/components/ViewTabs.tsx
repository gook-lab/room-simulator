import { useStore } from '../state/store';
import type { View } from '../model/types';

const TABS: { view: View; label: string }[] = [
  { view: '2d', label: '평면도' },
  { view: 'walkthrough', label: '3D 워크스루' },
  { view: 'birdseye', label: '조감도' },
];

export function ViewTabs({ dark = false }: { dark?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <div className={`viewtabs${dark ? ' viewtabs--dark' : ''}`} role="tablist">
      {TABS.map((t) => (
        <button
          key={t.view}
          role="tab"
          aria-selected={view === t.view}
          className={`viewtabs__tab${view === t.view ? ' is-active' : ''}`}
          onClick={() => setView(t.view)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
