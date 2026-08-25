import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import './birdseye.css';
import type { LightPreset } from '../../model/types';
import { useCurrentPlan, useStore } from '../../state/store';
import { ViewTabs } from '../../components/ViewTabs';
import { CanvasBoundary } from '../three/CanvasBoundary';
import { PlanScene } from '../three/PlanScene';
import { PRESET_LABELS, toggleDayNight } from '../three/lighting';
import { planCenter } from '../three/wallGeometry';
import { floorBaseY, floorsOfBuilding } from '../../model/floorStack';

const PRESETS: LightPreset[] = ['afternoon', 'sunset', 'overcast', 'night'];

/** 단면 모드: y=1.2m 수평 클리핑 */
function SectionClipping({ enabled }: { enabled: boolean }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.clippingPlanes = enabled
      ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2)]
      : [];
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl, enabled]);
  return null;
}

/** "이 시점에서 워크스루 시작" — 카메라 → 바닥 교점과 yaw 캡처 */
function CameraCapture({
  captureRef,
}: {
  captureRef: React.MutableRefObject<(() => { pos: { x: number; y: number }; yawDeg: number }) | null>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    captureRef.current = () => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const yawDeg = (Math.atan2(dir.z, dir.x) * 180) / Math.PI;
      // 카메라 시선이 바닥(y=0)과 만나는 지점
      let pos = { x: camera.position.x, y: camera.position.z };
      if (dir.y < -1e-3) {
        const t = -camera.position.y / dir.y;
        pos = { x: camera.position.x + dir.x * t, y: camera.position.z + dir.z * t };
      }
      return { pos, yawDeg };
    };
    return () => {
      captureRef.current = null;
    };
  }, [camera, captureRef]);
  return null;
}

