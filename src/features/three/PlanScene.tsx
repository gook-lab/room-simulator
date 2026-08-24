import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { PlacedItem, Plan, ViewerState } from '../../model/types';
import { catalogById } from '../../model/catalog';
import { isPowered } from '../../model/interactions3d';
import { darken, lighten } from '../editor2d/symbols';
import { LIGHT_PRESETS } from './lighting';
import { planCenter, wallBoxes, wallLength } from './wallGeometry';

const FLOOR_3D: Record<string, string> = {
  living: '#c9ae86',
  kitchen: '#ddd8ce',
  bath: '#dce9e4',
};

const WALL_COLOR = '#eae1d2';
const CEILING_COLOR = '#e6dccc';

function Floors({ plan }: { plan: Plan }) {
  const shapes = useMemo(
    () =>
      plan.rooms.map((r) => {
        const shape = new THREE.Shape();
        r.polygon.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        shape.closePath();
        return { room: r, shape };
      }),
    [plan.rooms],
  );
  return (
    <group>
      {shapes.map(({ room, shape }) => (
        <mesh
          key={room.id}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
        >
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial
            color={FLOOR_3D[room.floor] ?? FLOOR_3D.living}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function Walls({ plan }: { plan: Plan }) {
  const parts = useMemo(() => {
    const solid: { pos: [number, number, number]; size: [number, number, number]; rotY: number }[] = [];
    const glass: typeof solid = [];
    for (const wall of plan.walls) {
      const len = wallLength(wall);
      if (len < 1e-6) continue;
      const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
      for (const box of wallBoxes(wall, plan.openings)) {
        const mid = (box.start + box.end) / 2;
        const cx = wall.a.x + Math.cos(angle) * mid;
        const cz = wall.a.y + Math.sin(angle) * mid;
        const entry = {
          pos: [cx, (box.bottom + box.top) / 2, cz] as [number, number, number],
          size: [
            box.end - box.start,
            box.top - box.bottom,
            box.kind === 'glass' ? 0.04 : wall.thickness,
          ] as [number, number, number],
          rotY: -angle,
        };
        (box.kind === 'glass' ? glass : solid).push(entry);
      }
    }
    return { solid, glass };
  }, [plan.walls, plan.openings]);

  return (
    <group>
      {parts.solid.map((p, i) => (
        <mesh key={`s${i}`} position={p.pos} rotation={[0, p.rotY, 0]} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
        </mesh>
      ))}
      {parts.glass.map((p, i) => (
        <mesh key={`g${i}`} position={p.pos} rotation={[0, p.rotY, 0]}>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#eaf2f6" transparent opacity={0.32} roughness={0.15} />
        </mesh>
      ))}
    </group>
  );
}

function Ceiling({ plan }: { plan: Plan }) {
  const shapes = useMemo(
    () =>
      plan.rooms.map((r) => {
        const shape = new THREE.Shape();
        r.polygon.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        shape.closePath();
        return { id: r.id, shape };
      }),
    [plan.rooms],
  );
  const height = plan.walls[0]?.height ?? 2.4;
  return (
    <group>
      {shapes.map(({ id, shape }) => (
        <mesh key={id} rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={CEILING_COLOR} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ===== 가구 3D ===== */

function Box({
  args,
  position,
  color,
  emissive,
  emissiveIntensity,
}: {
  args: [number, number, number];
  position: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.8}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity ?? 0}
      />
    </mesh>
  );
}

function FurnitureMesh({
  item,
  lampIntensity,
  highlighted = false,
}: {
  item: PlacedItem;
  lampIntensity: number;
  highlighted?: boolean;
}) {
  const cat = catalogById.get(item.catalogId);
  const shape = cat?.shape ?? 'rect-table';
  const { w, d, h } = item.size;
  const c = item.variant.color;
  const cDark = darken(c, 0.15);
  // 전원 꺼진 조명은 발광·광원 제거
  const eff = isPowered(item) ? lampIntensity : 0;

  let body: React.ReactNode = null;
  switch (shape) {
    case 'sofa': {
      const seatH = h * 0.55;
      const armW = Math.min(0.14, w * 0.09);
      body = (
        <group>
          <Box args={[w, seatH, d]} position={[0, seatH / 2, 0]} color={c} />
          <Box args={[w, h - seatH, d * 0.26]} position={[0, seatH + (h - seatH) / 2, -d / 2 + d * 0.13]} color={cDark} />
          <Box args={[armW, h * 0.85, d]} position={[-w / 2 + armW / 2, (h * 0.85) / 2, 0]} color={cDark} />
          <Box args={[armW, h * 0.85, d]} position={[w / 2 - armW / 2, (h * 0.85) / 2, 0]} color={cDark} />
        </group>
      );
      break;
    }
    case 'chair': {
      const seatH = h * 0.55;
      body = (
        <group>
          <Box args={[w, seatH, d]} position={[0, seatH / 2, 0]} color={c} />
          <Box args={[w * 0.9, h - seatH, d * 0.22]} position={[0, seatH + (h - seatH) / 2, -d / 2 + d * 0.11]} color={cDark} />
        </group>
      );
      break;
    }
    case 'round-table':
      body = (
        <group>
          <mesh position={[0, h - 0.02, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[w / 2, w / 2, 0.04, 32]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
          <mesh position={[0, (h - 0.04) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.06, h - 0.04, 12]} />
            <meshStandardMaterial color={cDark} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.015, 0]} castShadow>
            <cylinderGeometry args={[w / 5, w / 5, 0.03, 24]} />
            <meshStandardMaterial color={cDark} roughness={0.7} />
          </mesh>
        </group>
      );
      break;
    case 'rect-table': {
      const legT = 0.05;
      body = (
        <group>
          <Box args={[w, 0.04, d]} position={[0, h - 0.02, 0]} color={c} />
          {[
            [-w / 2 + legT, -d / 2 + legT],
            [w / 2 - legT, -d / 2 + legT],
            [w / 2 - legT, d / 2 - legT],
            [-w / 2 + legT, d / 2 - legT],
          ].map(([x, z], i) => (
            <Box key={i} args={[legT, h - 0.04, legT]} position={[x, (h - 0.04) / 2, z]} color={cDark} />
          ))}
        </group>
      );
      break;
    }
    case 'shelf':
      body = (
        <group>
          <Box args={[w, h, d]} position={[0, h / 2, 0]} color={c} />
          {[0.25, 0.5, 0.75].map((f) => (
            <Box key={f} args={[w * 0.94, 0.02, d * 0.9]} position={[0, h * f, d * 0.03]} color={cDark} />
          ))}
        </group>
      );
      break;
    case 'console':
    case 'wardrobe':
      body = (
        <group>
          <Box args={[w, h, d]} position={[0, h / 2, 0]} color={c} />
          <Box args={[0.015, h * 0.92, d + 0.005]} position={[0, h / 2, 0]} color={cDark} />
        </group>
      );
      break;
    case 'bed': {
      const baseH = h * 0.35;
      const matH = h * 0.28;
      body = (
        <group>
          <Box args={[w, baseH, d]} position={[0, baseH / 2, 0]} color={darken(c, 0.25)} />
          <Box args={[w * 0.97, matH, d * 0.97]} position={[0, baseH + matH / 2, 0]} color={lighten(c, 0.25)} />
          <Box args={[w * 0.36, 0.08, d * 0.14]} position={[-w * 0.23, baseH + matH + 0.04, -d / 2 + d * 0.12]} color="#e2e8f1" />
          <Box args={[w * 0.36, 0.08, d * 0.14]} position={[w * 0.23, baseH + matH + 0.04, -d / 2 + d * 0.12]} color="#e2e8f1" />
          <Box args={[w, h, 0.05]} position={[0, h / 2, -d / 2 - 0.02]} color={darken(c, 0.3)} />
        </group>
      );
      break;
    }
    case 'rug':
      body = (
        <mesh position={[0, 0.008, 0]} receiveShadow>
          <boxGeometry args={[w, 0.016, d]} />
          <meshStandardMaterial color={c} roughness={1} />
        </mesh>
      );
      break;
    case 'floor-lamp':
      body = (
        <group>
          <mesh position={[0, 0.015, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.16, 0.03, 20]} />
            <meshStandardMaterial color="#3d4742" roughness={0.6} />
          </mesh>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.015, 0.015, h - 0.35, 8]} />
            <meshStandardMaterial color="#3d4742" roughness={0.6} />
          </mesh>
          <mesh position={[0, h - 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.17, 0.3, 20, 1, true]} />
            <meshStandardMaterial
              color="#efd9a8"
              emissive="#ffe9b8"
              emissiveIntensity={eff * 0.9}
              side={THREE.DoubleSide}
              roughness={0.9}
            />
          </mesh>
          <pointLight
            position={[0, h - 0.18, 0]}
            color="#ffe9b8"
            intensity={eff}
            distance={6}
            decay={1.8}
          />
        </group>
      );
      break;
    case 'pendant-lamp': {
      const ceilingH = 2.4;
      body = (
        <group>
          <mesh position={[0, (ceilingH + (ceilingH - 0.6)) / 2, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.6, 6]} />
            <meshStandardMaterial color="#3d4742" />
          </mesh>
          <mesh position={[0, ceilingH - 0.6 - 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.05, w / 2, 0.22, 24, 1, true]} />
            <meshStandardMaterial
              color="#efd9a8"
              emissive="#ffe9b8"
              emissiveIntensity={eff * 0.9}
              side={THREE.DoubleSide}
              roughness={0.9}
            />
          </mesh>
          <pointLight
            position={[0, ceilingH - 0.85, 0]}
            color="#ffe9b8"
            intensity={eff * 1.2}
            distance={7}
            decay={1.8}
          />
        </group>
      );
      break;
    }
    case 'desk': {
      const panelT = 0.03;
      body = (
        <group>
          <Box args={[w, 0.04, d]} position={[0, h - 0.02, 0]} color={c} />
          <Box args={[panelT, h - 0.04, d * 0.9]} position={[-w / 2 + panelT / 2, (h - 0.04) / 2, 0]} color={cDark} />
          <Box args={[panelT, h - 0.04, d * 0.9]} position={[w / 2 - panelT / 2, (h - 0.04) / 2, 0]} color={cDark} />
          {/* 서랍 유닛 */}
          <Box args={[w * 0.26, h * 0.5, d * 0.85]} position={[w * 0.32, h - 0.04 - h * 0.25, 0]} color={darken(c, 0.08)} />
        </group>
      );
      break;
    }
    case 'dining-set': {
      const tw = w * 0.55;
      const td = d * 0.55;
      const legT = 0.05;
      const chairSeatH = 0.45;
      const chairW = w * 0.2;
      const chairD = d * 0.16;
      const chairs: [number, number, number][] = [
        [0, -d / 2 + chairD / 2 + 0.02, 0],
        [0, d / 2 - chairD / 2 - 0.02, 180],
        [-w / 2 + chairD / 2 + 0.02, 0, 270],
        [w / 2 - chairD / 2 - 0.02, 0, 90],
      ];
      body = (
        <group>
          <Box args={[tw, 0.04, td]} position={[0, h - 0.02, 0]} color={c} />
          {[
            [-tw / 2 + legT, -td / 2 + legT],
            [tw / 2 - legT, -td / 2 + legT],
            [tw / 2 - legT, td / 2 - legT],
            [-tw / 2 + legT, td / 2 - legT],
          ].map(([x, z], i) => (
            <Box key={i} args={[legT, h - 0.04, legT]} position={[x, (h - 0.04) / 2, z]} color={cDark} />
          ))}
          {chairs.map(([x, z, rot], i) => (
            <group key={`c${i}`} position={[x, 0, z]} rotation={[0, (-rot * Math.PI) / 180, 0]}>
              <Box args={[chairW, chairSeatH, chairD]} position={[0, chairSeatH / 2, 0]} color={darken(c, 0.1)} />
              <Box args={[chairW, 0.4, 0.03]} position={[0, chairSeatH + 0.2, -chairD / 2 + 0.015]} color={cDark} />
            </group>
          ))}
        </group>
      );
      break;
    }
    case 'plant': {
      const potH = h * 0.28;
      const foliageBase = potH + h * 0.18;
      body = (
        <group>
          <mesh position={[0, potH / 2, 0]} castShadow>
            <cylinderGeometry args={[w * 0.32, w * 0.26, potH, 18]} />
            <meshStandardMaterial color={c} roughness={0.85} />
          </mesh>
          <mesh position={[0, potH + (h - potH) * 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.015, 0.025, (h - potH) * 0.6, 8]} />
            <meshStandardMaterial color="#7a6248" roughness={0.9} />
          </mesh>
          {[
            [0, foliageBase + (h - foliageBase) * 0.55, 0, 0.5],
            [w * 0.22, foliageBase + (h - foliageBase) * 0.3, w * 0.1, 0.36],
            [-w * 0.2, foliageBase + (h - foliageBase) * 0.42, -w * 0.12, 0.4],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} castShadow>
              <sphereGeometry args={[(w / 2) * (r * 2), 12, 10]} />
              <meshStandardMaterial color={i === 1 ? '#87a08f' : '#8fa396'} roughness={1} />
            </mesh>
          ))}
        </group>
      );
      break;
    }
    default:
      body = <Box args={[w, h, d]} position={[0, h / 2, 0]} color={c} />;
  }

  return (
    <group
      position={[item.position.x, 0, item.position.y]}
      rotation={[0, -(item.rotationDeg * Math.PI) / 180, 0]}
      userData={{ itemId: item.id }}
    >
      {body}
      {highlighted && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w + 0.08, h + 0.08, d + 0.08]} />
          <meshBasicMaterial
            color="#0e9f6e"
            wireframe
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ===== 조명 리그 (프리셋 0.4s 보간) ===== */

function LightRig({
  plan,
  viewer,
  setBackground,
}: {
  plan: Plan;
  viewer: ViewerState;
  setBackground: boolean;
}) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const { scene } = useThree();
  const center = useMemo(() => planCenter(plan), [plan]);
  const bgRef = useRef(new THREE.Color(LIGHT_PRESETS[viewer.lighting.preset].background));

  useFrame((_, dt) => {
    const spec = LIGHT_PRESETS[viewer.lighting.preset];
    const k = Math.min(1, dt / 0.13); // ≈0.4s 정착
    const sun = sunRef.current;
    const amb = ambRef.current;
    if (sun && targetRef.current) {
      // 방위각(창 방향)만큼 태양 방향을 수평 회전
      const az = ((viewer.lighting.azimuthDeg - 180) * Math.PI) / 180;
      const cos = Math.cos(az);
      const sin = Math.sin(az);
      const dx = spec.sunDir[0] * cos - spec.sunDir[2] * sin;
      const dz = spec.sunDir[0] * sin + spec.sunDir[2] * cos;
      const targetPos = new THREE.Vector3(center.x + dx, spec.sunDir[1], center.y + dz);
      sun.position.lerp(targetPos, k);
      sun.color.lerp(new THREE.Color(spec.sunColor), k);
      sun.intensity += (spec.sunIntensity - sun.intensity) * k;
      targetRef.current.position.set(center.x, 0, center.y);
      sun.target = targetRef.current;
    }
    if (amb) {
      amb.color.lerp(new THREE.Color(spec.ambientColor), k);
      amb.intensity += (spec.ambientIntensity - amb.intensity) * k;
    }
    if (setBackground) {
      bgRef.current.lerp(new THREE.Color(spec.background), k);
      scene.background = bgRef.current;
    }
  });

  return (
    <group>
      <ambientLight ref={ambRef} intensity={0.7} />
      <directionalLight
        ref={sunRef}
        castShadow={viewer.display.shadows}
        intensity={1.2}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      <object3D ref={targetRef} />
    </group>
  );
}

export function PlanScene({
  plan,
  viewer,
  showCeiling,
  furnitureGroupRef,
  darkBackground = true,
  highlightItemId = null,
}: {
  plan: Plan;
  viewer: ViewerState;
  showCeiling: boolean;
  furnitureGroupRef?: React.RefObject<THREE.Group>;
  darkBackground?: boolean;
  /** 응시 중 상호작용 가능 사물 하이라이트 */
  highlightItemId?: string | null;
}) {
  const spec = LIGHT_PRESETS[viewer.lighting.preset];
  const lampIntensity = spec.lampBase * viewer.lighting.indoorIntensity * 1.6;
  return (
    <group>
      <LightRig plan={plan} viewer={viewer} setBackground={darkBackground} />
      <Floors plan={plan} />
      <Walls plan={plan} />
      {showCeiling && <Ceiling plan={plan} />}
      <group ref={furnitureGroupRef}>
        {plan.items.map((item) => (
          <FurnitureMesh
            key={item.id}
            item={item}
            lampIntensity={lampIntensity}
            highlighted={item.id === highlightItemId}
          />
        ))}
      </group>
    </group>
  );
}
