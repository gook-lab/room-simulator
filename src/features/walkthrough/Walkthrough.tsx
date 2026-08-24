import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib';
import './walkthrough.css';
import type { Plan, Vec2 } from '../../model/types';
import { catalogById, formatPrice } from '../../model/catalog';
import { roomAt } from '../../model/geometry';
import { isInteractiveItem, isPowered, togglePower } from '../../model/interactions3d';
import { useCurrentPlan, useStore } from '../../state/store';
import { ViewTabs } from '../../components/ViewTabs';
import { CanvasBoundary } from '../three/CanvasBoundary';
import { PlanScene } from '../three/PlanScene';
import { PLAYER_RADIUS, buildColliders, moveAndSlide } from '../three/collision';
import { Minimap, type PlayerPose } from './Minimap';

const WALK_SPEED = 1.4;
const SPRINT_SPEED = 3.0;

function defaultSpawn(plan: Plan): Vec2 {
  const biggest = [...plan.rooms].sort((a, b) => b.areaSqm - a.areaSqm)[0];
  if (!biggest) return { x: 1, y: 1 };
  const c = biggest.polygon.reduce(
    (acc, p) => ({ x: acc.x + p.x / biggest.polygon.length, y: acc.y + p.y / biggest.polygon.length }),
    { x: 0, y: 0 },
  );
  return c;
}

type GazeInfo = { itemId: string; distance: number } | null;

function Player({
  plan,
  poseRef,
  furnitureGroupRef,
  onGaze,
  editOpen,
}: {
  plan: Plan;
  poseRef: React.MutableRefObject<PlayerPose>;
  furnitureGroupRef: React.RefObject<THREE.Group>;
  onGaze: (g: GazeInfo) => void;
  editOpen: boolean;
}) {
  const { camera } = useThree();
  const viewer = useStore((s) => s.viewer);
  const keys = useRef<Record<string, boolean>>({});
  const colliders = useMemo(() => buildColliders(plan), [plan]);
  const eyeRef = useRef(viewer.eyeHeight as number);
  const introRef = useRef(0); // 0→1 진입 트랜지션
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const lastGaze = useRef<GazeInfo>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const pose = poseRef.current;

    // 이동
    if (!editOpen) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const forward = new THREE.Vector2(dir.x, dir.z);
      if (forward.lengthSq() > 1e-6) forward.normalize();
      const right = new THREE.Vector2(-forward.y, forward.x);
      const move = new THREE.Vector2(0, 0);
      if (keys.current.KeyW) move.add(forward);
      if (keys.current.KeyS) move.sub(forward);
      if (keys.current.KeyD) move.add(right);
      if (keys.current.KeyA) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize();
        const speed = keys.current.ShiftLeft || keys.current.ShiftRight ? SPRINT_SPEED : WALK_SPEED;
        pose.pos = moveAndSlide(
          pose.pos,
          { x: move.x * speed * dt, y: move.y * speed * dt },
          colliders,
          PLAYER_RADIUS,
        );
      }
    }

    // 시점 높이 스무딩 + 진입 트랜지션 (위 → 눈높이, 0.6s)
    eyeRef.current += (viewer.eyeHeight - eyeRef.current) * Math.min(1, dt / 0.08);
    if (introRef.current < 1) {
      introRef.current = Math.min(1, introRef.current + dt / 0.6);
    }
    const e = 1 - Math.pow(1 - introRef.current, 3); // easeOutCubic
    const extraY = (1 - e) * 5;

    camera.position.set(pose.pos.x, eyeRef.current + extraY, pose.pos.y);

    // yaw 기록 (미니맵)
    const dir2 = new THREE.Vector3();
    camera.getWorldDirection(dir2);
    pose.yawDeg = (Math.atan2(dir2.z, dir2.x) * 180) / Math.PI;

    // FOV 반영
    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - viewer.lighting.fov) > 0.1) {
      cam.fov += (viewer.lighting.fov - cam.fov) * Math.min(1, dt / 0.1);
      cam.updateProjectionMatrix();
    }

    // 응시 레이캐스트 (3m)
    const group = furnitureGroupRef.current;
    if (group) {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      raycaster.far = 3;
      const hits = raycaster.intersectObjects(group.children, true);
      let found: GazeInfo = null;
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData.itemId) obj = obj.parent;
        if (obj?.userData.itemId) {
          found = { itemId: obj.userData.itemId as string, distance: hit.distance };
          break;
        }
      }
      const prev = lastGaze.current;
      const changed =
        (found === null) !== (prev === null) ||
        (found && prev && (found.itemId !== prev.itemId || Math.abs(found.distance - prev.distance) > 0.1));
      if (changed) {
        lastGaze.current = found;
        onGaze(found);
      }
    }
  });

  return null;
}

