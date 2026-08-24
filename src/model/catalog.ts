import type { CatalogCategory, CatalogItem } from './types';

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  sofa: '소파',
  table: '테이블',
  storage: '수납',
  lighting: '조명',
  rug: '러그',
};

export const CATEGORY_ORDER: CatalogCategory[] = ['sofa', 'table', 'storage', 'lighting', 'rug'];

const fabricSwatches = [
  { id: 'sand', label: '샌드', color: '#dcc7ae' },
  { id: 'sage', label: '세이지', color: '#8fa396' },
  { id: 'charcoal', label: '차콜', color: '#3d4742' },
  { id: 'sky', label: '스카이', color: '#c4cfe0' },
];

const woodSwatches = [
  { id: 'oak', label: '오크', color: '#c9a882' },
  { id: 'walnut', label: '월넛', color: '#8a6a4c' },
  { id: 'birch', label: '자작', color: '#e4dacb' },
];

const metalSwatches = [
  { id: 'brass', label: '브라스', color: '#e3c77e' },
  { id: 'black', label: '블랙', color: '#3d4742' },
  { id: 'white', label: '화이트', color: '#f2efe9' },
];

const rugSwatches = [
  { id: 'sage', label: '세이지', color: '#8fa396' },
  { id: 'ivory', label: '아이보리', color: '#e9e2d4' },
  { id: 'terra', label: '테라코타', color: '#c98a66' },
];

export const CATALOG: CatalogItem[] = [
  {
    id: 'sofa-linen-3',
    name: '린넨 3인 소파',
    category: 'sofa',
    shape: 'sofa',
    size: { w: 2.2, d: 0.92, h: 0.78 },
    price: 1_290_000,
    materialLabel: '패브릭',
    swatches: fabricSwatches,
  },
  {
    id: 'sofa-lounge-1',
    name: '라운지 1인 체어',
    category: 'sofa',
    shape: 'chair',
    size: { w: 0.82, d: 0.85, h: 0.72 },
    price: 540_000,
    materialLabel: '패브릭',
    swatches: fabricSwatches,
  },
  {
    id: 'table-oak-round',
    name: '오크 라운드 테이블',
    category: 'table',
    shape: 'round-table',
    size: { w: 1.1, d: 1.1, h: 0.74 },
    price: 690_000,
    materialLabel: '목재',
    swatches: woodSwatches,
  },
  {
    id: 'table-coffee',
    name: '로우 커피 테이블',
    category: 'table',
    shape: 'rect-table',
    size: { w: 1.2, d: 0.6, h: 0.38 },
    price: 320_000,
    materialLabel: '목재',
    swatches: woodSwatches,
  },
  {
    id: 'storage-shelf-slim',
    name: '슬림 책장',
    category: 'storage',
    shape: 'shelf',
    size: { w: 0.8, d: 0.34, h: 1.8 },
    price: 280_000,
    materialLabel: '목재',
    swatches: woodSwatches,
  },
  {
    id: 'storage-console',
    name: 'TV 콘솔 1600',
    category: 'storage',
    shape: 'console',
    size: { w: 1.6, d: 0.4, h: 0.45 },
    price: 460_000,
    materialLabel: '목재',
    swatches: woodSwatches,
  },
  {
    id: 'storage-wardrobe',
    name: '슬라이딩 옷장',
    category: 'storage',
    shape: 'wardrobe',
    size: { w: 1.2, d: 0.6, h: 2.1 },
    price: 890_000,
    materialLabel: '목재',
    swatches: woodSwatches,
  },
  {
    id: 'bed-queen',
    name: '퀸 패브릭 베드',
    category: 'storage',
    shape: 'bed',
    size: { w: 1.6, d: 2.1, h: 0.95 },
    price: 1_180_000,
    materialLabel: '패브릭',
    swatches: [
      { id: 'sky', label: '스카이', color: '#c4cfe0' },
      { id: 'sand', label: '샌드', color: '#dcc7ae' },
      { id: 'sage', label: '세이지', color: '#8fa396' },
    ],
  },
  {
    id: 'lamp-floor',
    name: '플로어 램프',
    category: 'lighting',
    shape: 'floor-lamp',
    size: { w: 0.38, d: 0.38, h: 1.55 },
    price: 168_000,
    materialLabel: '마감',
    swatches: metalSwatches,
  },
  {
    id: 'lamp-pendant',
    name: '펜던트 조명',
    category: 'lighting',
    shape: 'pendant-lamp',
    size: { w: 0.45, d: 0.45, h: 0.4 },
    price: 210_000,
    materialLabel: '마감',
    swatches: metalSwatches,
  },
  {
    id: 'rug-wool-l',
    name: '울 러그 L',
    category: 'rug',
    shape: 'rug',
    size: { w: 2.4, d: 1.7, h: 0.02 },
    price: 380_000,
    materialLabel: '컬러',
    swatches: rugSwatches,
  },
  {
    id: 'rug-runner',
    name: '러너 러그',
    category: 'rug',
    shape: 'rug',
    size: { w: 2.0, d: 0.7, h: 0.02 },
    price: 140_000,
    materialLabel: '컬러',
    swatches: rugSwatches,
  },
];

export const catalogById = new Map(CATALOG.map((c) => [c.id, c]));

export function formatSize(item: CatalogItem): string {
  const { w, d, h } = item.size;
  const cm = (v: number) => Math.round(v * 100);
  if (item.shape === 'round-table') return `Ø ${cm(w)} cm`;
  if (item.shape === 'floor-lamp' || item.shape === 'pendant-lamp')
    return `Ø ${cm(w)} · H ${cm(h)}`;
  return `${cm(w)} × ${cm(d)} cm`;
}

export function formatPrice(price: number): string {
  return `₩${price.toLocaleString('ko-KR')}`;
}
