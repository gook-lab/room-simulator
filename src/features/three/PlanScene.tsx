import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Opening, PlacedItem, Plan, ViewerState, Wall } from '../../model/types';
import { catalogById } from '../../model/catalog';
import { DEFAULT_WALL_3D, floorColor3d, wallFaceColors } from '../../model/finishes';
import { isDoorOpen, isPowered } from '../../model/interactions3d';
import { mountBaseHeight } from '../../model/surfaces';
import { darken, lampPartColors, lighten } from '../editor2d/symbols';
import { LIGHT_PRESETS } from './lighting';
import { DOOR_HEIGHT, planCenter, wallBoxes, wallLength } from './wallGeometry';

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
            color={floorColor3d(room)}
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
    const solid: {
      pos: [number, number, number];
      size: [number, number, number];
      rotY: number;
      color: string;
      /** 양면 벽지가 다를 때 면별 패널 색 (로컬 +z / -z) */
      facePanels: { front: string; back: string } | null;
    }[] = [];
    const glass: {
      pos: [number, number, number];
      size: [number, number, number];
      rotY: number;
    }[] = [];
    for (const wall of plan.walls) {
      const len = wallLength(wall);
      if (len < 1e-6) continue;
      const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
      for (const box of wallBoxes(wall, plan.openings)) {
        const mid = (box.start + box.end) / 2;
        const cx = wall.a.x + Math.cos(angle) * mid;
        const cz = wall.a.y + Math.sin(angle) * mid;
        const pos = [cx, (box.bottom + box.top) / 2, cz] as [number, number, number];
        const size = [
          box.end - box.start,
          box.top - box.bottom,
          box.kind === 'glass' ? 0.04 : wall.thickness,
        ] as [number, number, number];
        if (box.kind === 'glass') {
          glass.push({ pos, size, rotY: -angle });
          continue;
        }
        // 벽지: 면별 색 해석 — 양면이 다르면 면 분리 패널로 렌더
        const faces = wallFaceColors(plan.rooms, wall, { x: cx, y: cz });
        const front = faces.front ?? DEFAULT_WALL_3D;
        const back = faces.back ?? DEFAULT_WALL_3D;
        solid.push({
          pos,
          size,
          rotY: -angle,
          color: front === back ? front : DEFAULT_WALL_3D,
          facePanels: front === back ? null : { front, back },
        });
      }
    }
    return { solid, glass };
  }, [plan.walls, plan.openings, plan.rooms]);

  return (
    <group>
      {parts.solid.map((p, i) => (
        <group key={`s${i}`} position={p.pos} rotation={[0, p.rotY, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={p.size} />
            <meshStandardMaterial color={p.color} roughness={0.9} />
          </mesh>
          {p.facePanels && (
            <>
              <mesh position={[0, 0, p.size[2] / 2 + 0.004]}>
                <planeGeometry args={[p.size[0], p.size[1]]} />
                <meshStandardMaterial color={p.facePanels.front} roughness={0.9} />
              </mesh>
              <mesh position={[0, 0, -p.size[2] / 2 - 0.004]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[p.size[0], p.size[1]]} />
                <meshStandardMaterial color={p.facePanels.back} roughness={0.9} />
              </mesh>
            </>
          )}
        </group>
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
      // 오픈 천장(보이드) 룸은 천장을 그리지 않는다 — 위층까지 뚫린 공간
      plan.rooms.filter((r) => !r.openCeiling).map((r) => {
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
  // 룸별 천장 높이 = 그 룸 벽들의 최대 높이 (낮은 파티션이 천장을 끌어내리지 않도록 max)
  const fallbackH = plan.defaultWallHeight ?? 2.4;
  const heightFor = (roomId: string) => {
    const room = plan.rooms.find((r) => r.id === roomId);
    const hs = (room?.wallIds ?? [])
      .map((wid) => plan.walls.find((w) => w.id === wid)?.height)
      .filter((h): h is number => h != null);
    return hs.length > 0 ? Math.max(...hs) : fallbackH;
  };
  return (
    <group>
      {shapes.map(({ id, shape }) => (
        <mesh key={id} rotation={[Math.PI / 2, 0, 0]} position={[0, heightFor(id), 0]}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={CEILING_COLOR} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ===== 문짝 (개폐 스윙) ===== */

function DoorLeaf({
  wall,
  opening,
  highlighted,
}: {
  wall: Wall;
  opening: Opening;
  highlighted: boolean;
}) {
  const sliding = opening.doorType === 'sliding';
  const groupRef = useRef<THREE.Group>(null);
  const leafRef = useRef<THREE.Group>(null);
  const angleRef = useRef(!sliding && isDoorOpen(opening) ? -deg2rad3(95) : 0);
  const slideRef = useRef(sliding && isDoorOpen(opening) ? opening.width * 0.92 : 0);
  const len = wallLength(wall);
  const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
  const wallAngle = Math.atan2(dir.y, dir.x);
  const half = opening.width / 2;
  const center = {
    x: wall.a.x + dir.x * opening.t * len,
    y: wall.a.y + dir.y * opening.t * len,
  };
  // 경첩: swing left → 구간 시작점, right → 구간 끝점
  const hinge =
    opening.swing === 'right'
      ? { x: center.x + dir.x * half, y: center.y + dir.y * half }
      : { x: center.x - dir.x * half, y: center.y - dir.y * half };
  const baseRotY = -wallAngle + (opening.swing === 'right' ? Math.PI : 0);

  useFrame((_, dt) => {
    const k = Math.min(1, dt / 0.12);
    if (sliding) {
      // 미닫이: 파킹측(-x, 경첩 뒤 벽면 위)으로 슬라이드
      const target = isDoorOpen(opening) ? -opening.width * 0.92 : 0;
      slideRef.current += (target - slideRef.current) * k;
      if (leafRef.current) leafRef.current.position.x = slideRef.current;
    } else {
      const target = isDoorOpen(opening) ? -deg2rad3(95) : 0;
      angleRef.current += (target - angleRef.current) * k;
      if (groupRef.current) {
        groupRef.current.rotation.y = baseRotY + angleRef.current;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={[hinge.x, 0, hinge.y]}
      rotation={[0, baseRotY + (sliding ? 0 : angleRef.current), 0]}
      userData={{ openingId: opening.id }}
    >
      <group ref={leafRef} position={[sliding ? slideRef.current : 0, 0, 0]}>
        <mesh
          position={[opening.width / 2, DOOR_HEIGHT / 2, sliding ? 0.055 : 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[opening.width, DOOR_HEIGHT, 0.045]} />
          <meshStandardMaterial color="#c9a882" roughness={0.75} />
        </mesh>
        {/* 손잡이 */}
        <mesh position={[opening.width * 0.86, 1.02, sliding ? 0.095 : 0.04]}>
          <sphereGeometry args={[0.025, 10, 8]} />
          <meshStandardMaterial color="#8a6a4c" roughness={0.4} />
        </mesh>
        {highlighted && (
          <mesh position={[opening.width / 2, DOOR_HEIGHT / 2, sliding ? 0.055 : 0]}>
            <boxGeometry args={[opening.width + 0.06, DOOR_HEIGHT + 0.06, 0.11]} />
            <meshBasicMaterial color="#0e9f6e" wireframe transparent opacity={0.45} depthWrite={false} />
          </mesh>
        )}
      </group>
      {/* 미닫이 상단 레일 */}
      {sliding && (
        <mesh position={[0, DOOR_HEIGHT + 0.03, 0.055]}>
          <boxGeometry args={[opening.width * 2, 0.05, 0.06]} />
          <meshStandardMaterial color="#8a6a4c" roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}

function deg2rad3(d: number): number {
  return (d * Math.PI) / 180;
}

function Doors({
  plan,
  doorGroupRef,
  highlightOpeningId,
}: {
  plan: Plan;
  doorGroupRef?: React.RefObject<THREE.Group>;
  highlightOpeningId: string | null;
}) {
  return (
    <group ref={doorGroupRef}>
      {plan.openings
        .filter((o) => o.kind === 'door')
        .map((o) => {
          const wall = plan.walls.find((w) => w.id === o.wallId);
          if (!wall || wallLength(wall) < 1e-6) return null;
          return (
            <DoorLeaf
              key={o.id}
              wall={wall}
              opening={o}
              highlighted={o.id === highlightOpeningId}
            />
          );
        })}
    </group>
  );
}

/* ===== 벽 부착 아이템 3D ===== */

function WallItemMesh({ plan, id }: { plan: Plan; id: string }) {
  const wi = (plan.wallItems ?? []).find((w) => w.id === id);
  const cat = wi ? catalogById.get(wi.catalogId) : undefined;
  const wall = wi ? plan.walls.find((w) => w.id === wi.wallId) : undefined;
  if (!wi || !cat || !wall) return null;
  const len = wallLength(wall);
  if (len < 1e-6) return null;
  const dir = { x: (wall.b.x - wall.a.x) / len, y: (wall.b.y - wall.a.y) / len };
  const normal = { x: -dir.y, y: dir.x };
  const sign = wi.side === 'front' ? 1 : -1;
  const p = {
    x: wall.a.x + dir.x * wi.t * len,
    y: wall.a.y + dir.y * wi.t * len,
  };
  const off = wall.thickness / 2 + cat.size.d / 2 + 0.005;
  const angle = Math.atan2(dir.y, dir.x);
  const rotY = -angle + (wi.side === 'back' ? Math.PI : 0);
  const { w, d, h } = cat.size;
  const c = wi.variant.color;

  let body: React.ReactNode;
  switch (cat.shape) {
    case 'wall-clock':
      body = (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[w / 2, w / 2, d, 24]} />
            <meshStandardMaterial color="#f2efe9" roughness={0.5} />
          </mesh>
          <mesh position={[0, h * 0.14, d / 2 + 0.002]}>
            <boxGeometry args={[0.012, h * 0.3, 0.004]} />
            <meshStandardMaterial color={darken(c, 0.2)} />
          </mesh>
          <mesh position={[w * 0.1, 0, d / 2 + 0.002]} rotation={[0, 0, -Math.PI / 3]}>
            <boxGeometry args={[0.008, h * 0.22, 0.004]} />
            <meshStandardMaterial color={darken(c, 0.2)} />
          </mesh>
        </group>
      );
      break;
    case 'wall-mirror':
      body = (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, d / 2 + 0.002]}>
            <planeGeometry args={[w - 0.06, h - 0.06]} />
            <meshStandardMaterial color="#dfeaf2" metalness={0.85} roughness={0.08} />
          </mesh>
        </group>
      );
      break;
    case 'wall-ac':
      // 벽걸이 에어컨 — 본체 박스 + 하단 송풍구 슬릿
      body = (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={c} roughness={0.4} />
          </mesh>
          <mesh position={[0, -h / 2 + 0.035, d / 2 + 0.002]}>
            <planeGeometry args={[w - 0.12, 0.045]} />
            <meshStandardMaterial color={darken(c, 0.3)} roughness={0.6} />
          </mesh>
        </group>
      );
      break;
    default: // frame
      body = (
        <group>
          <mesh castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0, d / 2 + 0.002]}>
            <planeGeometry args={[w - 0.07, h - 0.07]} />
            <meshStandardMaterial color="#cfd8ce" roughness={0.9} />
          </mesh>
        </group>
      );
  }

  return (
    <group
      position={[p.x + normal.x * off * sign, wi.heightM, p.y + normal.y * off * sign]}
      rotation={[0, rotY, 0]}
    >
      {body}
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
  baseY = 0,
}: {
  item: PlacedItem;
  lampIntensity: number;
  highlighted?: boolean;
  /** 표면 적층: 부모 상판 높이 (자식은 상판 위에 렌더) */
  baseY?: number;
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
    case 'floor-lamp': {
      const lp = lampPartColors(c);
      body = (
        <group>
          <mesh position={[0, 0.015, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.16, 0.03, 20]} />
            <meshStandardMaterial color={lp.body} roughness={0.6} />
          </mesh>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.015, 0.015, h - 0.35, 8]} />
            <meshStandardMaterial color={lp.body} roughness={0.6} />
          </mesh>
          <mesh position={[0, h - 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.17, 0.3, 20, 1, true]} />
            <meshStandardMaterial
              color={lp.glow}
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
    }
    case 'pendant-lamp': {
      const ceilingH = 2.4;
      const lp = lampPartColors(c);
      body = (
        <group>
          <mesh position={[0, (ceilingH + (ceilingH - 0.6)) / 2, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.6, 6]} />
            <meshStandardMaterial color={lp.body} />
          </mesh>
          <mesh position={[0, ceilingH - 0.6 - 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.05, w / 2, 0.22, 24, 1, true]} />
            <meshStandardMaterial
              color={lp.body}
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
    case 'tv': {
      const screenH = Math.min(h * 0.45, (w * 9) / 16);
      const screenY = h - screenH / 2;
      const on = isPowered(item);
      body = (
        <group>
          <mesh position={[0, 0.015, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.24, 0.03, 20]} />
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
          <Box args={[0.05, h - screenH, 0.05]} position={[0, (h - screenH) / 2, 0]} color={c} />
          {/* 스크린 (앞면 +z = 평면도 +y 방향) */}
          <mesh position={[0, screenY, 0.02]} castShadow>
            <boxGeometry args={[w, screenH, 0.035]} />
            <meshStandardMaterial color="#11181a" roughness={0.35} />
          </mesh>
          <mesh position={[0, screenY, 0.042]}>
            <planeGeometry args={[w * 0.94, screenH * 0.88]} />
            <meshStandardMaterial
              color={on ? '#aebfd6' : '#0c1113'}
              emissive="#dfe8ff"
              emissiveIntensity={on ? 1.1 : 0}
              roughness={0.3}
            />
          </mesh>
          {on && (
            <pointLight
              position={[0, screenY, 0.35]}
              color="#cfe0ff"
              intensity={0.4}
              distance={2.8}
              decay={1.8}
            />
          )}
        </group>
      );
      break;
    }
    case 'mirror': {
      const frameT = 0.04;
      body = (
        <group rotation={[(-8 * Math.PI) / 180, 0, 0]}>
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, frameT]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
          <mesh position={[0, h / 2, frameT / 2 + 0.002]}>
            <planeGeometry args={[w - 0.08, h - 0.08]} />
            <meshStandardMaterial color="#dfeaf2" metalness={0.85} roughness={0.08} />
          </mesh>
        </group>
      );
      break;
    }
    case 'fan': {
      const headR = w * 0.45;
      const headY = h - headR - 0.05;
      body = (
        <group>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[w * 0.42, w * 0.46, 0.04, 20]} />
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
          <mesh position={[0, headY / 2, 0]}>
            <cylinderGeometry args={[0.02, 0.025, headY, 10]} />
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
          <mesh position={[0, headY, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[headR, headR, 0.12, 24]} />
            <meshStandardMaterial color={c} roughness={0.4} />
          </mesh>
          <mesh position={[0, headY, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[headR * 0.85, headR * 0.85, 0.01, 24]} />
            <meshStandardMaterial color={darken(c, 0.3)} roughness={0.6} />
          </mesh>
        </group>
      );
      break;
    }
    case 'bin':
      body = (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[w / 2, w * 0.4, h, 20, 1, false]} />
          <meshStandardMaterial color={c} roughness={0.75} />
        </mesh>
      );
      break;
    case 'rack': {
      const frameT2 = 0.03;
      body = (
        <group>
          {[-1, 1].map((s) => (
            <group key={s}>
              <Box args={[frameT2, h, frameT2]} position={[s * (w / 2 - frameT2), h / 2, -d / 2 + frameT2]} color={c} />
              <Box args={[frameT2, h, frameT2]} position={[s * (w / 2 - frameT2), h / 2, d / 2 - frameT2]} color={c} />
            </group>
          ))}
          {[0.55, 0.75, 0.95].map((f, i) => (
            <group key={i}>
              <Box args={[w - 0.04, 0.02, 0.02]} position={[0, h * f, -d * 0.25]} color={darken(c, 0.15)} />
              <Box args={[w - 0.04, 0.02, 0.02]} position={[0, h * f, 0]} color={darken(c, 0.15)} />
              <Box args={[w - 0.04, 0.02, 0.02]} position={[0, h * f, d * 0.25]} color={darken(c, 0.15)} />
            </group>
          ))}
        </group>
      );
      break;
    }
    case 'cat-tower': {
      const poleR = 0.045;
      body = (
        <group>
          <Box args={[w, 0.04, d]} position={[0, 0.02, 0]} color={darken(c, 0.15)} />
          <mesh position={[0, h * 0.45, 0]} castShadow>
            <cylinderGeometry args={[poleR, poleR, h * 0.9, 10]} />
            <meshStandardMaterial color={lighten(c, 0.1)} roughness={0.95} />
          </mesh>
          <mesh position={[w * 0.18, h * 0.5, -d * 0.1]} castShadow>
            <cylinderGeometry args={[w * 0.32, w * 0.32, 0.035, 18]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <Box args={[w * 0.62, 0.3, d * 0.62]} position={[-w * 0.08, h - 0.15, d * 0.06]} color={c} />
        </group>
      );
      break;
    }
    case 'stairs': {
      // 계단: -d/2(아래 시작) → +d/2 로 올라가는 스텝 박스들. L자(w≈d)는 두 런+참.
      const steps: React.ReactNode[] = [];
      const isL = Math.abs(w - d) < 0.3 && w > 1.2;
      if (!isL) {
        const n = Math.max(6, Math.round(d / 0.25));
        const stepD = d / n;
        for (let i = 0; i < n; i++) {
          const stepH = (h * (i + 1)) / n;
          steps.push(
            <Box
              key={i}
              args={[w, stepH, stepD]}
              position={[0, stepH / 2, d / 2 - stepD * (i + 0.5)]}
              color={i % 2 ? c : cDark}
            />,
          );
        }
      } else {
        // L자: 하부 런(전방 y+측 절반) → 참 → 상부 런(좌측 x-측 절반)
        const runW = w / 2;
        const n1 = 6;
        const half = h / 2;
        for (let i = 0; i < n1; i++) {
          const stepH = (half * (i + 1)) / n1;
          const stepD = (d - runW) / n1;
          steps.push(
            <Box
              key={`a${i}`}
              args={[runW, stepH, stepD]}
              position={[w / 2 - runW / 2, stepH / 2, d / 2 - stepD * (i + 0.5)]}
              color={i % 2 ? c : cDark}
            />,
          );
        }
        steps.push(
          <Box key="landing" args={[runW, half, runW]} position={[w / 2 - runW / 2, half / 2, -d / 2 + runW / 2]} color={c} />,
        );
        for (let i = 0; i < n1; i++) {
          const stepH = half + (half * (i + 1)) / n1;
          const stepW = (w - runW) / n1;
          steps.push(
            <Box
              key={`b${i}`}
              args={[stepW, stepH, runW]}
              position={[w / 2 - runW - stepW * (i + 0.5), stepH / 2, -d / 2 + runW / 2]}
              color={i % 2 ? c : cDark}
            />,
          );
        }
      }
      body = <group>{steps}</group>;
      break;
    }
    default:
      body = <Box args={[w, h, d]} position={[0, h / 2, 0]} color={c} />;
  }

  return (
    <group
      position={[item.position.x, baseY, item.position.y]}
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
  doorGroupRef,
  darkBackground = true,
  lights = true,
  highlightItemId = null,
  highlightOpeningId = null,
}: {
  plan: Plan;
  viewer: ViewerState;
  showCeiling: boolean;
  furnitureGroupRef?: React.RefObject<THREE.Group>;
  doorGroupRef?: React.RefObject<THREE.Group>;
  darkBackground?: boolean;
  /** 층 스택 렌더 시 현재 층 외에는 false — 전역 조명(LightRig) 중복 방지 */
  lights?: boolean;
  /** 응시 중 상호작용 가능 사물 하이라이트 */
  highlightItemId?: string | null;
  /** 응시 중 문 하이라이트 */
  highlightOpeningId?: string | null;
}) {
  const spec = LIGHT_PRESETS[viewer.lighting.preset];
  const lampIntensity = spec.lampBase * viewer.lighting.indoorIntensity * 1.6;
  return (
    <group>
      {lights && <LightRig plan={plan} viewer={viewer} setBackground={darkBackground} />}
      <Floors plan={plan} />
      {/* 방 없는 문서(언더레이 전용 등)도 최소한의 바닥을 제공 */}
      {plan.rooms.length === 0 && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[planCenter(plan).x, -0.001, planCenter(plan).y]}
          receiveShadow
        >
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#e8e2d6" roughness={0.95} />
        </mesh>
      )}
      <Walls plan={plan} />
      <Doors plan={plan} doorGroupRef={doorGroupRef} highlightOpeningId={highlightOpeningId} />
      {(plan.wallItems ?? []).map((wi) => (
        <WallItemMesh key={wi.id} plan={plan} id={wi.id} />
      ))}
      {showCeiling && <Ceiling plan={plan} />}
      <group ref={furnitureGroupRef}>
        {plan.items.map((item) => (
          <FurnitureMesh
            key={item.id}
            item={item}
            lampIntensity={lampIntensity}
            highlighted={item.id === highlightItemId}
            baseY={mountBaseHeight(plan, item)}
          />
        ))}
      </group>
    </group>
  );
}
