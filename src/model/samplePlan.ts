import { catalogById } from './catalog';
import { polygonArea } from './geometry';
import type { Plan, PlacedItem, Room, Vec2 } from './types';

const T = 0.15; // wall thickness (m)
const H = 2.4; // wall height (m)

const wall = (id: string, a: Vec2, b: Vec2) => ({ id, a, b, thickness: T, height: H });

const room = (
  id: string,
  name: string,
  wallIds: string[],
  polygon: Vec2[],
  floor: Room['floor'],
): Room => ({ id, name, wallIds, polygon, areaSqm: polygonArea(polygon), floor });

function item(
  id: string,
  catalogId: string,
  position: Vec2,
  rotationDeg: number,
  roomId: string | null,
  swatchIndex = 0,
): PlacedItem {
  const cat = catalogById.get(catalogId);
  if (!cat) throw new Error(`unknown catalog id: ${catalogId}`);
  const swatch = cat.swatches[swatchIndex] ?? cat.swatches[0];
  return {
    id,
    catalogId,
    position,
    rotationDeg,
    size: { ...cat.size },
    variant: { material: swatch.id, color: swatch.color },
    roomId,
    price: cat.price,
  };
}

/**
 * 핸드오프 1a 도면을 meter 좌표로 옮긴 샘플 도면.
 * 외벽 10.4 × 7.1 m, 세로 내벽 x=5.35, 가로 내벽 y=3.40 / 5.25 (우측 구획).
 */
export function createSamplePlan(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 10.4, y: 0 }),
    wall('w-e', { x: 10.4, y: 0 }, { x: 10.4, y: 7.1 }),
    wall('w-s', { x: 0, y: 7.1 }, { x: 10.4, y: 7.1 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 7.1 }),
    wall('w-mid-v', { x: 5.35, y: 0 }, { x: 5.35, y: 7.1 }),
    wall('w-mid-h1', { x: 5.35, y: 3.4 }, { x: 10.4, y: 3.4 }),
    wall('w-mid-h2', { x: 5.35, y: 5.25 }, { x: 10.4, y: 5.25 }),
  ];

  const openings: Plan['openings'] = [
    { id: 'o-win-living', wallId: 'w-n', t: 0.25, width: 1.8, kind: 'window' },
    { id: 'o-win-bed', wallId: 'w-n', t: 0.76, width: 1.6, kind: 'window' },
    { id: 'o-win-bath', wallId: 'w-e', t: 0.87, width: 0.7, kind: 'window' },
    { id: 'o-door-front', wallId: 'w-s', t: 0.43, width: 1.0, kind: 'door', swing: 'left' },
    { id: 'o-door-bed', wallId: 'w-mid-v', t: 0.41, width: 0.9, kind: 'door', swing: 'right' },
    { id: 'o-door-kitchen', wallId: 'w-mid-v', t: 0.61, width: 0.9, kind: 'door', swing: 'left' },
    { id: 'o-door-bath', wallId: 'w-mid-v', t: 0.89, width: 0.8, kind: 'door', swing: 'left' },
  ];

  const rooms = [
    room(
      'r-living',
      '거실',
      ['w-n', 'w-w', 'w-s', 'w-mid-v'],
      [
        { x: 0, y: 0 },
        { x: 5.35, y: 0 },
        { x: 5.35, y: 7.1 },
        { x: 0, y: 7.1 },
      ],
      'living',
    ),
    room(
      'r-bed',
      '침실',
      ['w-n', 'w-e', 'w-mid-v', 'w-mid-h1'],
      [
        { x: 5.35, y: 0 },
        { x: 10.4, y: 0 },
        { x: 10.4, y: 3.4 },
        { x: 5.35, y: 3.4 },
      ],
      'living',
    ),
    room(
      'r-kitchen',
      '주방',
      ['w-mid-h1', 'w-e', 'w-mid-v', 'w-mid-h2'],
      [
        { x: 5.35, y: 3.4 },
        { x: 10.4, y: 3.4 },
        { x: 10.4, y: 5.25 },
        { x: 5.35, y: 5.25 },
      ],
      'kitchen',
    ),
    room(
      'r-bath',
      '욕실',
      ['w-mid-h2', 'w-e', 'w-mid-v', 'w-s'],
      [
        { x: 5.35, y: 5.25 },
        { x: 10.4, y: 5.25 },
        { x: 10.4, y: 7.1 },
        { x: 5.35, y: 7.1 },
      ],
      'bath',
    ),
  ];

  const items: PlacedItem[] = [
    item('i-sofa', 'sofa-linen-3', { x: 2.6, y: 4.9 }, 0, 'r-living'),
    item('i-coffee', 'table-coffee', { x: 2.6, y: 3.85 }, 0, 'r-living'),
    item('i-rug', 'rug-wool-l', { x: 2.6, y: 4.1 }, 0, 'r-living'),
    item('i-console', 'storage-console', { x: 2.6, y: 0.42 }, 0, 'r-living'),
    item('i-shelf-living', 'storage-shelf-slim', { x: 5.0, y: 1.5 }, 90, 'r-living'),
    item('i-lamp-floor', 'lamp-floor', { x: 0.55, y: 3.9 }, 0, 'r-living'),
    item('i-pendant', 'lamp-pendant', { x: 2.6, y: 3.85 }, 0, 'r-living'),
    item('i-chair', 'sofa-lounge-1', { x: 1.0, y: 1.4 }, 30, 'r-living', 1),
    item('i-bed', 'bed-queen', { x: 7.6, y: 1.45 }, 0, 'r-bed'),
    item('i-wardrobe', 'storage-wardrobe', { x: 9.97, y: 1.7 }, 90, 'r-bed', 2),
    item('i-table-kitchen', 'table-oak-round', { x: 7.6, y: 4.35 }, 0, 'r-kitchen'),
    item('i-rug-bath', 'rug-runner', { x: 7.0, y: 6.6 }, 0, 'r-bath', 1),
  ];

  return {
    id: 'plan-home',
    name: '우리집 리모델링',
    unitScale: 50,
    walls,
    openings,
    rooms,
    items,
    updatedAt: new Date().toISOString(),
  };
}

