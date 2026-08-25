import { useEffect, useState } from 'react';
import { timeAgoLabel, useCurrentPlan, useStore } from '../state/store';
import { ViewTabs } from './ViewTabs';

/** 층 탭 — 같은 buildingId 문서 묶음 전환 + 추가/이름변경/복제/삭제 */
function FloorTabs() {
  const plan = useCurrentPlan();
  const plans = useStore((s) => s.plans);
  const planOrder = useStore((s) => s.planOrder);
  const openPlan = useStore((s) => s.openPlan);
  const addFloor = useStore((s) => s.addFloor);
  const renameFloor = useStore((s) => s.renameFloor);
  const deleteFloor = useStore((s) => s.deleteFloor);

  const floors = plan.buildingId
    ? [...planOrder]
        .map((id) => plans[id])
        .filter((p) => p && p.buildingId === plan.buildingId)
        .sort((a, b) => (a.floorLabel ?? '').localeCompare(b.floorLabel ?? '', 'ko', { numeric: true }))
    : [plan];

  return (
    <div className="floor-tabs">
      {floors.map((f) => (
        <button
          key={f.id}
          className={`floor-tab${f.id === plan.id ? ' is-active' : ''}`}
          title={f.id === plan.id ? '더블클릭 — 층 이름 변경' : `${f.floorLabel ?? f.name} 열기`}
          onClick={() => f.id !== plan.id && openPlan(f.id)}
          onDoubleClick={() => {
            const label = window.prompt('층 이름', f.floorLabel ?? '1층');
            if (label) renameFloor(f.id, label);
          }}
        >
          {f.floorLabel ?? (plan.buildingId ? '1층' : '단층')}
          {f.id === plan.id && floors.length > 1 && (
            <span
              className="floor-tab__close"
              title="이 층 삭제"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`'${f.floorLabel ?? f.name}' 층을 삭제할까요?`)) {
                  deleteFloor(f.id);
                }
              }}
            >
              ✕
            </span>
          )}
        </button>
      ))}
      <button className="floor-tab floor-tab--add" title="새 층 추가" onClick={() => addFloor('empty')}>
        +
      </button>
      <button
        className="floor-tab floor-tab--add"
        title="현재 층 복제해 추가"
        onClick={() => addFloor('duplicate')}
      >
        ⧉
      </button>
    </div>
  );
}

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
        <FloorTabs />
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
