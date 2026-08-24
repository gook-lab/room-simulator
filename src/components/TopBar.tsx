import { useEffect, useState } from 'react';
import { timeAgoLabel, useCurrentPlan, useStore } from '../state/store';
import { ViewTabs } from './ViewTabs';

export function TopBar() {
  const plan = useCurrentPlan();
  const savedAt = useStore((s) => s.savedAt);
  const navigate = useStore((s) => s.navigate);
  const [, forceTick] = useState(0);

  // "N분 전 저장" 갱신용 타이머
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const area = plan.rooms.reduce((s, r) => s + r.areaSqm, 0);

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          className="brand"
          onClick={() => navigate('dashboard')}
          title="대시보드로"
        >
          <span className="brand__mark" />
          <span className="brand__word">Roomcast</span>
        </button>
        <span className="topbar__divider" />
        <span className="topbar__project">{plan.name}</span>
        <span className="topbar__meta">
          {Math.round(area)}㎡ · {timeAgoLabel(savedAt)}
        </span>
      </div>

      <ViewTabs />

      <div className="topbar__right">
        <button className="btn btn--outline">공유</button>
        <button className="btn btn--primary" onClick={() => navigate('dashboard')}>
          견적 보기
        </button>
      </div>
    </header>
  );
}
