import type { Plan } from './types';
import { item, room, wall } from './planBuilder';

/**
 * 평형 템플릿 — 룸 폴리곤은 **안목치수(벽 안쪽 면)** 기준으로 작성한다.
 * 벽 중심선 좌표에서 두께 절반(0.075m)만큼 안쪽으로 인셋. 표기 전용면적(23/59/84㎡)은
 * 룸 순면적 합이 ±1.5㎡ 이내로 맞도록 외곽 치수를 보정했다 (templates.test.ts에서 검증).
 */

let seq = 0;
const planId = (tpl: string) => `plan-${tpl}-${Date.now().toString(36)}-${seq++}`;

const F = 0.075; // 벽 두께 절반 (안목 인셋)

/**
 * 원룸 스튜디오 — 전용 23㎡ (외곽 6.2 × 4.0m, 욕실 코너 분리)
 * 순면적: 원룸 20.7 + 욕실 2.1 ≈ 22.8㎡
 */
function buildStudio(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 6.2, y: 0 }),
    wall('w-e', { x: 6.2, y: 0 }, { x: 6.2, y: 4.0 }),
    wall('w-s', { x: 0, y: 4.0 }, { x: 6.2, y: 4.0 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 4.0 }),
    wall('w-b-v', { x: 4.6, y: 0 }, { x: 4.6, y: 1.6 }),
    wall('w-b-h', { x: 4.6, y: 1.6 }, { x: 6.2, y: 1.6 }),
  ];
  const rooms = [
    room('r-main', '원룸', ['w-n', 'w-e', 'w-s', 'w-w', 'w-b-v', 'w-b-h'], [
      { x: F, y: F },
      { x: 4.6 - F, y: F },
      { x: 4.6 - F, y: 1.6 + F },
      { x: 6.2 - F, y: 1.6 + F },
      { x: 6.2 - F, y: 4.0 - F },
      { x: F, y: 4.0 - F },
    ], 'living'),
    room('r-bath', '욕실', ['w-b-v', 'w-b-h', 'w-n', 'w-e'], [
      { x: 4.6 + F, y: F },
      { x: 6.2 - F, y: F },
      { x: 6.2 - F, y: 1.6 - F },
      { x: 4.6 + F, y: 1.6 - F },
    ], 'bath'),
  ];
  return {
    id: planId('studio'),
    name: '원룸 스튜디오',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-door-entry', wallId: 'w-n', t: 0.613, width: 0.9, kind: 'door', swing: 'right' },
      { id: 'o-door-bath', wallId: 'w-b-h', t: 0.5, width: 0.7, kind: 'door', swing: 'left', open: false },
      { id: 'o-win-s', wallId: 'w-s', t: 0.339, width: 1.8, kind: 'window' },
    ],
    rooms,
    items: [
      item('st-bed', 'bed-single', { x: 0.7, y: 1.15 }, 0, 'r-main', 3),
      item('st-desk', 'desk-oak', { x: 2.4, y: 0.5 }, 0, 'r-main'),
      item('st-chair', 'office-chair', { x: 2.6, y: 1.3 }, 180, 'r-main', 2),
      item('st-shelf', 'storage-shelf-slim', { x: 0.28, y: 2.9 }, 90, 'r-main'),
      item('st-tv', 'tv-standby', { x: 0.5, y: 3.65 }, 180, 'r-main', 1),
      item('st-rug', 'rug-runner', { x: 2.4, y: 2.5 }, 0, 'r-main', 1),
      item('st-lamp', 'lamp-floor', { x: 5.8, y: 3.6 }, 0, 'r-main'),
      item('st-plant', 'plant-cactus', { x: 3.5, y: 3.7 }, 0, 'r-main'),
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 25평형 아파트 — 전용 59㎡ (외곽 9.3 × 7.0m)
 * 침실·공용욕실·안방(+부속욕실)·주방·현관·거실. 순면적 합 ≈ 59.0㎡
 */
function build59(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 9.3, y: 0 }),
    wall('w-e', { x: 9.3, y: 0 }, { x: 9.3, y: 7.0 }),
    wall('w-s', { x: 0, y: 7.0 }, { x: 9.3, y: 7.0 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 7.0 }),
    wall('w-mid-v', { x: 3.3, y: 0 }, { x: 3.3, y: 7.0 }),
    wall('w-l-h1', { x: 0, y: 2.3 }, { x: 3.3, y: 2.3 }),
    wall('w-l-h2', { x: 0, y: 3.6 }, { x: 3.3, y: 3.6 }),
    // 안방 부속욕실 (안방 남서 코너)
    wall('w-mb-v', { x: 2.4, y: 5.8 }, { x: 2.4, y: 7.0 }),
    wall('w-mb-h', { x: 0, y: 5.8 }, { x: 2.4, y: 5.8 }),
    // 주방·현관 상단 구획 — 가운데 개방 통로
    wall('w-k-a', { x: 3.3, y: 2.1 }, { x: 3.9, y: 2.1 }),
    wall('w-k-b', { x: 6.0, y: 2.1 }, { x: 9.3, y: 2.1 }),
    wall('w-e-v', { x: 7.7, y: 0 }, { x: 7.7, y: 2.1 }),
  ];
  const rooms = [
    room('r-bed', '침실', ['w-n', 'w-w', 'w-mid-v', 'w-l-h1'], [
      { x: F, y: F },
      { x: 3.3 - F, y: F },
      { x: 3.3 - F, y: 2.3 - F },
      { x: F, y: 2.3 - F },
    ], 'living'),
    room('r-bath', '공용 욕실', ['w-l-h1', 'w-l-h2', 'w-w', 'w-mid-v'], [
      { x: F, y: 2.3 + F },
      { x: 3.3 - F, y: 2.3 + F },
      { x: 3.3 - F, y: 3.6 - F },
      { x: F, y: 3.6 - F },
    ], 'bath'),
    room('r-master', '안방', ['w-l-h2', 'w-s', 'w-w', 'w-mid-v', 'w-mb-v', 'w-mb-h'], [
      { x: F, y: 3.6 + F },
      { x: 3.3 - F, y: 3.6 + F },
      { x: 3.3 - F, y: 7.0 - F },
      { x: 2.4 + F, y: 7.0 - F },
      { x: 2.4 + F, y: 5.8 - F },
      { x: F, y: 5.8 - F },
    ], 'living'),
    room('r-mbath', '안방 욕실', ['w-mb-v', 'w-mb-h', 'w-w', 'w-s'], [
      { x: F, y: 5.8 + F },
      { x: 2.4 - F, y: 5.8 + F },
      { x: 2.4 - F, y: 7.0 - F },
      { x: F, y: 7.0 - F },
    ], 'bath'),
    room('r-kitchen', '주방', ['w-n', 'w-mid-v', 'w-e-v', 'w-k-a', 'w-k-b'], [
      { x: 3.3 + F, y: F },
      { x: 7.7 - F, y: F },
      { x: 7.7 - F, y: 2.1 - F },
      { x: 3.3 + F, y: 2.1 - F },
    ], 'kitchen'),
    room('r-entry', '현관', ['w-n', 'w-e', 'w-e-v', 'w-k-b'], [
      { x: 7.7 + F, y: F },
      { x: 9.3 - F, y: F },
      { x: 9.3 - F, y: 2.1 - F },
      { x: 7.7 + F, y: 2.1 - F },
    ], 'kitchen'),
    room('r-living', '거실', ['w-k-a', 'w-k-b', 'w-e', 'w-s', 'w-mid-v'], [
      { x: 3.3 + F, y: 2.1 + F },
      { x: 9.3 - F, y: 2.1 + F },
      { x: 9.3 - F, y: 7.0 - F },
      { x: 3.3 + F, y: 7.0 - F },
    ], 'living'),
  ];
  return {
    id: planId('59'),
    name: '25평 아파트',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-door-entry', wallId: 'w-n', t: 0.914, width: 1.0, kind: 'door', swing: 'right' },
      { id: 'o-door-hall', wallId: 'w-k-b', t: 0.758, width: 1.0, kind: 'door', swing: 'left' },
      { id: 'o-door-bed', wallId: 'w-mid-v', t: 0.214, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-door-bath', wallId: 'w-mid-v', t: 0.421, width: 0.7, kind: 'door', swing: 'right', open: false },
      { id: 'o-door-master', wallId: 'w-mid-v', t: 0.643, width: 0.9, kind: 'door', swing: 'left' },
      // 안방 욕실 — 안방에서만 진입
      { id: 'o-door-mbath', wallId: 'w-mb-h', t: 0.79, width: 0.7, kind: 'door', swing: 'left', doorType: 'sliding' },
      { id: 'o-win-living', wallId: 'w-s', t: 0.677, width: 2.6, kind: 'window' },
      { id: 'o-win-master', wallId: 'w-w', t: 0.657, width: 1.4, kind: 'window' },
      { id: 'o-win-bed', wallId: 'w-n', t: 0.172, width: 1.4, kind: 'window' },
      { id: 'o-win-kitchen', wallId: 'w-n', t: 0.591, width: 1.2, kind: 'window' },
    ],
    rooms,
    items: [
      // 거실
      item('t59-sofa', 'sofa-linen-3', { x: 6.3, y: 6.35 }, 180, 'r-living'),
      item('t59-coffee', 'table-coffee', { x: 6.3, y: 5.3 }, 0, 'r-living'),
      item('t59-rug', 'rug-wool-l', { x: 6.3, y: 5.45 }, 0, 'r-living'),
      item('t59-tv', 'tv-standby', { x: 5.9, y: 2.5 }, 0, 'r-living', 1),
      item('t59-console', 'storage-console', { x: 7.15, y: 2.45 }, 0, 'r-living'),
      item('t59-lamp', 'lamp-floor', { x: 8.9, y: 6.5 }, 0, 'r-living'),
      item('t59-plant', 'plant-olive', { x: 3.7, y: 6.6 }, 0, 'r-living'),
      item('t59-pendant', 'lamp-pendant', { x: 6.3, y: 5.3 }, 0, 'r-living'),
      // 주방
      item('t59-island', 'kitchen-island', { x: 4.05, y: 1.0 }, 90, 'r-kitchen'),
      item('t59-table', 'table-oak-round', { x: 5.9, y: 1.2 }, 0, 'r-kitchen'),
      item('t59-stool1', 'stool-bar', { x: 5.0, y: 1.2 }, 0, 'r-kitchen'),
      item('t59-stool2', 'stool-bar', { x: 5.9, y: 0.38 }, 0, 'r-kitchen'),
      item('t59-fridge', 'fridge', { x: 7.25, y: 0.6 }, 90, 'r-kitchen', 2),
      // 안방 (침대는 부속욕실 반대편)
      item('t59-bed', 'bed-queen', { x: 1.15, y: 4.65 }, 90, 'r-master'),
      item('t59-night', 'nightstand', { x: 2.6, y: 5.2 }, 0, 'r-master'),
      item('t59-wardrobe', 'storage-wardrobe', { x: 2.85, y: 6.1 }, 90, 'r-master', 2),
      // 침실 (서재)
      item('t59-desk', 'desk-oak', { x: 0.85, y: 0.55 }, 0, 'r-bed'),
      item('t59-chair', 'office-chair', { x: 0.85, y: 1.35 }, 180, 'r-bed', 2),
      item('t59-bookcase', 'bookcase-wide', { x: 2.35, y: 0.45 }, 0, 'r-bed'),
      item('t59-plant2', 'plant-monstera', { x: 0.35, y: 1.9 }, 0, 'r-bed'),
      // 공용 욕실 · 현관
      item('t59-rug2', 'rug-runner', { x: 1.6, y: 2.95 }, 0, 'r-bath', 1),
      item('t59-shoe', 'storage-shelf-slim', { x: 9.0, y: 1.0 }, 90, 'r-entry'),
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 34평형 아파트 — 전용 84㎡ (외곽 10.9 × 8.4m, 국민평형)
 * 침실2·침실3(서재)·공용욕실·현관·주방(+팬트리)·안방(+부속욕실)·거실. 순면적 합 ≈ 83.3㎡
 */
function build84(): Plan {
  const walls = [
    wall('w-n', { x: 0, y: 0 }, { x: 10.9, y: 0 }),
    wall('w-e', { x: 10.9, y: 0 }, { x: 10.9, y: 8.4 }),
    wall('w-s', { x: 0, y: 8.4 }, { x: 10.9, y: 8.4 }),
    wall('w-w', { x: 0, y: 0 }, { x: 0, y: 8.4 }),
    wall('w-mid-v', { x: 3.6, y: 0 }, { x: 3.6, y: 8.4 }),
    wall('w-l-h1', { x: 0, y: 3.3 }, { x: 3.6, y: 3.3 }),
    wall('w-l-h2', { x: 0, y: 5.7 }, { x: 3.6, y: 5.7 }),
    wall('w-l-h3', { x: 0, y: 7.0 }, { x: 3.6, y: 7.0 }),
    wall('w-m-v', { x: 6.9, y: 0 }, { x: 6.9, y: 3.4 }),
    // 팬트리 (주방 코너)
    wall('w-p-v', { x: 5.5, y: 0 }, { x: 5.5, y: 1.7 }),
    wall('w-p-h', { x: 5.5, y: 1.7 }, { x: 6.9, y: 1.7 }),
    // 주방-거실 divider — 가운데 개방 통로
    wall('w-k-a', { x: 3.6, y: 3.4 }, { x: 4.3, y: 3.4 }),
    wall('w-k-b', { x: 6.1, y: 3.4 }, { x: 10.9, y: 3.4 }),
    // 안방 부속욕실 (거실 북동 코너, 안방에서 진입)
    wall('w-mb-v', { x: 8.7, y: 3.4 }, { x: 8.7, y: 5.3 }),
    wall('w-mb-h', { x: 8.7, y: 5.3 }, { x: 10.9, y: 5.3 }),
  ];
  const rooms = [
    room('r-bed2', '침실 2', ['w-n', 'w-w', 'w-mid-v', 'w-l-h1'], [
      { x: F, y: F },
      { x: 3.6 - F, y: F },
      { x: 3.6 - F, y: 3.3 - F },
      { x: F, y: 3.3 - F },
    ], 'living'),
    room('r-bed3', '침실 3', ['w-l-h1', 'w-l-h2', 'w-w', 'w-mid-v'], [
      { x: F, y: 3.3 + F },
      { x: 3.6 - F, y: 3.3 + F },
      { x: 3.6 - F, y: 5.7 - F },
      { x: F, y: 5.7 - F },
    ], 'living'),
    room('r-bath', '공용 욕실', ['w-l-h2', 'w-l-h3', 'w-w', 'w-mid-v'], [
      { x: F, y: 5.7 + F },
      { x: 3.6 - F, y: 5.7 + F },
      { x: 3.6 - F, y: 7.0 - F },
      { x: F, y: 7.0 - F },
    ], 'bath'),
    room('r-entry', '현관', ['w-l-h3', 'w-s', 'w-w', 'w-mid-v'], [
      { x: F, y: 7.0 + F },
      { x: 3.6 - F, y: 7.0 + F },
      { x: 3.6 - F, y: 8.4 - F },
      { x: F, y: 8.4 - F },
    ], 'kitchen'),
    room('r-kitchen', '주방', ['w-n', 'w-mid-v', 'w-m-v', 'w-k-a', 'w-p-v', 'w-p-h'], [
      { x: 3.6 + F, y: F },
      { x: 5.5 - F, y: F },
      { x: 5.5 - F, y: 1.7 + F },
      { x: 6.9 - F, y: 1.7 + F },
      { x: 6.9 - F, y: 3.4 - F },
      { x: 3.6 + F, y: 3.4 - F },
    ], 'kitchen'),
    room('r-pantry', '팬트리', ['w-p-v', 'w-p-h', 'w-n', 'w-m-v'], [
      { x: 5.5 + F, y: F },
      { x: 6.9 - F, y: F },
      { x: 6.9 - F, y: 1.7 - F },
      { x: 5.5 + F, y: 1.7 - F },
    ], 'kitchen'),
    room('r-master', '안방', ['w-n', 'w-e', 'w-m-v', 'w-k-b'], [
      { x: 6.9 + F, y: F },
      { x: 10.9 - F, y: F },
      { x: 10.9 - F, y: 3.4 - F },
      { x: 6.9 + F, y: 3.4 - F },
    ], 'living'),
    room('r-mbath', '안방 욕실', ['w-mb-v', 'w-mb-h', 'w-e', 'w-k-b'], [
      { x: 8.7 + F, y: 3.4 + F },
      { x: 10.9 - F, y: 3.4 + F },
      { x: 10.9 - F, y: 5.3 - F },
      { x: 8.7 + F, y: 5.3 - F },
    ], 'bath'),
    room('r-living', '거실', ['w-k-a', 'w-k-b', 'w-e', 'w-s', 'w-mid-v', 'w-mb-v', 'w-mb-h'], [
      { x: 3.6 + F, y: 3.4 + F },
      { x: 8.7 - F, y: 3.4 + F },
      { x: 8.7 - F, y: 5.3 + F },
      { x: 10.9 - F, y: 5.3 + F },
      { x: 10.9 - F, y: 8.4 - F },
      { x: 3.6 + F, y: 8.4 - F },
    ], 'living'),
  ];
  return {
    id: planId('84'),
    name: '34평 아파트',
    unitScale: 50,
    walls,
    openings: [
      { id: 'o-door-entry', wallId: 'w-s', t: 0.165, width: 1.0, kind: 'door', swing: 'left' },
      { id: 'o-door-hall', wallId: 'w-mid-v', t: 0.905, width: 1.0, kind: 'door', swing: 'left' },
      { id: 'o-door-bed2', wallId: 'w-mid-v', t: 0.321, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-door-bed3', wallId: 'w-mid-v', t: 0.536, width: 0.9, kind: 'door', swing: 'left' },
      { id: 'o-door-bath', wallId: 'w-mid-v', t: 0.756, width: 0.8, kind: 'door', swing: 'left', open: false },
      { id: 'o-door-master', wallId: 'w-k-b', t: 0.25, width: 0.9, kind: 'door', swing: 'right' },
      // 안방 욕실 — 안방에서만 진입 (w-k-b 위 문, 안방↔욕실)
      { id: 'o-door-mbath', wallId: 'w-k-b', t: 0.75, width: 0.7, kind: 'door', swing: 'left' },
      { id: 'o-door-pantry', wallId: 'w-p-h', t: 0.5, width: 0.8, kind: 'door', swing: 'right', doorType: 'sliding' },
      { id: 'o-win-living', wallId: 'w-s', t: 0.596, width: 3.0, kind: 'window' },
      { id: 'o-win-master', wallId: 'w-n', t: 0.817, width: 1.8, kind: 'window' },
      { id: 'o-win-bed2', wallId: 'w-n', t: 0.165, width: 1.5, kind: 'window' },
      { id: 'o-win-bed3', wallId: 'w-w', t: 0.536, width: 1.4, kind: 'window' },
      { id: 'o-win-kitchen', wallId: 'w-n', t: 0.413, width: 1.2, kind: 'window' },
      { id: 'o-win-bath', wallId: 'w-w', t: 0.756, width: 0.6, kind: 'window' },
    ],
    rooms,
    items: [
      // 거실
      item('t84-sofa', 'sofa-linen-3', { x: 6.5, y: 7.5 }, 180, 'r-living'),
      item('t84-coffee', 'table-coffee', { x: 6.5, y: 6.4 }, 0, 'r-living'),
      item('t84-rug', 'rug-wool-l', { x: 6.5, y: 6.6 }, 0, 'r-living'),
      item('t84-console', 'storage-console', { x: 7.05, y: 4.0 }, 0, 'r-living'),
      item('t84-tv', 'tv-standby', { x: 8.25, y: 4.0 }, 0, 'r-living', 1),
      item('t84-dining', 'dining-set-4', { x: 5.0, y: 4.6 }, 0, 'r-living'),
      item('t84-lamp', 'lamp-floor', { x: 10.5, y: 8.0 }, 0, 'r-living'),
      item('t84-plant', 'plant-olive', { x: 4.2, y: 7.9 }, 0, 'r-living'),
      item('t84-pendant', 'lamp-pendant', { x: 6.5, y: 6.4 }, 0, 'r-living'),
      // 주방 · 팬트리
      item('t84-island', 'kitchen-island', { x: 4.5, y: 1.0 }, 90, 'r-kitchen'),
      item('t84-fridge', 'fridge', { x: 6.35, y: 2.6 }, 90, 'r-kitchen', 2),
      item('t84-pshelf', 'storage-shelf-slim', { x: 6.3, y: 0.3 }, 0, 'r-pantry'),
      // 안방
      item('t84-bed', 'bed-queen', { x: 8.6, y: 1.3 }, 0, 'r-master'),
      item('t84-wardrobe', 'storage-wardrobe', { x: 10.45, y: 1.5 }, 90, 'r-master', 2),
      item('t84-night', 'nightstand', { x: 7.3, y: 0.4 }, 0, 'r-master'),
      item('t84-dresser', 'dresser', { x: 8.8, y: 2.95 }, 180, 'r-master'),
      // 침실 2
      item('t84-bed2', 'bed-single', { x: 0.85, y: 1.35 }, 0, 'r-bed2', 3),
      item('t84-wardrobe2', 'wardrobe-hinged', { x: 3.15, y: 1.2 }, 90, 'r-bed2'),
      item('t84-shelf2', 'storage-shelf-slim', { x: 2.2, y: 0.28 }, 0, 'r-bed2'),
      // 침실 3 (서재)
      item('t84-desk', 'desk-oak', { x: 0.95, y: 5.2 }, 180, 'r-bed3'),
      item('t84-chair', 'office-chair', { x: 0.95, y: 4.35 }, 0, 'r-bed3', 2),
      item('t84-bookcase', 'bookcase-wide', { x: 2.5, y: 5.35 }, 0, 'r-bed3'),
      item('t84-plant2', 'plant-monstera', { x: 0.35, y: 3.7 }, 0, 'r-bed3'),
      // 공용 욕실 · 현관
      item('t84-rug2', 'rug-runner', { x: 1.5, y: 6.35 }, 0, 'r-bath', 1),
      item('t84-shoe', 'storage-shelf-slim', { x: 0.5, y: 7.3 }, 0, 'r-entry'),
      item('t84-rug3', 'rug-runner', { x: 1.9, y: 7.7 }, 0, 'r-entry', 1),
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
    desc: '침실 2 · 욕실 2(안방 부속) · 현관 · LDK',
    build: build59,
  },
  {
    id: 'tpl-84',
    name: '34평 아파트',
    sizeLabel: '34평형 · 전용 84㎡',
    desc: '침실 3 · 욕실 2 · 팬트리 · 현관, 국민평형',
    build: build84,
  },
];