/** Space = 시점 높이 토글, P = 스크린샷, E = 응시 편집 */
function Hotkeys({
  gaze,
  onToggleEdit,
}: {
  gaze: GazeInfo;
  onToggleEdit: () => void;
}) {
  const { gl } = useThree();
  const setViewer = useStore((s) => s.setViewer);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const cur = useStore.getState().viewer.eyeHeight;
        setViewer({ eyeHeight: cur === 1.6 ? 1.15 : 1.6 });
      } else if (e.code === 'KeyP') {
        const url = gl.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `roomcast-${Date.now()}.png`;
        a.click();
      } else if (e.code === 'KeyE' && gaze) {
        onToggleEdit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gl, gaze, onToggleEdit, setViewer]);

  return null;
}

export function Walkthrough() {
  const plan = useCurrentPlan();
  const viewer = useStore((s) => s.viewer);
  const setView = useStore((s) => s.setView);
  const setLighting = useStore((s) => s.setLighting);
  const updatePlan = useStore((s) => s.updatePlan);
  const spawn = useStore((s) => s.walkthroughSpawn);

  const poseRef = useRef<PlayerPose>({
    pos: spawn?.pos ?? defaultSpawn(plan),
    yawDeg: spawn?.yawDeg ?? 0,
  });
  const furnitureGroupRef = useRef<THREE.Group>(null!);
  const controlsRef = useRef<PointerLockControlsImpl>(null!);
  const [locked, setLocked] = useState(false);
  const [gaze, setGaze] = useState<GazeInfo>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [pose, setPose] = useState<PlayerPose>(poseRef.current);

  // 미니맵/방 이름 10fps 갱신
  useEffect(() => {
    const t = setInterval(() => setPose({ pos: { ...poseRef.current.pos }, yawDeg: poseRef.current.yawDeg }), 100);
    return () => clearInterval(t);
  }, []);

  // 잠금 해제 상태에서 Esc → 에디터 복귀
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.pointerLockElement && !editItemId) {
        setView('2d');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView, editItemId]);

  // 락 상태에서 클릭 → 응시 중인 상호작용 사물 반응 (조명 on/off)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !document.pointerLockElement) return;
      const target = gaze?.itemId;
      if (!target) return;
      const item = plan.items.find((i) => i.id === target);
      if (!item || !isInteractiveItem(item.catalogId)) return;
      updatePlan((pl) => togglePower(pl, target));
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [gaze, plan.items, updatePlan]);

  // Tab: 포인터 락 ↔ 커서 모드 토글 (락 해제 상태에서 패널을 마우스로 조작)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      const c = controlsRef.current;
      if (!c) return;
      if (c.isLocked) c.unlock();
      else if (!editItemId) c.lock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editItemId]);

  const toggleEdit = useCallback(() => {
    setEditItemId((cur) => {
      if (cur) {
        controlsRef.current?.lock();
        return null;
      }
      const target = gaze?.itemId ?? null;
      if (target) controlsRef.current?.unlock();
      return target;
    });
  }, [gaze]);

  const gazeItem = gaze ? plan.items.find((i) => i.id === gaze.itemId) : null;
  const gazeCat = gazeItem ? catalogById.get(gazeItem.catalogId) : null;
  const editItem = editItemId ? plan.items.find((i) => i.id === editItemId) : null;
  const editCat = editItem ? catalogById.get(editItem.catalogId) : null;
  const currentRoom = roomAt(plan.rooms, pose.pos);

  return (
    <div className="walkthrough">
      <div className="walkthrough__canvas">
        <CanvasBoundary>
        <Canvas
          shadows={viewer.display.shadows}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ fov: viewer.lighting.fov, near: 0.05, far: 100 }}
        >
          <PlanScene
            plan={plan}
            viewer={viewer}
            showCeiling
            furnitureGroupRef={furnitureGroupRef}
            highlightItemId={
              locked && !editItemId && gazeItem && isInteractiveItem(gazeItem.catalogId)
                ? gazeItem.id
                : null
            }
          />
          <Player
            plan={plan}
            poseRef={poseRef}
            furnitureGroupRef={furnitureGroupRef}
            onGaze={setGaze}
            editOpen={editItemId != null}
          />
          <Hotkeys gaze={gaze} onToggleEdit={toggleEdit} />
          <PointerLockControls
            ref={controlsRef}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
        </Canvas>
        </CanvasBoundary>
      </div>
      <div className="walkthrough__vignette" />

      <div className="hud">
        <div className="hud__tabs">
          <ViewTabs dark />
        </div>

        <button className="hud__esc" onClick={() => setView('2d')}>
          <span className="keycap">ESC</span>
          에디터로 돌아가기
        </button>

        <div className="crosshair">
          <span />
          <span />
          <span />
          <span />
        </div>

        {locked && gazeItem && gazeCat && !editItemId && (
          <div className="gaze-chip">
            <span className="gaze-chip__name">{gazeCat.name}</span>
            <span className="gaze-chip__dist">{gaze!.distance.toFixed(1)} m</span>
            {isInteractiveItem(gazeItem.catalogId) && (
              <span className="gaze-chip__action">
                클릭 · {isPowered(gazeItem) ? '끄기' : '켜기'}
              </span>
            )}
            <span className="gaze-chip__action">E · 편집</span>
          </div>
        )}

        {!locked && !editItemId && (
          <div className="start-hint">
            커서 모드 — 패널을 마우스로 조작하거나, 클릭 / Tab 으로 이동 모드
          </div>
        )}

        {/* 미니맵 */}
        <div className="hud-panel hud__minimap">
          <div className="hud-panel__header">
            <span className="hud-panel__title">현재 위치</span>
            <span className="hud-panel__meta">{currentRoom?.name ?? '—'}</span>
          </div>
          <Minimap plan={plan} pose={pose} />
        </div>

        {/* 조작 안내 */}
        <div className="hud-panel hud__controls">
          <div className="controls-grid">
            <div className="wasd">
              <span />
              <span className="keycap">W</span>
              <span />
              <span className="keycap">A</span>
              <span className="keycap">S</span>
              <span className="keycap">D</span>
            </div>
            <div className="controls-rows">
              <div className="controls-row">
                <span className="keycap">마우스</span> 시선 회전
              </div>
              <div className="controls-row">
                <span className="keycap">SHIFT</span> 빠르게 이동
              </div>
              <div className="controls-row">
                <span className="keycap">SPACE</span> 앉은 시점 / 선 시점
              </div>
              <div className="controls-row">
                <span className="keycap">TAB</span> {locked ? '커서 모드' : '이동 모드'}
              </div>
            </div>
          </div>
        </div>

        {/* 조명·카메라 */}
        <div className="hud-panel hud__light">
          <div className="hud-panel__header">
            <span className="hud-panel__title">조명</span>
          </div>
          <div className="light-presets">
            {(['afternoon', 'sunset', 'night'] as const).map((p) => (
              <button
                key={p}
                className={viewer.lighting.preset === p ? 'is-active' : ''}
                onClick={() => setLighting({ preset: p })}
              >
                {p === 'afternoon' ? '오후 3시' : p === 'sunset' ? '해질녘' : '밤'}
              </button>
            ))}
          </div>
          <div className="hud-slider">
            <div className="hud-slider__label">
              <span>실내등 밝기</span>
              <span className="hud-slider__value">
                {Math.round(viewer.lighting.indoorIntensity * 100)}%
              </span>
            </div>
            <input
              type="range"
              className="slider slider--hud"
              min={0}
              max={100}
              value={Math.round(viewer.lighting.indoorIntensity * 100)}
              onChange={(e) => setLighting({ indoorIntensity: Number(e.target.value) / 100 })}
            />
          </div>
          <div className="hud-slider">
            <div className="hud-slider__label">
              <span>시야각</span>
              <span className="hud-slider__value">{Math.round(viewer.lighting.fov)}°</span>
            </div>
            <input
              type="range"
              className="slider slider--hud"
              min={50}
              max={100}
              value={Math.round(viewer.lighting.fov)}
              onChange={(e) => setLighting({ fov: Number(e.target.value) })}
            />
          </div>
          <div className="hud__divider" />
          <div className="hud-row-action">
            <span>스크린샷</span>
            <span className="keycap">P</span>
          </div>
        </div>

        {/* E 편집 패널 — 변경은 2D 모델(SSOT)에 즉시 반영 */}
        {editItem && editCat && (
          <div className="hud-panel gaze-edit">
            <div className="hud-panel__header">
              <span className="hud-panel__title">{editCat.name}</span>
              <span className="hud-panel__meta">{editCat.materialLabel}</span>
            </div>
            <div className="gaze-edit__swatches">
              {editCat.swatches.map((sw) => (
                <button
                  key={sw.id}
                  className={`swatch${editItem.variant.material === sw.id ? ' is-active' : ''}`}
                  style={{ background: sw.color }}
                  title={sw.label}
                  onClick={() =>
                    updatePlan((pl) => ({
                      ...pl,
                      items: pl.items.map((i) =>
                        i.id === editItem.id
                          ? { ...i, variant: { material: sw.id, color: sw.color } }
                          : i,
                      ),
                    }))
                  }
                />
              ))}
            </div>
            {isInteractiveItem(editItem.catalogId) && (
              <div className="gaze-edit__power">
                <span>전원</span>
                <button
                  className={`toggle${isPowered(editItem) ? ' is-on' : ''}`}
                  aria-pressed={isPowered(editItem)}
                  onClick={() => updatePlan((pl) => togglePower(pl, editItem.id))}
                />
              </div>
            )}
            <div className="gaze-edit__price">{formatPrice(editItem.price)}</div>
            <button className="gaze-edit__close" onClick={toggleEdit}>
              닫기 (E)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
