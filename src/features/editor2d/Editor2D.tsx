import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './editor2d.css';
import type { PlacedItem, Plan, Room, Vec2 } from '../../model/types';
import { catalogById } from '../../model/catalog';
import {
  deg2rad,
  itemAabb,
  polygonArea,
  roomAt,
  snapValue,
} from '../../model/geometry';
import { useCurrentPlan, useStore } from '../../state/store';
import { blockedDoorIds } from '../../model/doorZones';
import { toggleDoor } from '../../model/interactions3d';
import {
  collisionsFor,
  dimensionNear,
  doorNear,
  findFreeSpot,
  itemAtPoint,
  snapItemMove,
  wallNear,
} from './interactions';
import {
  PlanCanvas,
  type Measure,
  type OpeningHover,
  type PlacingGhost,
  type WallDraft,
} from './PlanCanvas';
import { CatalogPanel, Inspector, StatusBar, ToolDock } from './panels';
import { fitCamera, makeTransform, s2w, w2s } from './view';

let idSeq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${idSeq++}`;

type Gesture =
  | { type: 'move'; itemId: string; grabOffset: Vec2; before: Plan; moved: boolean }
  | { type: 'rotate'; itemId: string; before: Plan; moved: boolean }
  | {
      type: 'resize';
      itemId: string;
      before: Plan;
      fixedWorld: Vec2;
      moved: boolean;
    }
  | { type: 'pan'; startScreen: Vec2; startPan: Vec2 }
  | { type: 'measure' };

export function Editor2D() {
  const plan = useCurrentPlan();
  const {
    tool,
    selection,
    placingCatalogId,
    drag,
    camera2d,
    setTool,
    setSelection,
    setPlacing,
    setDrag,
    setCamera2d,
    updatePlan,
    pushHistory,
    undo,
    redo,
  } = useStore();

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null!);
  const [viewport, setViewport] = useState({ w: 1440, h: 844 });
  const [measured, setMeasured] = useState(false);
  const gestureRef = useRef<Gesture | null>(null);
  const [gestureKind, setGestureKind] = useState<Gesture['type'] | null>(null);
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const [hoverDoor, setHoverDoor] = useState(false);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [openingHover, setOpeningHover] = useState<OpeningHover | null>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const measureRef = useRef<Measure | null>(null);
  measureRef.current = measure;
  const [placingPos, setPlacingPos] = useState<Vec2 | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [postDrop, setPostDrop] = useState<{ itemId: string } | null>(null);

  // 최신 상태를 이벤트 핸들러에서 안전하게 읽기 위한 ref
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setViewport({ w: el.clientWidth, h: el.clientHeight });
    setMeasured(true);
    return () => ro.disconnect();
  }, []);

  // 문서 오픈 직후 1회 fit-to-view (사용자 팬/줌 중에는 건드리지 않음)
  const pendingFitView = useStore((s) => s.pendingFitView);
  const clearFitView = useStore((s) => s.clearFitView);
  useEffect(() => {
    if (pendingFitView && measured) {
      setCamera2d(fitCamera(planRef.current, { w: hostRef.current!.clientWidth, h: hostRef.current!.clientHeight }));
      clearFitView();
    }
  }, [pendingFitView, measured, setCamera2d, clearFitView]);

  const t = useMemo(
    () => makeTransform(plan, viewport, camera2d),
    [plan, viewport, camera2d],
  );
  const tRef = useRef(t);
  tRef.current = t;

  const toWorld = useCallback((e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgRef.current.getBoundingClientRect();
    return s2w(tRef.current, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const toScreen = useCallback((e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  /* ===== 아이템 편집 헬퍼 ===== */

  const patchItem = useCallback(
    (itemId: string, patch: Partial<PlacedItem>, commit: boolean) => {
      updatePlan(
        (pl) => ({
          ...pl,
          items: pl.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        }),
        { commit },
      );
    },
    [updatePlan],
  );

  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      const sel = useStore.getState().selection;
      if (sel.length === 0) return;
      updatePlan((pl) => ({
        ...pl,
        items: pl.items.map((i) =>
          sel.includes(i.id)
            ? {
                ...i,
                position: { x: i.position.x + dx, y: i.position.y + dy },
                roomId:
                  roomAt(pl.rooms, { x: i.position.x + dx, y: i.position.y + dy })?.id ??
                  i.roomId,
              }
            : i,
        ),
      }));
    },
    [updatePlan],
  );

  const deleteSelection = useCallback(() => {
    const sel = useStore.getState().selection;
    if (sel.length === 0) return;
    updatePlan((pl) => ({
      ...pl,
      items: pl.items.filter((i) => !sel.includes(i.id)),
      dimensions: (pl.dimensions ?? []).filter((d) => !sel.includes(d.id)),
    }));
    setSelection([]);
    setPostDrop(null);
  }, [updatePlan, setSelection]);

  const duplicateSelection = useCallback(() => {
    const sel = useStore.getState().selection;
    if (sel.length === 0) return;
    const pl = planRef.current;
    const copies = pl.items
      .filter((i) => sel.includes(i.id))
      .map((i) => ({
        ...i,
        id: newId('item'),
        position: { x: i.position.x + 0.3, y: i.position.y + 0.3 },
      }));
    updatePlan((p) => ({ ...p, items: [...p.items, ...copies] }));
    setSelection(copies.map((c) => c.id));
  }, [updatePlan, setSelection]);

  /* ===== 벽 그리기 ===== */

  const snapWallPoint = useCallback(
    (raw: Vec2, prev: Vec2 | null): Vec2 => {
      const snap = useStore.getState().snapping;
      if (!snap.enabled) return raw;
      if (!prev) return { x: snapValue(raw.x, 0.1), y: snapValue(raw.y, 0.1) };
      const dx = raw.x - prev.x;
      const dy = raw.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) return raw;
      const angle = Math.atan2(dy, dx);
      const stepped = Math.round(angle / deg2rad(snap.angleStepDeg)) * deg2rad(snap.angleStepDeg);
      const len = Math.max(0.1, snapValue(dist, 0.1));
      return { x: prev.x + Math.cos(stepped) * len, y: prev.y + Math.sin(stepped) * len };
    },
    [],
  );

  const finishWallDraft = useCallback(
    (close: boolean) => {
      const draft = wallDraft;
      setWallDraft(null);
      if (!draft || draft.points.length < 2) return;
      const pts = draft.points;
      updatePlan((pl) => {
        const walls = [...pl.walls];
        const segs = close ? pts.length : pts.length - 1;
        for (let i = 0; i < segs; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          walls.push({ id: newId('wall'), a, b, thickness: 0.15, height: 2.4 });
        }
        let rooms = pl.rooms;
        if (close && pts.length >= 3) {
          const room: Room = {
            id: newId('room'),
            name: `방 ${pl.rooms.length + 1}`,
            wallIds: walls.slice(-segs).map((w) => w.id),
            polygon: pts,
            areaSqm: polygonArea(pts),
            floor: 'living',
          };
          rooms = [...pl.rooms, room];
        }
        return { ...pl, walls, rooms };
      });
    },
    [wallDraft, updatePlan],
  );

  /* ===== 포인터 이벤트 ===== */

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button === 1 || (e.button === 0 && spaceDown)) {
        gestureRef.current = {
          type: 'pan',
          startScreen: { x: e.clientX, y: e.clientY },
          startPan: { ...useStore.getState().camera2d.pan },
        };
        setGestureKind('pan');
        try {
          svgRef.current.setPointerCapture(e.pointerId);
        } catch {
          // 합성 이벤트 등 capture 불가 — 무시
        }
        return;
      }
      if (e.button !== 0) return;
      const world = toWorld(e);
      const pl = planRef.current;
      try {
        svgRef.current.setPointerCapture(e.pointerId);
      } catch {
        // 합성 이벤트 등 capture 불가 — 무시
      }

      // 카탈로그 배치 모드
      if (placingCatalogId) {
        const cat = catalogById.get(placingCatalogId);
        if (!cat) return;
        const snap = useStore.getState().snapping;
        const pos = snap.enabled
          ? { x: snapValue(world.x, snap.gridCm / 100), y: snapValue(world.y, snap.gridCm / 100) }
          : world;
        const item: PlacedItem = {
          id: newId('item'),
          catalogId: cat.id,
          position: pos,
          rotationDeg: 0,
          size: { ...cat.size },
          variant: { material: cat.swatches[0].id, color: cat.swatches[0].color },
          roomId: roomAt(pl.rooms, pos)?.id ?? null,
          price: cat.price,
        };
        updatePlan((p) => ({ ...p, items: [...p.items, item] }));
        setPlacing(null);
        setPlacingPos(null);
        setSelection([item.id]);
        const cols = collisionsFor({ ...pl, items: [...pl.items, item] }, item);
        if (cols.length > 0) setPostDrop({ itemId: item.id });
        return;
      }

      if (tool === 'wall') {
        const prev = wallDraft?.points[wallDraft.points.length - 1] ?? null;
        const pt = snapWallPoint(world, prev);
        if (wallDraft && wallDraft.points.length >= 3) {
          const startScreen = w2s(tRef.current, wallDraft.points[0]);
          const cursorScreen = toScreen(e);
          if (Math.hypot(startScreen.x - cursorScreen.x, startScreen.y - cursorScreen.y) < 12) {
            finishWallDraft(true);
            return;
          }
        }
        setWallDraft((d) => ({ points: [...(d?.points ?? []), pt], cursor: pt }));
        return;
      }

      if (tool === 'door' || tool === 'window') {
        const near = wallNear(pl, world, tRef.current.s);
        if (near) {
          const width = tool === 'door' ? 0.9 : 1.2;
          const len = Math.hypot(near.wall.b.x - near.wall.a.x, near.wall.b.y - near.wall.a.y);
          const halfT = width / 2 / len;
          const tt = Math.min(1 - halfT, Math.max(halfT, near.t));
          updatePlan((p) => ({
            ...p,
            openings: [
              ...p.openings,
              {
                id: newId('opening'),
                wallId: near.wall.id,
                t: tt,
                width,
                kind: tool === 'door' ? 'door' : 'window',
                swing: tool === 'door' ? 'left' : undefined,
              },
            ],
          }));
        }
        return;
      }

      if (tool === 'dimension') {
        gestureRef.current = { type: 'measure' };
        setGestureKind('measure');
        setMeasure({ a: world, b: world });
        return;
      }

      // ---- select 도구 ----
      const selectedId = selection.length === 1 ? selection[0] : null;
      const selected = selectedId ? pl.items.find((i) => i.id === selectedId) : null;
      if (selected) {
        const s = tRef.current.s;
        const off = 4 / s;
        const hw = selected.size.w / 2 + off;
        const hd = selected.size.d / 2 + off;
        const rot = deg2rad(selected.rotationDeg);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const local2world = (p: Vec2): Vec2 => ({
          x: selected.position.x + p.x * cos - p.y * sin,
          y: selected.position.y + p.x * sin + p.y * cos,
        });
        const cursorScreen = toScreen(e);
        const distToScreenPt = (wp: Vec2) => {
          const sp = w2s(tRef.current, wp);
          return Math.hypot(sp.x - cursorScreen.x, sp.y - cursorScreen.y);
        };
        // 회전 핸들
        const rotHandle = local2world({ x: 0, y: -hd - 22 / s - 9 / s });
        if (distToScreenPt(rotHandle) < 13) {
          gestureRef.current = {
            type: 'rotate',
            itemId: selected.id,
            before: pl,
            moved: false,
          };
          setGestureKind('rotate');
          return;
        }
        // 코너 핸들
        const corners: Vec2[] = [
          { x: -hw, y: -hd },
          { x: hw, y: -hd },
          { x: hw, y: hd },
          { x: -hw, y: hd },
        ];
        for (let k = 0; k < 4; k++) {
          if (distToScreenPt(local2world(corners[k])) < 10) {
            const fixedWorld = local2world({ x: -corners[k].x, y: -corners[k].y });
            gestureRef.current = {
              type: 'resize',
              itemId: selected.id,
              before: pl,
              fixedWorld,
              moved: false,
            };
            setGestureKind('resize');
            return;
          }
        }
      }

      const hit = itemAtPoint(pl, world);
      if (!hit) {
        // 문 클릭 → 여닫기 토글 (2D에서도 문 상호작용)
        const door = doorNear(pl, world, tRef.current.s);
        if (door) {
          updatePlan((p) => toggleDoor(p, door.opening.id));
          return;
        }
        // 치수 주석 클릭 → 선택 (Delete로 삭제 가능)
        const dimId = dimensionNear(pl, world, tRef.current.s);
        if (dimId) {
          setSelection([dimId]);
          setPostDrop(null);
          return;
        }
        // 룸 바닥 클릭 → 룸 선택 (마감재 편집 패널)
        const room = roomAt(pl.rooms, world);
        if (room) {
          setSelection([room.id]);
          setPostDrop(null);
          return;
        }
      }
      if (hit) {
        setSelection([hit.id]);
        setPostDrop(null);
        gestureRef.current = {
          type: 'move',
          itemId: hit.id,
          grabOffset: { x: world.x - hit.position.x, y: world.y - hit.position.y },
          before: pl,
          moved: false,
        };
        setGestureKind('move');
        return;
      }

      setSelection([]);
      setPostDrop(null);
    },
    [
      spaceDown,
      placingCatalogId,
      tool,
      selection,
      wallDraft,
      toWorld,
      toScreen,
      snapWallPoint,
      finishWallDraft,
      updatePlan,
      setPlacing,
      setSelection,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const g = gestureRef.current;
      const pl = planRef.current;
      const world = toWorld(e);

      if (g?.type === 'pan') {
        setCamera2d({
          pan: {
            x: g.startPan.x + (e.clientX - g.startScreen.x),
            y: g.startPan.y + (e.clientY - g.startScreen.y),
          },
          zoom: useStore.getState().camera2d.zoom,
        });
        return;
      }

      if (g?.type === 'measure') {
        setMeasure((m) => (m ? { ...m, b: world } : m));
        return;
      }

      if (g?.type === 'move') {
        const item = pl.items.find((i) => i.id === g.itemId);
        if (!item) return;
        g.moved = true;
        const candidate = { x: world.x - g.grabOffset.x, y: world.y - g.grabOffset.y };
        const snap = useStore.getState().snapping;
        const { position, snap: snapResult } = snapItemMove(
          pl,
          item,
          candidate,
          tRef.current.s,
          snap,
        );
        const probe = { ...item, position };
        const collisions = collisionsFor(pl, probe);
        const blockedDoors = blockedDoorIds(pl, probe);
        patchItem(g.itemId, { position }, false);
        setDrag({
          itemId: g.itemId,
          ghost: position,
          snap: snapResult,
          collisions,
          blockedDoors,
          isNew: false,
        });
        return;
      }

      if (g?.type === 'rotate') {
        const item = pl.items.find((i) => i.id === g.itemId);
        if (!item) return;
        g.moved = true;
        const angle =
          (Math.atan2(world.y - item.position.y, world.x - item.position.x) * 180) / Math.PI + 90;
        const step = useStore.getState().snapping.angleStepDeg;
        const deg = e.shiftKey ? Math.round(angle) : Math.round(angle / step) * step;
        patchItem(g.itemId, { rotationDeg: deg }, false);
        return;
      }

      if (g?.type === 'resize') {
        const item = pl.items.find((i) => i.id === g.itemId);
        if (!item) return;
        g.moved = true;
        const rot = deg2rad(item.rotationDeg);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const v = { x: world.x - g.fixedWorld.x, y: world.y - g.fixedWorld.y };
        // world → item 축
        const lx = v.x * cos + v.y * sin;
        const ly = -v.x * sin + v.y * cos;
        const newW = Math.max(0.2, snapValue(Math.abs(lx), 0.01));
        const newD = Math.max(0.2, snapValue(Math.abs(ly), 0.01));
        const cxLocal = (Math.sign(lx) * newW) / 2;
        const cyLocal = (Math.sign(ly) * newD) / 2;
        const position = {
          x: g.fixedWorld.x + cxLocal * cos - cyLocal * sin,
          y: g.fixedWorld.y + cxLocal * sin + cyLocal * cos,
        };
        patchItem(
          g.itemId,
          { position, size: { ...item.size, w: newW, d: newD } },
          false,
        );
        return;
      }

      // 제스처 없음 — hover 상태 갱신
      if (placingCatalogId) {
        const snap = useStore.getState().snapping;
        setPlacingPos(
          snap.enabled
            ? { x: snapValue(world.x, snap.gridCm / 100), y: snapValue(world.y, snap.gridCm / 100) }
            : world,
        );
        return;
      }
      if (tool === 'wall' && wallDraft) {
        const prev = wallDraft.points[wallDraft.points.length - 1];
        setWallDraft({ ...wallDraft, cursor: snapWallPoint(world, prev) });
        return;
      }
      if (tool === 'door' || tool === 'window') {
        const near = wallNear(pl, world, tRef.current.s);
        setOpeningHover(near ? { wallId: near.wall.id, t: near.t, kind: tool } : null);
        return;
      }
      if (tool === 'select') {
        const hover = itemAtPoint(pl, world);
        setHoverItemId(hover?.id ?? null);
        setHoverDoor(!hover && doorNear(pl, world, tRef.current.s) != null);
      }
    },
    [toWorld, tool, wallDraft, placingCatalogId, patchItem, setDrag, setCamera2d, snapWallPoint],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      setGestureKind(null);
      try {
        svgRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // capture 없음 — 무시
      }

      if (!g) return;
      if (g.type === 'pan') return;
      if (g.type === 'measure') {
        // 측정 확정 → 영속 치수 주석으로 도면에 고정 (undo 대상)
        const m = measureRef.current;
        if (m && Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) >= 0.05) {
          updatePlan((pl) => ({
            ...pl,
            dimensions: [...(pl.dimensions ?? []), { id: newId('dim'), a: m.a, b: m.b }],
          }));
        }
        setMeasure(null);
        return;
      }

      if (g.type === 'move' || g.type === 'rotate' || g.type === 'resize') {
        const pl = planRef.current;
        const item = pl.items.find((i) => i.id === g.itemId);
        if (g.moved && item) {
          pushHistory(g.before);
          // 룸 재배정
          patchItem(g.itemId, { roomId: roomAt(pl.rooms, item.position)?.id ?? null }, false);
          if (g.type === 'move') {
            const problematic =
              collisionsFor(pl, item).length > 0 || blockedDoorIds(pl, item).length > 0;
            setPostDrop(problematic ? { itemId: g.itemId } : null);
          }
        }
        setDrag(null);
      }
    },
    [pushHistory, patchItem, setDrag],
  );

  /* ===== 휠 줌 ===== */

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const cam = useStore.getState().camera2d;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const zoom = Math.min(3, Math.max(0.3, cam.zoom * factor));
      if (zoom === cam.zoom) return;
      const cursor = toScreen(e);
      const worldAtCursor = s2w(tRef.current, cursor);
      const b = tRef.current;
      const s2 = (b.s / cam.zoom) * zoom;
      // o2 = cursor - world * s2 → pan = o2 - (viewport/2 - center*s2)
      const cx = (b.ox - useStore.getState().camera2d.pan.x - viewport.w / 2) / -b.s;
      const cy = (b.oy - useStore.getState().camera2d.pan.y - viewport.h / 2) / -b.s;
      const pan = {
        x: cursor.x - worldAtCursor.x * s2 - (viewport.w / 2 - cx * s2),
        y: cursor.y - worldAtCursor.y * s2 - (viewport.h / 2 - cy * s2),
      };
      setCamera2d({ pan, zoom });
    },
    [toScreen, setCamera2d, viewport],
  );

  /* ===== 키보드 ===== */

  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      // Cmd+Z / Cmd+Shift+Z 는 전역 useUndoShortcut 이 처리 (중복 등록 금지)
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
        return;
      }
      if (e.key === 'Escape') {
        if (useStore.getState().placingCatalogId) {
          setPlacing(null);
          setPlacingPos(null);
        } else if (wallDraft) {
          setWallDraft(null);
        } else {
          setSelection([]);
          setPostDrop(null);
        }
        return;
      }
      if (e.key === 'Enter' && wallDraft) {
        finishWallDraft(false);
        return;
      }
      const arrowStep = e.shiftKey ? 0.01 : 0.1;
      if (e.key === 'ArrowLeft') return moveSelection(-arrowStep, 0);
      if (e.key === 'ArrowRight') return moveSelection(arrowStep, 0);
      if (e.key === 'ArrowUp') return moveSelection(0, -arrowStep);
      if (e.key === 'ArrowDown') return moveSelection(0, arrowStep);

      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 'w') setTool('wall');
      else if (k === 'd') setTool('door');
      else if (k === 'n') setTool('window');
      else if (k === 'm') setTool('dimension');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    wallDraft,
    finishWallDraft,
    deleteSelection,
    duplicateSelection,
    moveSelection,
    undo,
    redo,
    setTool,
    setSelection,
    setPlacing,
  ]);

  // 도구 변경 시 진행중 상태 정리
  useEffect(() => {
    setWallDraft(null);
    setOpeningHover(null);
    if (tool !== 'dimension') setMeasure(null);
  }, [tool]);

  /* ===== 파생 렌더 데이터 ===== */

  const placingGhost: PlacingGhost | null = (() => {
    if (!placingCatalogId || !placingPos) return null;
    const cat = catalogById.get(placingCatalogId);
    const blocked = cat
      ? blockedDoorIds(plan, {
          catalogId: placingCatalogId,
          position: placingPos,
          rotationDeg: 0,
          size: cat.size,
        }).length > 0
      : false;
    return {
      catalogId: placingCatalogId,
      pos: placingPos,
      valid: roomAt(plan.rooms, placingPos) != null && !blocked,
    };
  })();

  const cursor =
    gestureKind === 'pan'
      ? 'grabbing'
      : spaceDown
        ? 'grab'
        : placingCatalogId
          ? 'copy'
          : tool !== 'select'
            ? 'crosshair'
            : hoverItemId
              ? 'move'
              : hoverDoor
                ? 'pointer'
                : 'default';

  const resetView = useCallback(() => {
    const el = hostRef.current;
    setCamera2d(
      fitCamera(planRef.current, {
        w: el?.clientWidth ?? 1440,
        h: el?.clientHeight ?? 844,
      }),
    );
  }, [setCamera2d]);

  // 충돌 후 액션 칩 위치
  const postDropItem = postDrop ? plan.items.find((i) => i.id === postDrop.itemId) : null;
  const postDropScreen = postDropItem
    ? w2s(t, { x: postDropItem.position.x, y: itemAabb(postDropItem).max.y })
    : null;
  const postDropHasCollision =
    postDropItem != null &&
    (collisionsFor(plan, postDropItem).length > 0 ||
      blockedDoorIds(plan, postDropItem).length > 0);

  return (
    <div className="editor2d" ref={hostRef} onWheel={onWheel}>
      <div
        className="editor2d__grid"
        style={{
          backgroundSize: `${0.5 * t.s}px ${0.5 * t.s}px`,
          backgroundPosition: `${t.ox}px ${t.oy}px`,
        }}
      />
      <PlanCanvas
        plan={plan}
        t={t}
        viewport={viewport}
        tool={tool}
        selection={selection}
        hoverItemId={hoverItemId}
        drag={drag}
        wallDraft={wallDraft}
        openingHover={openingHover}
        measure={measure}
        placingGhost={placingGhost}
        rotatingItemId={gestureKind === 'rotate' ? selection[0] ?? null : null}
        resizingItemId={gestureKind === 'resize' ? selection[0] ?? null : null}
        svgRef={svgRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        cursor={cursor}
      />
      <ToolDock onResetView={resetView} />
      <CatalogPanel />
      <Inspector />
      <StatusBar t={t} />
      {postDropItem && postDropHasCollision && postDropScreen && (
        <div
          className="collision-actions"
          style={{ left: postDropScreen.x, top: postDropScreen.y + 14 }}
        >
          <button
            className="btn btn--dark"
            onClick={() => {
              const spot = findFreeSpot(plan, postDropItem);
              if (spot) {
                updatePlan((pl) => ({
                  ...pl,
                  items: pl.items.map((i) =>
                    i.id === postDropItem.id
                      ? { ...i, position: spot, roomId: roomAt(pl.rooms, spot)?.id ?? i.roomId }
                      : i,
                  ),
                }));
              }
              setPostDrop(null);
            }}
          >
            빈 자리로 이동
          </button>
          <button className="btn btn--outline" onClick={() => setPostDrop(null)}>
            그대로 두기
          </button>
        </div>
      )}
    </div>
  );
}
