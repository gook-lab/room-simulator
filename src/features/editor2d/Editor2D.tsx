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
  canPlaceWallItem,
  clampWallT,
  createWallItem,
  isWallCatalogItem,
  moveWallItem,
} from '../../model/wallItems';
import {
  deleteWalls,
  isWallId,
  moveWallVertex,
  translateWall,
} from '../../model/wallEdit';
import { splitRoomByPolyline } from '../../model/roomSplit';
import {
  collisionsFor,
  dimensionNear,
  findFreeSpot,
  openingNear,
  groupProblems,
  itemAtPoint,
  itemsInRect,
  snapItemMove,
  wallItemAt,
  wallNear,
} from './interactions';
import {
  PlanCanvas,
  type Measure,
  type OpeningHover,
  type PlacingGhost,
  trashButtonPos,
  type WallDraft,
  type WallItemGhost,
} from './PlanCanvas';
import { CatalogPanel, Inspector, StatusBar, ToolDock } from './panels';
import { wheelTargetsCanvas } from './inputRouting';
import { fitCamera, makeTransform, s2w, w2s } from './view';

let idSeq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${idSeq++}`;

type Gesture =
  | { type: 'move'; itemId: string; grabOffset: Vec2; before: Plan; moved: boolean }
  | {
      type: 'groupMove';
      itemIds: string[];
      grabWorld: Vec2;
      starts: Record<string, Vec2>;
      before: Plan;
      moved: boolean;
    }
  | { type: 'marquee'; start: Vec2 }
  | { type: 'wallItemMove'; id: string; before: Plan; moved: boolean }
  | { type: 'wallEndpointMove'; wallId: string; end: 'a' | 'b'; before: Plan; moved: boolean }
  | { type: 'wallBodyMove'; wallId: string; grabWorld: Vec2; before: Plan; moved: boolean }
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
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const marqueeRef = useRef<{ a: Vec2; b: Vec2 } | null>(null);
  marqueeRef.current = marquee;
  const [wallGhost, setWallGhost] = useState<WallItemGhost>(null);
  const wallGhostRef = useRef<WallItemGhost>(null);
  wallGhostRef.current = wallGhost;
  const [wallMoveInvalid, setWallMoveInvalid] = useState(false);
  const wallMoveInvalidRef = useRef(false);
  wallMoveInvalidRef.current = wallMoveInvalid;
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
    updatePlan((pl) => {
      // 벽 삭제는 개구부·벽 부착 아이템 연쇄 삭제 포함
      const wallIds = sel.filter((id) => pl.walls.some((w) => w.id === id));
      const base = wallIds.length > 0 ? deleteWalls(pl, wallIds) : pl;
      return {
        ...base,
        items: base.items.filter((i) => !sel.includes(i.id)),
        openings: base.openings.filter((o) => !sel.includes(o.id)),
        wallItems: (base.wallItems ?? []).filter((w) => !sel.includes(w.id)),
        dimensions: (base.dimensions ?? []).filter((d) => !sel.includes(d.id)),
      };
    });
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
      const pl = planRef.current;
      const s = tRef.current.s;

      // 기존 벽에 스냅: 끝점(12px) 우선, 그다음 벽 선상 최근접점(12px)
      const snapToWalls = (p: Vec2): Vec2 => {
        if (!snap.enabled) return p;
        const threshold = 18 / s;
        let bestEnd: { pt: Vec2; d: number } | null = null;
        for (const w of pl.walls) {
          for (const end of [w.a, w.b]) {
            const d = Math.hypot(end.x - p.x, end.y - p.y);
            if (d < threshold && (!bestEnd || d < bestEnd.d)) bestEnd = { pt: end, d };
          }
        }
        if (bestEnd) return { ...bestEnd.pt };
        const near = wallNear(pl, p, s, 18);
        if (near) {
          const w = near.wall;
          return {
            x: w.a.x + (w.b.x - w.a.x) * near.t,
            y: w.a.y + (w.b.y - w.a.y) * near.t,
          };
        }
        return p;
      };

      if (!snap.enabled) return raw;
      if (!prev) {
        return snapToWalls({ x: snapValue(raw.x, 0.1), y: snapValue(raw.y, 0.1) });
      }
      const dx = raw.x - prev.x;
      const dy = raw.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) return raw;
      const angle = Math.atan2(dy, dx);
      const stepped = Math.round(angle / deg2rad(snap.angleStepDeg)) * deg2rad(snap.angleStepDeg);
      const len = Math.max(0.1, snapValue(dist, 0.1));
      const stepPt = {
        x: prev.x + Math.cos(stepped) * len,
        y: prev.y + Math.sin(stepped) * len,
      };
      // 기존 벽 근처면 벽에 붙임 — 룸 분할·접합이 정확해진다
      return snapToWalls(stepPt);
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
        const next = { ...pl, walls, rooms };
        // 열린 폴리라인이 기존 룸을 가로지르면 룸 분할 (면적·가구 roomId 재배정)
        return close ? next : splitRoomByPolyline(next, pts);
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
        // 벽 부착 아이템: 유효한 벽 스냅 위치에서만 배치 (개구부 겹침 금지)
        if (isWallCatalogItem(placingCatalogId)) {
          const ghost = wallGhostRef.current;
          if (ghost?.valid) {
            const wi = createWallItem(ghost.catalogId, ghost.wallId, ghost.t, ghost.side);
            // 연속 배치: placing 유지 — Esc 또는 카탈로그 재클릭으로 종료
            updatePlan((p) => ({ ...p, wallItems: [...(p.wallItems ?? []), wi] }));
          }
          return;
        }
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
        // 연속 배치: placing 유지 — 같은 가구를 계속 찍을 수 있다 (Esc/재클릭 종료)
        updatePlan((p) => ({ ...p, items: [...p.items, item] }));
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
      // 휴지통 버튼 클릭 → 선택 전체 삭제 (Delete 키와 동일 경로, undo 대상)
      {
        const tPos = trashButtonPos(pl, useStore.getState().selection, tRef.current.s);
        if (tPos) {
          const sp = w2s(tRef.current, tPos);
          const cs = toScreen(e);
          if (Math.hypot(sp.x - cs.x, sp.y - cs.y) < 13) {
            deleteSelection();
            return;
          }
        }
      }
      const selectedId = selection.length === 1 ? selection[0] : null;

      // 선택된 벽: 끝점 핸들 드래그(길이/방향) 또는 몸통 드래그(평행 이동)
      if (selectedId && isWallId(pl, selectedId)) {
        const wall = pl.walls.find((w) => w.id === selectedId)!;
        const cs = toScreen(e);
        for (const end of ['a', 'b'] as const) {
          const sp = w2s(tRef.current, wall[end]);
          if (Math.hypot(sp.x - cs.x, sp.y - cs.y) < 12) {
            gestureRef.current = {
              type: 'wallEndpointMove',
              wallId: wall.id,
              end,
              before: pl,
              moved: false,
            };
            setGestureKind('wallEndpointMove');
            return;
          }
        }
        const near = wallNear(pl, world, tRef.current.s, 10);
        if (near?.wall.id === wall.id) {
          gestureRef.current = {
            type: 'wallBodyMove',
            wallId: wall.id,
            grabWorld: world,
            before: pl,
            moved: false,
          };
          setGestureKind('wallBodyMove');
          return;
        }
      }

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

      // Shift: 다중 선택 토글 / 빈 공간 Shift+드래그 = 마퀴 박스
      if (e.shiftKey) {
        if (hit) {
          const cur = useStore.getState().selection.filter((id) =>
            pl.items.some((i) => i.id === id),
          );
          setSelection(
            cur.includes(hit.id) ? cur.filter((id) => id !== hit.id) : [...cur, hit.id],
          );
          setPostDrop(null);
        } else {
          gestureRef.current = { type: 'marquee', start: world };
          setGestureKind('marquee');
          setMarquee({ a: world, b: world });
        }
        return;
      }

      // 다중 선택 상태에서 선택된 아이템을 잡으면 그룹 이동
      if (hit && selection.length > 1 && selection.includes(hit.id)) {
        const itemIds = selection.filter((id) => pl.items.some((i) => i.id === id));
        const starts: Record<string, Vec2> = {};
        for (const id of itemIds) {
          const it = pl.items.find((i) => i.id === id)!;
          starts[id] = { ...it.position };
        }
        gestureRef.current = {
          type: 'groupMove',
          itemIds,
          grabWorld: world,
          starts,
          before: pl,
          moved: false,
        };
        setGestureKind('groupMove');
        return;
      }

      if (!hit) {
        // 벽 부착 아이템 클릭 → 선택 + 드래그 이동
        const wallItemId = wallItemAt(pl, world);
        if (wallItemId) {
          setSelection([wallItemId]);
          setPostDrop(null);
          gestureRef.current = { type: 'wallItemMove', id: wallItemId, before: pl, moved: false };
          setGestureKind('wallItemMove');
          setWallMoveInvalid(false);
          return;
        }
        // 개구부(문·창) 클릭 → 선택. 이미 선택된 문을 다시 클릭하면 여닫기 토글
        const opening = openingNear(pl, world, tRef.current.s);
        if (opening) {
          if (
            opening.opening.kind === 'door' &&
            useStore.getState().selection.includes(opening.opening.id)
          ) {
            updatePlan((p) => toggleDoor(p, opening.opening.id));
          } else {
            setSelection([opening.opening.id]);
            setPostDrop(null);
          }
          return;
        }
        // 치수 주석 클릭 → 선택 (Delete로 삭제 가능)
        const dimId = dimensionNear(pl, world, tRef.current.s);
        if (dimId) {
          setSelection([dimId]);
          setPostDrop(null);
          return;
        }
        // 벽 클릭 → 선택 (끝점 핸들·몸통 드래그 편집)
        const nearWall = wallNear(pl, world, tRef.current.s, 10);
        if (nearWall) {
          setSelection([nearWall.wall.id]);
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

      if (g?.type === 'marquee') {
        setMarquee({ a: g.start, b: world });
        return;
      }

      if (g?.type === 'groupMove') {
        g.moved = true;
        const snap = useStore.getState().snapping;
        let delta = { x: world.x - g.grabWorld.x, y: world.y - g.grabWorld.y };
        if (snap.enabled) {
          const grid = snap.gridCm / 100;
          delta = { x: snapValue(delta.x, grid), y: snapValue(delta.y, grid) };
        }
        updatePlan(
          (p) => {
            // 시작 위치 기준으로 재계산 (누적 오차 방지)
            const items = p.items.map((i) => {
              const start = g.starts[i.id];
              if (!start) return i;
              const position = { x: start.x + delta.x, y: start.y + delta.y };
              return { ...i, position };
            });
            return { ...p, items };
          },
          { commit: false },
        );
        const after = useStore.getState().plans[useStore.getState().currentPlanId];
        const { collisions, blockedDoors } = groupProblems(after, g.itemIds);
        const leader = after.items.find((i) => i.id === g.itemIds[0]);
        setDrag({
          itemId: g.itemIds[0],
          groupIds: g.itemIds,
          ghost: leader?.position ?? world,
          snap: null,
          collisions,
          blockedDoors,
          isNew: false,
        });
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

      if (g?.type === 'wallEndpointMove') {
        g.moved = true;
        const before = g.before;
        const wall = before.walls.find((w) => w.id === g.wallId);
        if (!wall) return;
        const opposite = g.end === 'a' ? wall.b : wall.a;
        const pt = snapWallPoint(world, opposite);
        updatePlan(() => moveWallVertex(before, g.wallId, g.end, pt), { commit: false });
        return;
      }

      if (g?.type === 'wallBodyMove') {
        g.moved = true;
        const snap = useStore.getState().snapping;
        let delta = { x: world.x - g.grabWorld.x, y: world.y - g.grabWorld.y };
        if (snap.enabled) {
          const grid = snap.gridCm / 100;
          delta = { x: snapValue(delta.x, grid), y: snapValue(delta.y, grid) };
        }
        updatePlan(() => translateWall(g.before, g.wallId, delta), { commit: false });
        return;
      }

      if (g?.type === 'wallItemMove') {
        g.moved = true;
        const wi = (pl.wallItems ?? []).find((x) => x.id === g.id);
        if (!wi) return;
        const cat = catalogById.get(wi.catalogId);
        const near = wallNear(pl, world, tRef.current.s, 40);
        if (near && cat) {
          const t = clampWallT(pl, near.wall.id, near.t, cat.size.w);
          const p = { x: near.wall.a.x + (near.wall.b.x - near.wall.a.x) * t, y: near.wall.a.y + (near.wall.b.y - near.wall.a.y) * t };
          const nx = -(near.wall.b.y - near.wall.a.y);
          const ny = near.wall.b.x - near.wall.a.x;
          const side: 'front' | 'back' =
            (world.x - p.x) * nx + (world.y - p.y) * ny >= 0 ? 'front' : 'back';
          updatePlan((plan) => moveWallItem(plan, g.id, { wallId: near.wall.id, t, side }), {
            commit: false,
          });
          setWallMoveInvalid(!canPlaceWallItem(pl, near.wall.id, t, wi.catalogId, wi.id));
        }
        return;
      }

      // 제스처 없음 — hover 상태 갱신
      if (placingCatalogId) {
        // 벽 부착 아이템: 가까운 벽에 스냅되는 고스트
        if (isWallCatalogItem(placingCatalogId)) {
          const cat = catalogById.get(placingCatalogId);
          const near = wallNear(pl, world, tRef.current.s, 40);
          if (near && cat) {
            const t = clampWallT(pl, near.wall.id, near.t, cat.size.w);
            const p = { x: near.wall.a.x + (near.wall.b.x - near.wall.a.x) * t, y: near.wall.a.y + (near.wall.b.y - near.wall.a.y) * t };
            const nx = -(near.wall.b.y - near.wall.a.y);
            const ny = near.wall.b.x - near.wall.a.x;
            const side: 'front' | 'back' =
              (world.x - p.x) * nx + (world.y - p.y) * ny >= 0 ? 'front' : 'back';
            setWallGhost({
              catalogId: placingCatalogId,
              wallId: near.wall.id,
              t,
              side,
              valid: canPlaceWallItem(pl, near.wall.id, t, placingCatalogId),
            });
          } else {
            setWallGhost(null);
          }
          return;
        }
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
        setHoverDoor(!hover && openingNear(pl, world, tRef.current.s) != null);
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
      if (g.type === 'marquee') {
        const m = marqueeRef.current;
        setMarquee(null);
        if (m) {
          const ids = itemsInRect(planRef.current, m.a, m.b);
          if (ids.length > 0) setSelection(ids);
        }
        return;
      }
      if (g.type === 'wallEndpointMove' || g.type === 'wallBodyMove') {
        if (g.moved) pushHistory(g.before);
        return;
      }
      if (g.type === 'wallItemMove') {
        if (g.moved) {
          if (wallMoveInvalidRef.current) {
            // 개구부/타 아이템과 겹침 → 원위치 복원 (배치 금지 정책)
            updatePlan(() => g.before, { commit: false });
          } else {
            pushHistory(g.before);
          }
        }
        setWallMoveInvalid(false);
        return;
      }
      if (g.type === 'groupMove') {
        if (g.moved) {
          pushHistory(g.before);
          // roomId 재배정 (비커밋 마무리 패치)
          updatePlan(
            (p) => ({
              ...p,
              items: p.items.map((i) =>
                g.itemIds.includes(i.id)
                  ? { ...i, roomId: roomAt(p.rooms, i.position)?.id ?? i.roomId }
                  : i,
              ),
            }),
            { commit: false },
          );
        }
        setDrag(null);
        return;
      }
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
      // 입력 라우팅 규칙: 오버레이(패널) 위의 휠은 패널 스크롤 몫 — 캔버스 줌 금지
      if (!wheelTargetsCanvas(e.target as Element)) return;
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
          setWallGhost(null);
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
    if (isWallCatalogItem(placingCatalogId)) return null; // 벽 부착은 wallGhost 경로
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
        marquee={marquee}
        wallItemGhost={wallGhost}
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
