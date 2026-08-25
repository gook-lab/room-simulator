import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib';
import './walkthrough.css';
import type { Plan, Vec2 } from '../../model/types';
import { catalogById, formatPrice } from '../../model/catalog';
import { roomAt } from '../../model/geometry';
import {
  isDoorOpen,
  isInteractiveItem,
  isPowered,
  toggleDoor,
  togglePower,
} from '../../model/interactions3d';
import { useCurrentPlan, useStore } from '../../state/store';
import { ViewTabs } from '../../components/ViewTabs';
import { CanvasBoundary } from '../three/CanvasBoundary';
import { PlanScene } from '../three/PlanScene';
import { PLAYER_RADIUS, buildColliders, moveAndSlide } from '../three/collision';
import { toggleDayNight } from '../three/lighting';
import { Minimap, type PlayerPose } from './Minimap';
import { hotkeyAllowed, movementAllowed } from './menu';

const WALK_SPEED = 1.4;
const SPRINT_SPEED = 3.0;

function defaultSpawn(plan: Plan, selection: string[] = []): Vec2 {
  // 선택된 방 > 가장 큰 방 중심으로 스폰
  const selected = plan.rooms.find((r) => selection.includes(r.id));
  const target = selected ?? [...plan.rooms].sort((a, b) => b.areaSqm - a.areaSqm)[0];
  if (!target) return { x: 1, y: 1 };
  const c = target.polygon.reduce(
    (acc, p) => ({ x: acc.x + p.x / target.polygon.length, y: acc.y + p.y / target.polygon.length }),
    { x: 0, y: 0 },
  );
  return c;
}

type GazeInfo = { kind: 'item' | 'door'; id: string; distance: number } | null;

