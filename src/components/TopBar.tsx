import { useEffect, useRef, useState } from 'react';
import { timeAgoLabel, useCurrentPlan, useStore } from '../state/store';
import { ViewTabs } from './ViewTabs';
import { floorsOfBuilding } from '../model/floorStack';
import { floorDeleteConfirmText, floorDeletedText } from '../model/floorDelete';
import type { Plan } from '../model/types';

/** 층 탭 — 같은 buildingId 문서 묶음 전환 + 추가/이름변경/복제/삭제 */
function FloorTabs() {
  const plan = useCurrentPlan();
  const plans = useStore((s) => s.plans);
  const openPlan = useStore((s) => s.openPlan);
  const addFloor = useStore((s) => s.addFloor);
  const renameFloor = useStore((s) => s.renameFloor);
  const deleteFloor = useStore((s) => s.deleteFloor);
  const restoreFloor = useStore((s) => s.restoreFloor);
  // 층 문서는 층마다 undo 기록이 따로라 Cmd+Z 로는 못 살린다 — 대시보드 삭제처럼 알림으로 되살린다
  const [deleted, setDeleted] = useState<{ plan: Plan; index: number } | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    },
    [],
  );

  const floors = floorsOfBuilding(plans, plan);

  const removeFloor = (f: Plan) => {
    if (!window.confirm(floorDeleteConfirmText(f))) return;
    const index = useStore.getState().planOrder.indexOf(f.id);
    deleteFloor(f.id);
    setDeleted({ plan: f, index });
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = setTimeout(() => setDeleted(null), 6000);
  };

  const undoDelete = () => {
    if (!deleted) return;
    restoreFloor(deleted.plan, deleted.index);
    setDeleted(null);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
  };

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
                removeFloor(f);
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
      {deleted && (
        <div className="snackbar" role="status">
          {floorDeletedText(deleted.plan)}
          <button onClick={undoDelete}>되돌리기</button>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const plan = useCurrentPlan();
  const savedAt = useStore((s) => s.savedAt);
  const saveError = useStore((s) => s.saveError);
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
          <span className="brand__word">Room Simulator</span>
        </button>
        <span className="topbar__divider" />
        <span className="topbar__project">{plan.name}</span>
        <span className="topbar__meta">
          {Math.round(area)}㎡ · {timeAgoLabel(savedAt)}
        </span>
        {saveError && (
          <span
            className="topbar__save-error"
            title="브라우저 저장 공간이 부족해 자동 저장이 실패했습니다. 대시보드에서 안 쓰는 도면을 지우거나 JSON 내보내기로 백업해 주세요."
          >
            ⚠ 저장 실패 — 공간 부족
          </span>
        )}
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