/** 대시보드용 두 번째 샘플 (작은 서재) */
export function createStudyPlan(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 4.0, y: 0 }),
    wall('w-e', { x: 4.0, y: 0 }, { x: 4.0, y: 3.0 }),
    wall('w-s', { x: 0, y: 3.0 }, { x: 4.0, y: 3.0 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 3.0 }),
  ];
  const rooms = [
    room(
      'r-study',
      '서재',
      ['w-n', 'w-e', 'w-s', 'w-w'],
      [
        { x: 0, y: 0 },
        { x: 4.0, y: 0 },
        { x: 4.0, y: 3.0 },
        { x: 0, y: 3.0 },
      ],
      'living',
    ),
  ];
  const items: PlacedItem[] = [
    item('s-shelf-1', 'storage-shelf-slim', { x: 0.5, y: 0.32 }, 0, 'r-study'),
    item('s-shelf-2', 'storage-shelf-slim', { x: 1.35, y: 0.32 }, 0, 'r-study'),
    item('s-shelf-3', 'storage-shelf-slim', { x: 2.2, y: 0.32 }, 0, 'r-study'),
    item('s-chair', 'sofa-lounge-1', { x: 2.0, y: 1.9 }, 200, 'r-study', 2),
    item('s-lamp', 'lamp-floor', { x: 3.5, y: 2.5 }, 0, 'r-study', 0),
  ];
  return {
    id: 'plan-study',
    name: '서재 안 A · 책장벽',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-win', wallId: 'w-s', t: 0.5, width: 1.6, kind: 'window' },
      { id: 'o-door', wallId: 'w-w', t: 0.75, width: 0.9, kind: 'door', swing: 'left' },
    ],
    rooms,
    items,
    updatedAt: new Date().toISOString(),
  };
}
