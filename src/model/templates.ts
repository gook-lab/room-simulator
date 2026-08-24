import type { Plan } from './types';
import { item, room, wall } from './planBuilder';

let seq = 0;
const planId = (tpl: string) => `plan-${tpl}-${Date.now().toString(36)}-${seq++}`;

/**
 * 원룸 스튜디오 — 전용 23㎡ (6.0 × 3.9m, 욕실 코너 분리)
 */
function buildStudio(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 6.0, y: 0 }),
    wall('w-e', { x: 6.0, y: 0 }, { x: 6.0, y: 3.9 }),
    wall('w-s', { x: 0, y: 3.9 }, { x: 6.0, y: 3.9 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 3.9 }),
    wall('w-b-v', { x: 4.4, y: 0 }, { x: 4.4, y: 1.6 }),
    wall('w-b-h', { x: 4.4, y: 1.6 }, { x: 6.0, y: 1.6 }),
  ];
  const rooms = [
    room(
      'r-main',
      '원룸',
      ['w-n', 'w-e', 'w-s', 'w-w', 'w-b-v', 'w-b-h'],
      [
        { x: 0, y: 0 },
        { x: 4.4, y: 0 },
        { x: 4.4, y: 1.6 },
        { x: 6.0, y: 1.6 },
        { x: 6.0, y: 3.9 },
        { x: 0, y: 3.9 },
      ],
      'living',
    ),
    room(
      'r-bath',
      '욕실',
      ['w-b-v', 'w-b-h', 'w-n', 'w-e'],
      [
        { x: 4.4, y: 0 },
        { x: 6.0, y: 0 },
        { x: 6.0, y: 1.6 },
        { x: 4.4, y: 1.6 },
      ],
      'bath',
    ),
  ];
  return {
    id: planId('studio'),
    name: '원룸 스튜디오',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-door-entry', wallId: 'w-n', t: 0.633, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-door-bath', wallId: 'w-b-h', t: 0.5, width: 0.7, kind: 'door', swing: 'left', open: false },
      { id: 'o-win-s', wallId: 'w-s', t: 0.333, width: 1.8, kind: 'window' },
    ],
    rooms,
    items: [
      item('st-bed', 'bed-single', { x: 0.7, y: 1.1 }, 0, 'r-main', 3),
      item('st-desk', 'desk-oak', { x: 2.6, y: 0.5 }, 0, 'r-main'),
      item('st-chair', 'office-chair', { x: 2.6, y: 1.3 }, 180, 'r-main', 2),
      item('st-shelf', 'storage-shelf-slim', { x: 3.85, y: 0.25 }, 0, 'r-main'),
      item('st-tv', 'tv-standby', { x: 0.5, y: 3.55 }, 180, 'r-main', 1),
      item('st-rug', 'rug-runner', { x: 2.2, y: 2.4 }, 0, 'r-main', 1),
      item('st-lamp', 'lamp-floor', { x: 5.6, y: 3.5 }, 0, 'r-main'),
      item('st-plant', 'plant-cactus', { x: 3.3, y: 3.6 }, 0, 'r-main'),
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 25평형 아파트 — 전용 59㎡ (9.0 × 6.6m): 침실 2 · 욕실 1 · LDK
 */
function build59(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 9.0, y: 0 }),
    wall('w-e', { x: 9.0, y: 0 }, { x: 9.0, y: 6.6 }),
    wall('w-s', { x: 0, y: 6.6 }, { x: 9.0, y: 6.6 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 6.6 }),
    wall('w-mid-v', { x: 3.2, y: 0 }, { x: 3.2, y: 6.6 }),
    wall('w-l-h1', { x: 0, y: 2.8 }, { x: 3.2, y: 2.8 }),
    wall('w-l-h2', { x: 0, y: 4.0 }, { x: 3.2, y: 4.0 }),
    // 주방-거실 divider — 가운데는 개방 통로
    wall('w-k-a', { x: 3.2, y: 2.2 }, { x: 4.2, y: 2.2 }),
    wall('w-k-b', { x: 6.6, y: 2.2 }, { x: 9.0, y: 2.2 }),
  ];
  const rooms = [
    room('r-bed1', '안방', ['w-n', 'w-w', 'w-mid-v', 'w-l-h1'], [
      { x: 0, y: 0 },
      { x: 3.2, y: 0 },
      { x: 3.2, y: 2.8 },
      { x: 0, y: 2.8 },
    ], 'living'),
    room('r-bath', '욕실', ['w-l-h1', 'w-l-h2', 'w-w', 'w-mid-v'], [
      { x: 0, y: 2.8 },
      { x: 3.2, y: 2.8 },
      { x: 3.2, y: 4.0 },
      { x: 0, y: 4.0 },
    ], 'bath'),
    room('r-bed2', '침실', ['w-l-h2', 'w-s', 'w-w', 'w-mid-v'], [
      { x: 0, y: 4.0 },
      { x: 3.2, y: 4.0 },
      { x: 3.2, y: 6.6 },
      { x: 0, y: 6.6 },
    ], 'living'),
    room('r-kitchen', '주방', ['w-n', 'w-e', 'w-mid-v', 'w-k-a', 'w-k-b'], [
      { x: 3.2, y: 0 },
      { x: 9.0, y: 0 },
      { x: 9.0, y: 2.2 },
      { x: 3.2, y: 2.2 },
    ], 'kitchen'),
    room('r-living', '거실', ['w-k-a', 'w-k-b', 'w-e', 'w-s', 'w-mid-v'], [
      { x: 3.2, y: 2.2 },
      { x: 9.0, y: 2.2 },
      { x: 9.0, y: 6.6 },
      { x: 3.2, y: 6.6 },
    ], 'living'),
  ];
  return {
    id: planId('59'),
    name: '25평 아파트',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-door-entry', wallId: 'w-e', t: 0.121, width: 1.0, kind: 'door', swing: 'right' },
      { id: 'o-door-bed1', wallId: 'w-mid-v', t: 0.212, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-door-bath', wallId: 'w-mid-v', t: 0.515, width: 0.7, kind: 'door', swing: 'right', open: false },
      { id: 'o-door-bed2', wallId: 'w-mid-v', t: 0.758, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-win-living', wallId: 'w-s', t: 0.667, width: 2.4, kind: 'window' },
      { id: 'o-win-bed1', wallId: 'w-w', t: 0.212, width: 1.5, kind: 'window' },
      { id: 'o-win-bed2', wallId: 'w-w', t: 0.803, width: 1.5, kind: 'window' },
      { id: 'o-win-kitchen', wallId: 'w-n', t: 0.556, width: 1.2, kind: 'window' },
    ],
    rooms,
    items: [
      // 거실
      item('t59-sofa', 'sofa-linen-3', { x: 6.1, y: 5.95 }, 180, 'r-living'),
      item('t59-coffee', 'table-coffee', { x: 6.1, y: 4.9 }, 0, 'r-living'),
      item('t59-rug', 'rug-wool-l', { x: 6.1, y: 5.0 }, 0, 'r-living'),
      item('t59-tv', 'tv-standby', { x: 6.1, y: 2.75 }, 0, 'r-living', 1),
      item('t59-console', 'storage-console', { x: 4.1, y: 2.55 }, 0, 'r-living'),
      item('t59-lamp', 'lamp-floor', { x: 8.6, y: 6.1 }, 0, 'r-living'),
      item('t59-plant', 'plant-olive', { x: 8.6, y: 2.6 }, 0, 'r-living'),
      item('t59-pendant', 'lamp-pendant', { x: 6.1, y: 4.9 }, 0, 'r-living'),
      // 주방
      item('t59-island', 'kitchen-island', { x: 5.2, y: 0.55 }, 0, 'r-kitchen'),
      item('t59-table', 'table-oak-round', { x: 7.3, y: 1.3 }, 0, 'r-kitchen'),
      item('t59-stool1', 'stool-bar', { x: 6.55, y: 1.3 }, 0, 'r-kitchen'),
      item('t59-stool2', 'stool-bar', { x: 8.05, y: 1.3 }, 0, 'r-kitchen'),
      item('t59-fridge', 'fridge', { x: 3.65, y: 0.6 }, 90, 'r-kitchen', 2),
      // 안방
      item('t59-bed', 'bed-queen', { x: 1.35, y: 1.35 }, 0, 'r-bed1'),
      item('t59-wardrobe', 'storage-wardrobe', { x: 2.85, y: 1.3 }, 90, 'r-bed1', 2),
      item('t59-night', 'nightstand', { x: 0.3, y: 0.3 }, 0, 'r-bed1'),
      // 침실(서재)
      item('t59-desk', 'desk-oak', { x: 1.1, y: 6.15 }, 180, 'r-bed2'),
      item('t59-chair', 'office-chair', { x: 1.1, y: 5.35 }, 0, 'r-bed2', 2),
      item('t59-bookcase', 'bookcase-wide', { x: 2.9, y: 5.2 }, 90, 'r-bed2'),
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 34평형 아파트 — 전용 84㎡ (10.4 × 8.1m): 침실 3 · 욕실 1 · 안방 · LDK
 */
function build84(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 10.4, y: 0 }),
    wall('w-e', { x: 10.4, y: 0 }, { x: 10.4, y: 8.1 }),
    wall('w-s', { x: 0, y: 8.1 }, { x: 10.4, y: 8.1 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 8.1 }),
    wall('w-mid-v', { x: 3.6, y: 0 }, { x: 3.6, y: 8.1 }),
    wall('w-l-h1', { x: 0, y: 3.2 }, { x: 3.6, y: 3.2 }),
    wall('w-l-h2', { x: 0, y: 5.9 }, { x: 3.6, y: 5.9 }),
    wall('w-m-v2', { x: 6.6, y: 0 }, { x: 6.6, y: 3.4 }),
    // 주방-거실 divider — 가운데 개방 통로
    wall('w-k-a', { x: 3.6, y: 3.4 }, { x: 4.4, y: 3.4 }),
    wall('w-k-b', { x: 6.2, y: 3.4 }, { x: 10.4, y: 3.4 }),
  ];
  const rooms = [
    room('r-bed2', '침실 2', ['w-n', 'w-w', 'w-mid-v', 'w-l-h1'], [
      { x: 0, y: 0 },
      { x: 3.6, y: 0 },
      { x: 3.6, y: 3.2 },
      { x: 0, y: 3.2 },
    ], 'living'),
    room('r-bed3', '침실 3', ['w-l-h1', 'w-l-h2', 'w-w', 'w-mid-v'], [
      { x: 0, y: 3.2 },
      { x: 3.6, y: 3.2 },
      { x: 3.6, y: 5.9 },
      { x: 0, y: 5.9 },
    ], 'living'),
    room('r-bath', '욕실', ['w-l-h2', 'w-s', 'w-w', 'w-mid-v'], [
      { x: 0, y: 5.9 },
      { x: 3.6, y: 5.9 },
      { x: 3.6, y: 8.1 },
      { x: 0, y: 8.1 },
    ], 'bath'),
    room('r-master', '안방', ['w-n', 'w-e', 'w-m-v2', 'w-k-b'], [
      { x: 6.6, y: 0 },
      { x: 10.4, y: 0 },
      { x: 10.4, y: 3.4 },
      { x: 6.6, y: 3.4 },
    ], 'living'),
    room('r-kitchen', '주방', ['w-n', 'w-mid-v', 'w-m-v2', 'w-k-a'], [
      { x: 3.6, y: 0 },
      { x: 6.6, y: 0 },
      { x: 6.6, y: 3.4 },
      { x: 3.6, y: 3.4 },
    ], 'kitchen'),
    room('r-living', '거실', ['w-k-a', 'w-k-b', 'w-e', 'w-s', 'w-mid-v'], [
      { x: 3.6, y: 3.4 },
      { x: 10.4, y: 3.4 },
      { x: 10.4, y: 8.1 },
      { x: 3.6, y: 8.1 },
    ], 'living'),
  ];
  return {
    id: planId('84'),
    name: '34평 아파트',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-door-entry', wallId: 'w-s', t: 0.885, width: 1.0, kind: 'door', swing: 'left' },
      { id: 'o-door-bed2', wallId: 'w-mid-v', t: 0.321, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-door-bed3', wallId: 'w-mid-v', t: 0.543, width: 0.9, kind: 'door', swing: 'right' },
      { id: 'o-door-bath', wallId: 'w-mid-v', t: 0.802, width: 0.8, kind: 'door', swing: 'left', open: false },
      { id: 'o-door-master', wallId: 'w-k-b', t: 0.19, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-win-living', wallId: 'w-s', t: 0.538, width: 2.8, kind: 'window' },
      { id: 'o-win-master', wallId: 'w-n', t: 0.817, width: 1.8, kind: 'window' },
      { id: 'o-win-bed2', wallId: 'w-n', t: 0.173, width: 1.5, kind: 'window' },
      { id: 'o-win-bed3', wallId: 'w-w', t: 0.556, width: 1.4, kind: 'window' },
      { id: 'o-win-kitchen', wallId: 'w-n', t: 0.49, width: 1.2, kind: 'window' },
      { id: 'o-win-bath', wallId: 'w-w', t: 0.864, width: 0.7, kind: 'window' },
    ],
    rooms,
    items: [
      // 거실
      item('t84-sofa', 'sofa-linen-3', { x: 6.9, y: 7.35 }, 180, 'r-living'),
      item('t84-coffee', 'table-coffee', { x: 6.9, y: 6.2 }, 0, 'r-living'),
      item('t84-rug', 'rug-wool-l', { x: 6.9, y: 6.5 }, 0, 'r-living'),
      item('t84-console', 'storage-console', { x: 6.9, y: 3.75 }, 0, 'r-living'),
      item('t84-tv', 'tv-standby', { x: 8.3, y: 3.75 }, 0, 'r-living', 1),
      item('t84-lamp', 'lamp-floor', { x: 10.0, y: 7.6 }, 0, 'r-living'),
      item('t84-plant', 'plant-olive', { x: 3.95, y: 7.7 }, 0, 'r-living'),
      item('t84-pendant', 'lamp-pendant', { x: 6.9, y: 6.2 }, 0, 'r-living'),
      // 주방
      item('t84-island', 'kitchen-island', { x: 5.35, y: 0.6 }, 0, 'r-kitchen'),
      item('t84-dining', 'dining-set-4', { x: 5.1, y: 2.35 }, 0, 'r-kitchen'),
      item('t84-fridge', 'fridge', { x: 4.05, y: 0.6 }, 90, 'r-kitchen', 2),
      // 안방
      item('t84-bed', 'bed-queen', { x: 8.5, y: 1.35 }, 0, 'r-master'),
      item('t84-wardrobe', 'storage-wardrobe', { x: 10.0, y: 1.5 }, 90, 'r-master', 2),
      item('t84-night', 'nightstand', { x: 7.2, y: 0.35 }, 0, 'r-master'),
      item('t84-dresser', 'dresser', { x: 7.6, y: 3.05 }, 180, 'r-master'),
      // 침실 2
      item('t84-bed2', 'bed-single', { x: 1.0, y: 1.3 }, 0, 'r-bed2', 3),
      item('t84-wardrobe2', 'wardrobe-hinged', { x: 3.25, y: 1.2 }, 90, 'r-bed2'),
      item('t84-shelf2', 'storage-shelf-slim', { x: 2.4, y: 0.25 }, 0, 'r-bed2'),
      // 침실 3 (서재)
      item('t84-desk', 'desk-oak', { x: 1.15, y: 5.45 }, 180, 'r-bed3'),
      item('t84-chair', 'office-chair', { x: 1.15, y: 4.6 }, 0, 'r-bed3', 2),
      item('t84-bookcase', 'bookcase-wide', { x: 3.3, y: 4.4 }, 90, 'r-bed3'),
      item('t84-plant2', 'plant-monstera', { x: 0.35, y: 3.55 }, 0, 'r-bed3'),
      // 욕실
      item('t84-rug2', 'rug-runner', { x: 1.8, y: 7.0 }, 0, 'r-bath', 1),
    ],
    updatedAt: new Date().toISOString(),
  };
}

export type PlanTemplate = {
  id: string;
  name: string;
  /** "25평형 · 전용 59㎡" 류의 메타 라벨 */
  sizeLabel: string;
  desc: string;
  build: () => Plan;
};

export const TEMPLATES: PlanTemplate[] = [
  {
    id: 'tpl-studio',
    name: '원룸 스튜디오',
    sizeLabel: '7평형 · 전용 23㎡',
    desc: '원룸 + 분리 욕실, 1인 가구 기본 배치',
    build: buildStudio,
  },
  {
    id: 'tpl-59',
    name: '25평 아파트',
    sizeLabel: '25평형 · 전용 59㎡',
    desc: '침실 2 · 욕실 1 · LDK, 신혼/2인 표준 배치',
    build: build59,
  },
  {
    id: 'tpl-84',
    name: '34평 아파트',
    sizeLabel: '34평형 · 전용 84㎡',
    desc: '침실 3 · 욕실 1 · 안방 + LDK, 국민평형 배치',
    build: build84,
  },
];
