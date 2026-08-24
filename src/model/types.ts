/** 좌표 단위: meter. 평면도 좌표계는 좌상단 원점, x→우, y→하. */
export type Vec2 = { x: number; y: number };

export type Wall = {
  id: string;
  a: Vec2;
  b: Vec2;
  thickness: number; // m
  height: number; // m
};

export type Opening = {
  id: string;
  wallId: string;
  /** 벽 a→b 상 중심 위치 (0..1) */
  t: number;
  width: number; // m
  kind: 'door' | 'window';
  swing?: 'left' | 'right';
  /** 문 형식 — undefined 는 여닫이(hinged). sliding = 미닫이(레일 슬라이드) */
  doorType?: 'hinged' | 'sliding';
  /** 문 개폐 상태 — undefined 는 열림(기본). 닫힌 문은 워크스루 통과 불가 */
  open?: boolean;
};

export type FloorKind = 'living' | 'kitchen' | 'bath';

export type Room = {
  id: string;
  name: string;
  wallIds: string[];
  /** 파생 가능하지만 렌더 편의상 폐곡선을 보관 (벽 중심선 기준) */
  polygon: Vec2[];
  areaSqm: number;
  floor: FloorKind;
  /** 바닥 마감재 — 미지정 시 floor(용도) 기본색 (finishes.ts) */
  floorFinish?: string;
  /** 벽 마감(벽지 색) — 미지정 시 기본 벽색 */
  wallFinish?: string;
};

export type ItemVariant = { material: string; color: string };

export type PlacedItem = {
  id: string;
  catalogId: string;
  /** 가구 중심 위치 */
  position: Vec2;
  rotationDeg: number; // 15° snap
  size: { w: number; d: number; h: number }; // m (w: 가로, d: 세로/깊이, h: 높이)
  variant: ItemVariant;
  roomId: string | null;
  price: number;
  /** 조명 등 전원 상태 — undefined 는 켜짐(기본) */
  powered?: boolean;
  /**
   * 표면 적층: 이 아이템이 올라가 있는 부모(표면 가구) id — undefined 는 바닥 배치.
   * position/rotationDeg 는 월드 좌표 그대로이며, 부모 변환 시 동반 갱신된다 (surfaces.ts).
   */
  parentId?: string;
};

/** 벽 부착 아이템 (액자·벽시계·벽거울) — 벽 세그먼트 좌표계 (wallId + t + 높이) */
export type WallItem = {
  id: string;
  catalogId: string;
  wallId: string;
  /** 벽 a→b 상 중심 위치 (0..1) */
  t: number;
  /** 바닥에서 아이템 중심까지 높이 (m) */
  heightM: number;
  /** 벽 법선 +측(front) / -측(back) 어느 면에 붙는지 */
  side: 'front' | 'back';
  variant: ItemVariant;
  price: number;
};

/** 도면에 고정되는 치수 주석 (치수 도구로 생성, 선택·삭제·undo 대상) */
export type DimensionNote = {
  id: string;
  a: Vec2;
  b: Vec2;
};

export type Tracing = {
  imageUrl: string;
  opacity: number;
  locked: boolean;
  visible: boolean;
  /** 원본 이미지의 실세계 크기 (m) — unitScale 확정 시 계산 */
  widthM?: number;
  heightM?: number;
};

export type Plan = {
  id: string;
  name: string;
  /** px per meter — 업로드 트레이싱에서 확정 */
  unitScale: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: PlacedItem[];
  /** 벽 부착 아이템 — optional (기존 저장본 호환) */
  wallItems?: WallItem[];
  /** 영속 치수 주석 — README 원 타입에 없는 실용적 추가 (optional, 기존 저장본 호환) */
  dimensions?: DimensionNote[];
  tracing?: Tracing;
  updatedAt: string;
};

/* ===== Catalog ===== */

export type CatalogCategory =
  | 'sofa'
  | 'table'
  | 'bed'
  | 'storage'
  | 'appliance'
  | 'lighting'
  | 'rug'
  | 'kids'
  | 'decor';