function Player({
  plan,
  poseRef,
  furnitureGroupRef,
  doorGroupRef,
  onGaze,
  editOpen,
}: {
  plan: Plan;
  poseRef: React.MutableRefObject<PlayerPose>;
  furnitureGroupRef: React.RefObject<THREE.Group>;
  doorGroupRef: React.RefObject<THREE.Group>;
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

    // 이동 — 메뉴(커서 모드) 중에는 정지 (Tab=메뉴+커서 모드 계약)
    if (movementAllowed(document.pointerLockElement != null, editOpen)) {
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

    // 응시 레이캐스트 (3m) — 가구 + 문짝
    const fGroup = furnitureGroupRef.current;
    const dGroup = doorGroupRef.current;
    if (fGroup || dGroup) {
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      raycaster.far = 3;
      const targets = [...(fGroup?.children ?? []), ...(dGroup?.children ?? [])];
      const hits = raycaster.intersectObjects(targets, true);
      let found: GazeInfo = null;
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData.itemId && !obj.userData.openingId) obj = obj.parent;
        if (obj?.userData.itemId) {
          found = { kind: 'item', id: obj.userData.itemId as string, distance: hit.distance };
          break;
        }
        if (obj?.userData.openingId) {
          found = { kind: 'door', id: obj.userData.openingId as string, distance: hit.distance };
          break;
        }
      }
      const prev = lastGaze.current;
      const changed =
        (found === null) !== (prev === null) ||
        (found &&
          prev &&
          (found.id !== prev.id ||
            found.kind !== prev.kind ||
            Math.abs(found.distance - prev.distance) > 0.1));
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
      // 메뉴(커서 모드) 중에는 핫키 무시 — 마우스 조작 전용
      if (!hotkeyAllowed(document.pointerLockElement != null)) return;
      if (e.code === 'Space') {
        const cur = useStore.getState().viewer.eyeHeight;
        setViewer({ eyeHeight: cur === 1.6 ? 1.15 : 1.6 });
      } else if (e.code === 'KeyP') {
        const url = gl.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `roomcast-${Date.now()}.png`;
        a.click();
      } else if (e.code === 'KeyE' && gaze?.kind === 'item') {
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
  const selection = useStore((s) => s.selection);

  const poseRef = useRef<PlayerPose>({
    pos: spawn?.pos ?? defaultSpawn(plan, selection),
    yawDeg: spawn?.yawDeg ?? 0,
  });
  const furnitureGroupRef = useRef<THREE.Group>(null!);
  const doorGroupRef = useRef<THREE.Group>(null!);
  const controlsRef = useRef<PointerLockControlsImpl>(null!);
  const [locked, setLocked] = useState(false);
  const [gaze, setGaze] = useState<GazeInfo>(null);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [pose, setPose] = useState<PlayerPose>(poseRef.current);
  const [showKeymap, setShowKeymap] = useState(false);

  // 미니맵/방 이름 10fps 갱신
  useEffect(() => {
    const t = setInterval(() => setPose({ pos: { ...poseRef.current.pos }, yawDeg: poseRef.current.yawDeg }), 100);
    return () => clearInterval(t);
  }, []);

  // 메뉴(커서 모드)에서 Esc → 메뉴 닫고 이동 모드 복귀 시도
  // (브라우저가 Esc 언락 직후 재락을 쿨다운으로 거부하면 메뉴 유지 — Tab/클릭으로 복귀)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.pointerLockElement && !editItemId) {
        try {
          controlsRef.current?.lock();
        } catch {
          // 락 쿨다운 — 무시
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editItemId]);

  // 락 상태에서 클릭 → 응시 중인 상호작용 대상 반응 (조명·TV on/off, 문 여닫기)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !document.pointerLockElement || !gaze) return;
      if (gaze.kind === 'door') {
        updatePlan((pl) => toggleDoor(pl, gaze.id));
        return;
      }
      const item = plan.items.find((i) => i.id === gaze.id);
      if (!item || !isInteractiveItem(item.catalogId)) return;
      updatePlan((pl) => togglePower(pl, gaze.id));
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
      const target = gaze?.kind === 'item' ? gaze.id : null;
      if (target) controlsRef.current?.unlock();
      return target;
    });
  }, [gaze]);

  const gazeItem = gaze?.kind === 'item' ? plan.items.find((i) => i.id === gaze.id) : null;
  const gazeCat = gazeItem ? catalogById.get(gazeItem.catalogId) : null;
  const gazeDoor =
    gaze?.kind === 'door' ? plan.openings.find((o) => o.id === gaze.id) : null;
  const editItem = editItemId ? plan.items.find((i) => i.id === editItemId) : null;
  const editCat = editItem ? catalogById.get(editItem.catalogId) : null;
  const currentRoom = roomAt(plan.rooms, pose.pos);

  // 방 없는 도면은 워크스루 진입 불가 — 걸을 공간이 없어 검은 화면(무한 로드처럼 보임)이 됨
  if (plan.rooms.length === 0) {
    return (
      <div className="walkthrough">
        <div className="hud">
          <div className="hud__tabs">
            <ViewTabs dark />
          </div>
          <div className="wt-menu" style={{ width: 340 }}>
            <div className="wt-menu__title">아직 걸어볼 공간이 없습니다</div>
            <div className="wt-menu__hint">
              방(닫힌 벽)을 먼저 그리거나 템플릿에서 시작하면 3D 워크스루를 쓸 수 있습니다.
            </div>
            <div className="wt-menu__items">
              <button
                className="wt-menu__item wt-menu__item--primary"
                onClick={() => setView('2d')}
              >
                2D 스케치로 돌아가 방 그리기
              </button>
              <button className="wt-menu__item" onClick={() => setView('birdseye')}>
                조감도로 보기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            doorGroupRef={doorGroupRef}
            highlightItemId={
              locked && !editItemId && gazeItem && isInteractiveItem(gazeItem.catalogId)
                ? gazeItem.id
                : null
            }
            highlightOpeningId={locked && !editItemId && gazeDoor ? gazeDoor.id : null}
          />
          <Player
            plan={plan}
            poseRef={poseRef}
            furnitureGroupRef={furnitureGroupRef}
            doorGroupRef={doorGroupRef}
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
          에디터로 돌아가기
        </button>

        <button
          className="hud__esc hud__daynight"
          onClick={() => setLighting({ preset: toggleDayNight(viewer.lighting.preset) })}
          title="주간/야간 전환"
        >
          {viewer.lighting.preset === 'night' ? '주간으로' : '야간으로'}
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

        {locked && gazeDoor && !editItemId && (
          <div className="gaze-chip">
            <span className="gaze-chip__name">
              {gazeDoor.doorType === 'sliding' ? '미닫이문' : '문'}
            </span>
            <span className="gaze-chip__dist">{gaze!.distance.toFixed(1)} m</span>
            <span className="gaze-chip__action">
              클릭 · {isDoorOpen(gazeDoor) ? '닫기' : '열기'}
            </span>
          </div>
        )}

        {/* 인게임 메뉴 — Tab = 메뉴+커서 모드 (표시 중 이동 정지·마우스 자유) */}
        {!locked && !editItemId && (
          <div className="wt-menu">
            <div className="wt-menu__title">메뉴</div>
            <div className="wt-menu__hint">
              <span className="keycap">TAB</span> 닫고 이동 모드 · 패널은 마우스로 조작
            </div>
            <div className="wt-menu__items">
              <button
                className="wt-menu__item wt-menu__item--primary"
                onClick={() => controlsRef.current?.lock()}
              >
                ▶ 이동 모드로
              </button>
              <button className="wt-menu__item" onClick={() => setView('birdseye')}>
                조감도로 전환
              </button>
              <button
                className="wt-menu__item"
                onClick={() =>
                  setLighting({ preset: toggleDayNight(viewer.lighting.preset) })
                }
              >
                {viewer.lighting.preset === 'night' ? '주간으로 전환' : '야간으로 전환'}
              </button>
              <button className="wt-menu__item" onClick={() => setView('2d')}>
                2D 평면도로
              </button>
              <button
                className="wt-menu__item"
                aria-expanded={showKeymap}
                onClick={() => setShowKeymap((v) => !v)}
              >
                조작법 안내 {showKeymap ? '▴' : '▾'}
              </button>
            </div>
            {showKeymap && (
              <div className="wt-menu__keymap">
                <div className="wt-menu__keymap-title">워크스루</div>
                <div className="wt-menu__keymap-row">
                  <span className="keycap">W A S D</span> 이동 ·{' '}
                  <span className="keycap">SHIFT</span> 빠르게
                </div>
                <div className="wt-menu__keymap-row">
                  <span className="keycap">마우스</span> 시선 ·{' '}
                  <span className="keycap">SPACE</span> 앉기/서기
                </div>
                <div className="wt-menu__keymap-row">
                  <span className="keycap">클릭</span> 조명·TV·문 조작 ·{' '}
                  <span className="keycap">E</span> 응시 가구 편집
                </div>
                <div className="wt-menu__keymap-row">
                  <span className="keycap">P</span> 스크린샷 ·{' '}
                  <span className="keycap">TAB</span> 메뉴
                </div>
                <div className="wt-menu__keymap-title">조감도</div>
                <div className="wt-menu__keymap-row">
                  <span className="keycap">좌드래그</span> 회전 ·{' '}
                  <span className="keycap">휠</span> 줌 ·{' '}
                  <span className="keycap">우드래그</span> 팬
                </div>
              </div>
            )}
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
                <span className="keycap">TAB</span> {locked ? '메뉴' : '이동 모드'}
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
