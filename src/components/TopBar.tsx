import { useEffect, useRef, useState } from 'react';
import { timeAgoLabel, useCurrentPlan, useStore } from '../state/store';
import { ViewTabs } from './ViewTabs';
import { floorsOfBuilding } from '../model/floorStack';
import { floorDeleteConfirmText, floorDeletedText } from '../model/floorDelete';
import type { Plan } from '../model/types';
import { useCopyShareLink } from '../features/share/useCopyShareLink';

/**
 * 층 추가 메뉴 (디자인 B-7) — 빈 층 · 이 층 복제. 기호 칩(+ · ⧉)은 뜻이 title 에만 있어 글로 쓴다.
 * Esc · 바깥 누르기로 닫고 포커스를 "층 추가" 버튼으로 돌려준다.
 */
function FloorAddMenu({
  anchorRef,
  setOpen,
  onPick,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  setOpen: (open: boolean) => void;
  onPick: (source: 'empty' | 'duplicate') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClose = (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) anchorRef.current?.focus();
    };
    const items = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose(true);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // 뒤 캔버스의 방향키(선택 옮기기)로 새지 않게 막는다
        e.preventDefault();
        e.stopPropagation();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = (i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
        list[next]?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const host = ref.current?.parentElement;
      if (host && !host.contains(e.target as Node)) onClose(false); // 누른 곳으로 포커스가 간다
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchorRef, setOpen]);
  return (
    <div ref={ref} className="floor-add__menu" role="menu" aria-label="층 추가">
      <button type="button" role="menuitem" onClick={() => onPick('empty')}>
        빈 층 추가
      </button>
      <button type="button" role="menuitem" onClick={() => onPick('duplicate')}>
        이 층 복제
      </button>
    </div>
  );
}

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
  const [addOpen, setAddOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

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
          title={f.id === plan.id ? '두 번 눌러 층 이름을 바꿔요' : `${f.floorLabel ?? f.name} 열기`}
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
              title="이 층 지우기"
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
      <div className="floor-add">
        <button
          ref={addBtnRef}
          type="button"
          className="floor-tab floor-tab--add"
          aria-haspopup="menu"
          aria-expanded={addOpen}
          onClick={() => setAddOpen((v) => !v)}
        >
          + 층 추가
        </button>
        {addOpen && (
          <FloorAddMenu
            anchorRef={addBtnRef}
            setOpen={setAddOpen}
            onPick={(source) => {
              setAddOpen(false);
              addFloor(source);
            }}
          />
        )}
      </div>
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
  const openShoppingList = useStore((s) => s.openShoppingList);
  const shared = useStore((s) => s.sharedView != null);
  const copyShareLink = useCopyShareLink();
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
          {Math.round(area)}㎡ · {shared ? '보기 전용' : timeAgoLabel(savedAt)}
        </span>
        {saveError && (
          <span
            className="topbar__save-error"
            title="저장 공간이 꽉 차서 저장하지 못했어요. 안 쓰는 도면을 지우거나 JSON으로 백업해 주세요."
          >
            ⚠ 저장 실패 — 공간 부족
          </span>
        )}
        <FloorTabs />
      </div>

      <ViewTabs />

      <div className="topbar__right">
        <button
          className="btn btn--outline"
          title="이 도면을 볼 수 있는 링크를 복사해요"
          onClick={() => void copyShareLink()}
        >
          공유
        </button>
        {!shared && (
          <button
            className="btn btn--primary"
            title="이 도면에 놓은 가구의 쇼핑 리스트를 열어요"
            onClick={openShoppingList}
          >
            쇼핑 리스트
          </button>
        )}
      </div>
    </header>
  );
}
