import { create } from 'zustand';
import type {
  DragState,
  Plan,
  Screen,
  Tool,
  Vec2,
  View,
  ViewerState,
} from '../model/types';
import { createSamplePlan, createStudyPlan } from '../model/samplePlan';
import {
  loadPersistShape,
  markIntendedRemoval,
  savePersistShape,
  type PersistShape,
} from './persistence';

const HISTORY_LIMIT = 100;

function loadPlans(): PersistShape {
  try {
    const { shape } = loadPersistShape(localStorage);
    if (shape) return shape;
  } catch {
    // 저장소 접근 불가 — 샘플로 시작 (이후 저장의 병합 가드가 기존 문서를 지킨다)
  }
  const a = createSamplePlan();
  const b = createStudyPlan();
  return { planOrder: [a.id, b.id], plans: { [a.id]: a, [b.id]: b } };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastCommitKey: string | null = null;
let lastCommitAt = 0;

export interface AppStore {
  /* ---- routing ---- */
  screen: Screen;
  view: View;
  navigate: (screen: Screen) => void;
  setView: (view: View) => void;

  /* ---- plans (SSOT) ---- */
  plans: Record<string, Plan>;
  planOrder: string[];
  currentPlanId: string;
  savedAt: number;
  /** 저장 실패(용량 초과 등) — TopBar 가 배지로 표시. null = 정상 */
  saveError: 'quota' | null;
  openPlan: (id: string) => void;
  addPlan: (plan: Plan) => void;
  /** 층 추가 — 'empty'=빈 층, 'duplicate'=현재 층 복제. 첫 호출 시 현재 문서를 1층으로 승격 */
  addFloor: (source: 'empty' | 'duplicate') => void;
  /** 업로드 문서를 현재 문서의 새 층으로 연결해 추가 */
  addPlanAsFloor: (plan: Plan) => void;
  /** 문서 이름 변경 — 층 연결 문서는 건물 전체에 반영 */
  renamePlan: (planId: string, name: string) => void;
  /** 문서 복제 (건물 연결은 끊고 독립 문서로) */
  duplicatePlan: (planId: string) => void;
  /** 층 전환 — 현재 화면(view) 유지. 워크스루 계단 트리거용 */
  switchFloor: (planId: string) => void;
  renameFloor: (planId: string, label: string) => void;
  /** 층(문서) 삭제 — 마지막 남은 문서는 삭제하지 않음 */
  deleteFloor: (planId: string) => void;
  /**
   * 현재 도면을 변경. commit=true(기본)면 undo 히스토리에 스냅샷 push.
   * coalesceKey: 같은 키의 커밋이 400ms 내 연속되면 히스토리를 1개로 묶는다
   * (스와치 연타·수치 입력 등 — undo 한 번으로 묶음 전체가 되돌아감).
   */
  updatePlan: (
    mutate: (plan: Plan) => Plan,
    opts?: { commit?: boolean; coalesceKey?: string },
  ) => void;
  undo: () => void;
  redo: () => void;
  history: { past: Plan[]; future: Plan[] };
  /** 드래그류 제스처 종료 시, 제스처 시작 시점 스냅샷을 undo 히스토리에 push */
  pushHistory: (before: Plan) => void;

  /* ---- 2D editor ---- */
  tool: Tool;
  selection: string[];
  placingCatalogId: string | null;
  drag: DragState | null;
  camera2d: { pan: Vec2; zoom: number };
  snapping: { enabled: boolean; gridCm: number; angleStepDeg: number };
  setTool: (tool: Tool) => void;
  setSelection: (ids: string[]) => void;
  setPlacing: (catalogId: string | null) => void;
  setDrag: (drag: DragState | null) => void;
  setCamera2d: (camera: { pan: Vec2; zoom: number }) => void;
  toggleSnapping: () => void;
  /** 문서 오픈 직후 1회 fit-to-view 요청 플래그 (Editor2D가 소비) */
  pendingFitView: boolean;
  clearFitView: () => void;

  /* ---- 3D viewer ---- */
  viewer: ViewerState;
  /** 조감도 "이 시점에서 워크스루 시작" 스폰 오버라이드 */
  walkthroughSpawn: { pos: Vec2; yawDeg: number } | null;
  setWalkthroughSpawn: (v: { pos: Vec2; yawDeg: number } | null) => void;
  setViewer: (patch: Partial<ViewerState>) => void;
  setLighting: (patch: Partial<ViewerState['lighting']>) => void;
  setDisplay: (patch: Partial<ViewerState['display']>) => void;
}

export const useStore = create<AppStore>((set, get) => {
  const persisted = loadPlans();

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { plans, planOrder } = get();
      try {
        const result = savePersistShape(localStorage, { plans, planOrder });
        if (result.restored.length > 0) {
          // 병합 가드가 저장본에서 살린 문서 — 메모리에도 반영해 UI 와 일치시킨다
          const merged = loadPersistShape(localStorage).shape;
          if (merged) set({ plans: merged.plans, planOrder: merged.planOrder });
          console.warn('[persist] 사라질 뻔한 문서 복원:', result.restored);
        }
        set({ savedAt: Date.now(), saveError: result.ok ? null : 'quota' });
      } catch {
        set({ saveError: 'quota' });
      }
    }, 2000);
  };

  return {
    // 진입점은 대시보드(도면 목록+견적) — 문서 열기/생성/업로드 시 2D 스케치로 이동
    screen: 'dashboard',
    view: '2d',
    navigate: (screen) => set({ screen, placingCatalogId: null, drag: null }),
    setView: (view) => set({ view, placingCatalogId: null, drag: null }),

    plans: persisted.plans,
    planOrder: persisted.planOrder,
    currentPlanId: persisted.planOrder[0],
    savedAt: Date.now(),
    saveError: null,
    history: { past: [], future: [] },

    openPlan: (id) =>
      set((s) =>
        s.plans[id]
          ? {
              currentPlanId: id,
              screen: 'editor',
              view: '2d',
              selection: [],
              placingCatalogId: null,
              drag: null,
              history: { past: [], future: [] },
              camera2d: { pan: { x: 0, y: 0 }, zoom: 1 },
              pendingFitView: true,
            }
          : s,
      ),

    addPlan: (plan) => {
      set((s) => ({
        plans: { ...s.plans, [plan.id]: plan },
        planOrder: [plan.id, ...s.planOrder.filter((id) => id !== plan.id)],
      }));
      scheduleSave();
    },

    /* ---- 다층(층=연결된 문서) ---- */

    addFloor: (source) => {
      const s = get();
      const cur = s.plans[s.currentPlanId];
      if (!cur) return;
      const buildingId = cur.buildingId ?? `bld-${Date.now().toString(36)}`;
      const plans = { ...s.plans };
      // 첫 층 승격: 현재 문서에 buildingId·'1층' 라벨 부여
      if (!cur.buildingId) {
        plans[cur.id] = { ...cur, buildingId, floorLabel: cur.floorLabel ?? '1층' };
      }
      const floorCount = Object.values(plans).filter((p) => p.buildingId === buildingId).length;
      const base: Plan =
        source === 'duplicate'
          ? (JSON.parse(JSON.stringify(plans[s.currentPlanId])) as Plan)
          : {
              id: '',
              name: cur.name,
              unitScale: cur.unitScale,
              walls: [],
              openings: [],
              rooms: [],
              items: [],
              updatedAt: '',
            };
      const next: Plan = {
        ...base,
        id: `plan-${Date.now().toString(36)}-fl${floorCount}`,
        name: cur.name,
        buildingId,
        floorLabel: `${floorCount + 1}층`,
        updatedAt: new Date().toISOString(),
      };
      set({
        plans: { ...plans, [next.id]: next },
        planOrder: [next.id, ...s.planOrder],
        currentPlanId: next.id,
        selection: [],
        placingCatalogId: null,
        drag: null,
        history: { past: [], future: [] },
        camera2d: { pan: { x: 0, y: 0 }, zoom: 1 },
        pendingFitView: true,
      });
      scheduleSave();
    },

    addPlanAsFloor: (plan) => {
      const s = get();
      const cur = s.plans[s.currentPlanId];
      if (!cur) {
        get().addPlan(plan);
        get().openPlan(plan.id);
        return;
      }
      const buildingId = cur.buildingId ?? `bld-${Date.now().toString(36)}`;
      const plans = { ...s.plans };
      if (!cur.buildingId) {
        plans[cur.id] = { ...cur, buildingId, floorLabel: cur.floorLabel ?? '1층' };
      }
      const floorCount = Object.values(plans).filter((p) => p.buildingId === buildingId).length;
      const next: Plan = { ...plan, buildingId, floorLabel: `${floorCount + 1}층` };
      set({
        plans: { ...plans, [next.id]: next },
        planOrder: [next.id, ...s.planOrder.filter((id) => id !== next.id)],
        currentPlanId: next.id,
        selection: [],
        placingCatalogId: null,
        drag: null,
        history: { past: [], future: [] },
        camera2d: { pan: { x: 0, y: 0 }, zoom: 1 },
        pendingFitView: true,
        screen: 'editor',
        view: '2d',
      });
      scheduleSave();
    },

    renamePlan: (planId, name) => {
      set((s) => {
        const target = s.plans[planId];
        if (!target) return s;
        // 층 연결 문서는 건물 이름을 공유 — 같은 건물 전체에 반영
        const ids = target.buildingId
          ? Object.values(s.plans)
              .filter((p) => p.buildingId === target.buildingId)
              .map((p) => p.id)
          : [planId];
        const plans = { ...s.plans };
        for (const id of ids) plans[id] = { ...plans[id], name };
        return { plans };
      });
      scheduleSave();
    },

    duplicatePlan: (planId) => {
      const s = get();
      const src = s.plans[planId];
      if (!src) return;
      const copy = JSON.parse(JSON.stringify(src)) as Plan;
      copy.id = `plan-${Date.now().toString(36)}-cp`;
      copy.name = `${src.name} 사본`;
      // 사본은 건물 연결을 끊어 독립 문서로 (층 복제는 층 탭의 ⧉ 사용)
      delete copy.buildingId;
      delete copy.floorLabel;
      copy.updatedAt = new Date().toISOString();
      set({
        plans: { ...s.plans, [copy.id]: copy },
        planOrder: [copy.id, ...s.planOrder],
      });
      scheduleSave();
    },

    switchFloor: (planId) => {
      set((s) =>
        s.plans[planId]
          ? {
              currentPlanId: planId,
              selection: [],
              placingCatalogId: null,
              drag: null,
              history: { past: [], future: [] },
              pendingFitView: true,
              walkthroughSpawn: null,
            }
          : s,
      );
    },

    renameFloor: (planId, label) => {
      set((s) =>
        s.plans[planId]
          ? { plans: { ...s.plans, [planId]: { ...s.plans[planId], floorLabel: label } } }
          : s,
      );
      scheduleSave();
    },

    deleteFloor: (planId) => {
      const s = get();
      if (!s.plans[planId] || s.planOrder.length <= 1) return; // 마지막 문서는 유지
      markIntendedRemoval(planId); // 병합 가드가 이 삭제를 복원하지 않도록
      const plans = { ...s.plans };
      delete plans[planId];
      const planOrder = s.planOrder.filter((id) => id !== planId);
      const nextCurrent =
        s.currentPlanId === planId
          ? // 같은 건물의 다른 층 우선, 없으면 첫 문서
            Object.values(plans).find(
              (p) => p.buildingId != null && p.buildingId === s.plans[planId].buildingId,
            )?.id ?? planOrder[0]
          : s.currentPlanId;
      set({
        plans,
        planOrder,
        currentPlanId: nextCurrent,
        selection: [],
        history: s.currentPlanId === planId ? { past: [], future: [] } : s.history,
      });
      scheduleSave();
    },

    updatePlan: (mutate, opts) => {
      const { plans, currentPlanId, history } = get();
      const current = plans[currentPlanId];
      if (!current) return;
      const next = { ...mutate(current), updatedAt: new Date().toISOString() };
      const commit = opts?.commit !== false;
      const now = Date.now();
      const coalesced =
        commit &&
        opts?.coalesceKey != null &&
        opts.coalesceKey === lastCommitKey &&
        now - lastCommitAt < 400;
      if (commit) {
        lastCommitKey = opts?.coalesceKey ?? null;
        lastCommitAt = now;
      }
      set({
        plans: { ...plans, [currentPlanId]: next },
        history:
          commit && !coalesced
            ? {
                past: [...history.past.slice(-HISTORY_LIMIT + 1), current],
                future: [],
              }
            : history,
      });
      scheduleSave();
    },

    pushHistory: (before) => {
      lastCommitKey = null;
      const { history } = get();
      set({
        history: {
          past: [...history.past.slice(-HISTORY_LIMIT + 1), before],
          future: [],
        },
      });
      scheduleSave();
    },

    undo: () => {
      lastCommitKey = null;
      const { plans, currentPlanId, history } = get();
      const prev = history.past[history.past.length - 1];
      if (!prev) return;
      set({
        plans: { ...plans, [currentPlanId]: prev },
        history: {
          past: history.past.slice(0, -1),
          future: [plans[currentPlanId], ...history.future],
        },
        selection: [],
      });
      scheduleSave();
    },

    redo: () => {
      lastCommitKey = null;
      const { plans, currentPlanId, history } = get();
      const next = history.future[0];
      if (!next) return;
      set({
        plans: { ...plans, [currentPlanId]: next },
        history: {
          past: [...history.past, plans[currentPlanId]],
          future: history.future.slice(1),
        },
        selection: [],
      });
      scheduleSave();
    },

    tool: 'select',
    selection: [],
    placingCatalogId: null,
    drag: null,
    camera2d: { pan: { x: 0, y: 0 }, zoom: 1 },
    snapping: { enabled: true, gridCm: 10, angleStepDeg: 15 },
    pendingFitView: true, // 첫 로드도 오픈으로 취급
    clearFitView: () => set({ pendingFitView: false }),
    setTool: (tool) => set({ tool, placingCatalogId: null }),
    setSelection: (selection) => set({ selection }),
    setPlacing: (placingCatalogId) =>
      set({ placingCatalogId, tool: 'select', selection: [] }),
    setDrag: (drag) => set({ drag }),
    setCamera2d: (camera2d) => set({ camera2d }),
    toggleSnapping: () =>
      set((s) => ({ snapping: { ...s.snapping, enabled: !s.snapping.enabled } })),

    walkthroughSpawn: null,
    setWalkthroughSpawn: (walkthroughSpawn) => set({ walkthroughSpawn }),

    viewer: {
      eyeHeight: 1.6,
      lighting: { preset: 'afternoon', indoorIntensity: 0.68, fov: 75, azimuthDeg: 180 },
      display: { hideCeiling: true, shadows: true, dimensionLabels: false },
      birdseyeMode: 'dollhouse',
    },
    setViewer: (patch) => set((s) => ({ viewer: { ...s.viewer, ...patch } })),
    setLighting: (patch) =>
      set((s) => ({ viewer: { ...s.viewer, lighting: { ...s.viewer.lighting, ...patch } } })),
    setDisplay: (patch) =>
      set((s) => ({ viewer: { ...s.viewer, display: { ...s.viewer.display, ...patch } } })),
  };
});

export const useCurrentPlan = (): Plan => {
  return useStore((s) => s.plans[s.currentPlanId]);
};

/** "N분 전 저장" 표기 */
export function timeAgoLabel(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 저장';
  if (min < 60) return `${min}분 전 저장`;
  return `${Math.floor(min / 60)}시간 전 저장`;
}