export function Birdseye() {
  const plan = useCurrentPlan();
  const viewer = useStore((s) => s.viewer);
  const setLighting = useStore((s) => s.setLighting);
  const setDisplay = useStore((s) => s.setDisplay);
  const setViewer = useStore((s) => s.setViewer);
  const setView = useStore((s) => s.setView);
  const setWalkthroughSpawn = useStore((s) => s.setWalkthroughSpawn);

  const plans = useStore((s) => s.plans);
  // 층 스택: 같은 건물 층들을 y 오프셋(아래층 층고 합)으로 동시 렌더
  const floors = useMemo(() => floorsOfBuilding(plans, plan), [plans, plan]);
  const stacked = viewer.display.stackFloors && floors.length > 1;
  const currentBaseY = stacked ? floorBaseY(floors, plan.id) : 0;

  const center = useMemo(() => planCenter(plan), [plan]);
  const captureRef = useRef<(() => { pos: { x: number; y: number }; yawDeg: number }) | null>(null);
  const mode = viewer.birdseyeMode;
  // 워크스루와 대칭인 Tab 미니 메뉴 (Esc 로도 닫힘)
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setMenuOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 방위각 기반의 가벼운 일조 시간 데코 수치
  const daylight = useMemo(() => {
    const southness = Math.cos(((viewer.lighting.azimuthDeg - 180) * Math.PI) / 180);
    const totalMin = Math.round(200 + southness * 140); // 3h20m ~ 5h40m
    return `${Math.floor(totalMin / 60)}시간 ${totalMin % 60}분`;
  }, [viewer.lighting.azimuthDeg]);

  const azimuthLabel = useMemo(() => {
    const a = ((viewer.lighting.azimuthDeg % 360) + 360) % 360;
    if (a >= 135 && a < 225) return '남향';
    if (a >= 225 && a < 315) return '서향';
    if (a >= 45 && a < 135) return '동향';
    return '북향';
  }, [viewer.lighting.azimuthDeg]);

  const startWalkthrough = () => {
    const captured = captureRef.current?.();
    if (captured) setWalkthroughSpawn(captured);
    setView('walkthrough');
  };

  return (
    <div className="birdseye">
      <div className="birdseye__topbar">
        <ViewTabs />
      </div>
      <div className="birdseye__viewport">
        <div className="birdseye__canvas">
          <CanvasBoundary>
            <Canvas shadows={viewer.display.shadows} gl={{ antialias: true, alpha: true }}>
              {mode === 'ortho' ? (
                <OrthographicCamera
                  makeDefault
                  position={[center.x, 14, center.y + 0.01]}
                  zoom={55}
                  near={0.1}
                  far={60}
                />
              ) : (
                <PerspectiveCamera
                  makeDefault
                  position={[center.x + 5, mode === 'section' ? 6 : 9, center.y + 8]}
                  fov={40}
                  near={0.1}
                  far={100}
                />
              )}
              <OrbitControls
                target={[center.x, 0, center.y]}
                maxPolarAngle={Math.PI / 2.15}
                minDistance={3}
                maxDistance={30}
              />
              <SectionClipping enabled={mode === 'section'} />
              <CameraCapture captureRef={captureRef} />
              {(stacked ? floors : [plan]).map((f) => (
                <group
                  key={f.id}
                  position={[0, stacked ? floorBaseY(floors, f.id) : 0, 0]}
                >
                  <PlanScene
                    plan={f}
                    viewer={viewer}
                    showCeiling={!viewer.display.hideCeiling}
                    darkBackground={false}
                    lights={f.id === plan.id}
                  />
                </group>
              ))}
              {viewer.display.dimensionLabels &&
                plan.rooms.map((r) => {
                  const c = r.polygon.reduce(
                    (acc, p) => ({
                      x: acc.x + p.x / r.polygon.length,
                      y: acc.y + p.y / r.polygon.length,
                    }),
                    { x: 0, y: 0 },
                  );
                  return (
                    <Html key={r.id} position={[c.x, currentBaseY + 0.3, c.y]} center>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#4a544e',
                          background: 'rgba(255,255,255,0.85)',
                          padding: '3px 8px',
                          borderRadius: 5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.name} · {r.areaSqm.toFixed(1)}㎡
                      </div>
                    </Html>
                  );
                })}
            </Canvas>
          </CanvasBoundary>
        </div>

        {/* 조명 시뮬레이션 */}
        <aside className="be-panel be-light">
          <div className="be-panel__title">조명 시뮬레이션</div>
          <div className="be-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={viewer.lighting.preset === p ? 'is-active' : ''}
                onClick={() => setLighting({ preset: p })}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="be-slider">
            <div className="be-slider__label">
              <span>창 방향</span>
              <span className="be-slider__value">{azimuthLabel}</span>
            </div>
            <input
              type="range"
              className="slider slider--gold"
              min={90}
              max={270}
              value={viewer.lighting.azimuthDeg}
              onChange={(e) => setLighting({ azimuthDeg: Number(e.target.value) })}
            />
          </div>
          <div className="be-sun-card">
            <div className="be-sun-card__label">일조 시간</div>
            <div className="be-sun-card__value">{daylight}</div>
            <div className="be-sun-card__meta">거실 기준 · 6월</div>
          </div>
        </aside>

        {/* 표시 */}
        <aside className="be-panel be-display">
          <div className="be-panel__title">표시</div>
          {(
            [
              ['천장 숨기기', 'hideCeiling'],
              ['그림자', 'shadows'],
              ['치수 라벨', 'dimensionLabels'],
              ...(floors.length > 1 ? ([['모든 층 표시', 'stackFloors']] as const) : []),
            ] as const
          ).map(([label, key]) => (
            <div className="be-toggle-row" key={key}>
              <span>{label}</span>
              <button
                className={`toggle${viewer.display[key] ? ' is-on' : ''}`}
                aria-pressed={viewer.display[key]}
                onClick={() => setDisplay({ [key]: !viewer.display[key] })}
              />
            </div>
          ))}
        </aside>

        {/* 카메라 바 */}
        <div className="be-camera-bar">
          <span className="be-camera-bar__label">카메라</span>
          {(
            [
              ['dollhouse', '돌하우스'],
              ['section', '단면'],
              ['ortho', '평행 투상'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              className={`chip-toggle${mode === m ? ' is-active' : ''}`}
              onClick={() => setViewer({ birdseyeMode: m })}
            >
              {label}
            </button>
          ))}
          <span className="be-camera-bar__divider" />
          <button
            className="chip-toggle"
            onClick={() => setLighting({ preset: toggleDayNight(viewer.lighting.preset) })}
            title="주간/야간 전환"
          >
            {viewer.lighting.preset === 'night' ? '주간' : '야간'}
          </button>
          <span className="be-camera-bar__divider" />
          <button className="btn--text-accent" onClick={startWalkthrough}>
            이 시점에서 워크스루 시작
          </button>
          <span className="be-camera-bar__divider" />
          <button className="chip-toggle" onClick={() => setMenuOpen((v) => !v)}>
            TAB 메뉴
          </button>
        </div>

        {/* Tab 미니 메뉴 — 워크스루 인게임 메뉴와 대칭 */}
        {menuOpen && (
          <div className="be-menu">
            <div className="be-menu__title">메뉴</div>
            <div className="be-menu__hint">TAB / ESC — 닫기</div>
            <div className="be-menu__items">
              <button className="be-menu__item be-menu__item--primary" onClick={startWalkthrough}>
                ▶ 이 시점에서 워크스루
              </button>
              <button className="be-menu__item" onClick={() => setView('2d')}>
                2D 평면도로
              </button>
              <button
                className="be-menu__item"
                onClick={() => setLighting({ preset: toggleDayNight(viewer.lighting.preset) })}
              >
                {viewer.lighting.preset === 'night' ? '주간으로 전환' : '야간으로 전환'}
              </button>
            </div>
            <div className="be-menu__keymap">
              <div className="be-menu__keymap-title">조감도 조작법</div>
              <div className="be-menu__keymap-row">
                <span className="keycap">좌드래그</span> 회전 · <span className="keycap">휠</span> 줌 ·{' '}
                <span className="keycap">우드래그</span> 팬
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
