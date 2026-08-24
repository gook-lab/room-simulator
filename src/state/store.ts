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

const STORAGE_KEY = 'roomcast.plans.v1';
const HISTORY_LIMIT = 100;

type PersistShape = { planOrder: string[]; plans: Record<string, Plan> };

function loadPlans(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed.planOrder?.length && parsed.plans) return parsed;
    }
  } catch {
    // 손상된 저장본은 무시하고 샘플로 재시작
  }
  const a = createSamplePlan();
  const b = createStudyPlan();
  return { planOrder: [a.id, b.id], plans: { [a.id]: a, [b.id]: b } };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

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
  openPlan: (id: string) => void;
  addPlan: (plan: Plan) => void;
  /** 현재 도면을 변경. commit=true(기본)면 undo 히스토리에 스냅샷 push */
  updatePlan: (mutate: (plan: Plan) => Plan, opts?: { commit?: boolean }) => void;
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ plans, planOrder }));
        set({ savedAt: Date.now() });
      } catch {
        // 저장 실패(용량 등)는 조용히 무시
      }
    }, 2000);
  };

  return {
    screen: 'editor',
    view: '2d',
    navigate: (screen) => set({ screen, placingCatalogId: null, drag: null }),
    setView: (view) => set({ view, placingCatalogId: null, drag: null }),

    plans: persisted.plans,
    planOrder: persisted.planOrder,
    currentPlanId: persisted.planOrder[0],
    savedAt: Date.now(),
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

    updatePlan: (mutate, opts) => {
      const { plans, currentPlanId, history } = get();
      const current = plans[currentPlanId];
      if (!current) return;
      const next = { ...mutate(current), updatedAt: new Date().toISOString() };
      const commit = opts?.commit !== false;
      set({
        plans: { ...plans, [currentPlanId]: next },
        history: commit
          ? {
              past: [...history.past.slice(-HISTORY_LIMIT + 1), current],
              future: [],
            }
          : history,
      });
      scheduleSave();
    },

    pushHistory: (before) => {
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