/** 2D 심볼 / 3D 프리미티브 선택용 형태 힌트 */
export type CatalogShape =
  | 'sofa'
  | 'round-table'
  | 'rect-table'
  | 'shelf'
  | 'floor-lamp'
  | 'pendant-lamp'
  | 'rug'
  | 'bed'
  | 'console'
  | 'wardrobe'
  | 'chair'
  | 'desk'
  | 'dining-set'
  | 'plant'
  | 'tv'
  | 'mirror'
  | 'fan'
  | 'bin'
  | 'rack'
  | 'cat-tower'
  | 'frame'
  | 'wall-clock'
  | 'wall-mirror'
  | 'wall-ac';

export type Swatch = { id: string; label: string; color: string };

/**
 * 실제 판매 상품 연동 정보 — 카탈로그 레벨 (도면 저장에는 포함되지 않음).
 * spec* 이 있으면 카탈로그 치수를 실제원으로 대체한다 (신규 배치부터 적용).
 */
export type ProductInfo = {
  /** 상품 페이지 URL — 실제 확인된 출처만 입력 */
  url: string;
  /** 실판매가 (원) — 확인 시점 기준 */
  priceKrw: number;
  mall: string;
  brand?: string;
  /** 실측 제원 (m) */
  specW?: number;
  specD?: number;
  specH?: number;
  /** 데이터 출처 — 'browse'(상품 페이지 직접 확인) 또는 어댑터 이름 */
  source?: string;
  /** 가격·링크 확인 시점 (ISO) */
  fetchedAt: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  category: CatalogCategory;
  shape: CatalogShape;
  size: { w: number; d: number; h: number };
  price: number;
  /** 소재군 라벨 (인스펙터 스와치 섹션 제목) */
  materialLabel: string;
  swatches: Swatch[];
  /** 실제 판매 상품 연동 (있으면 price=실판매가, size=실제원) */
  product?: ProductInfo;
  /** 표면 적층: 테이블·책상 등 상판 위에 올릴 수 있는 소형 아이템 */
  mountable?: boolean;
  /** 검색 별칭 — 이름과 다른 통칭 (예: 의류관리기 ← '스타일러') */
  keywords?: string[];
};

/* ===== Editor / Viewer state ===== */

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'dimension';

export type SnapResult = {
  kind: 'wall' | 'item';
  axis: 'x' | 'y';
  /** 정렬선 좌표 (스냅된 축 상의 값, meter) */
  line: number;
  targetId: string;
  /** 반대편 여유 (m), 없으면 null */
  clearance: number | null;
};

export type DragState = {
  itemId: string;
  ghost: Vec2;
  snap: SnapResult | null;
  collisions: string[];
  /** 문 클리어런스(스윙/통행 존)를 막고 있는 문 id 목록 */
  blockedDoors: string[];
  /** 그룹 이동 중이면 함께 움직이는 아이템 id 목록 */
  groupIds?: string[];
  /** 카탈로그에서 새로 끌어온 아이템인지 */
  isNew: boolean;
  /** 표면 적층: 드롭 대상 표면 가구 id (하이라이트용) */
  surfaceTargetId?: string | null;
  /** 표면 위지만 상판 이탈·형제 겹침으로 드롭 불가 */
  surfaceInvalid?: boolean;
};

export type LightPreset = 'afternoon' | 'sunset' | 'overcast' | 'night';

export type ViewerState = {
  eyeHeight: 1.6 | 1.15;
  lighting: {
    preset: LightPreset;
    indoorIntensity: number;
    fov: number;
    /** 창 방향(태양 방위각, deg) — 180 = 남향 */
    azimuthDeg: number;
  };
  display: { hideCeiling: boolean; shadows: boolean; dimensionLabels: boolean };
  /** 조감도 카메라 프리셋 */
  birdseyeMode: 'dollhouse' | 'section' | 'ortho';
};

export type View = '2d' | 'walkthrough' | 'birdseye';

export type Screen = 'dashboard' | 'editor' | 'upload';
