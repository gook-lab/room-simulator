import type { CatalogShape, PlacedItem } from '../../model/types';
import { catalogById } from '../../model/catalog';

/** hex 색을 어둡게 (0..1) */
export function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const SW = { vectorEffect: 'non-scaling-stroke' } as const;

/**
 * 조명 기구 부위별 색 (2D 심볼·3D 메시 공용).
 * 마감 스와치(variant)는 몸체(폴·베이스·프레임)에, 발광부는 warm 고정.
 */
export function lampPartColors(variantColor: string) {
  return {
    body: variantColor,
    bodyDark: darken(variantColor, 0.25),
    glow: '#efd9a8',
    glowPool: '#fff3d6',
    glowStroke: '#d9bc82',
  };
}

/**
 * 가구 top-view 심볼. 부모가 translate(position)·rotate(rotationDeg)를 적용한
 * world 좌표(meter) 그룹 안에서, 중심 (0,0) 기준 w×d 박스에 그린다.
 */
export function FurnitureSymbol({ item }: { item: PlacedItem }) {
  const shape: CatalogShape = catalogById.get(item.catalogId)?.shape ?? 'rect-table';
  const { w, d } = item.size;
  const fill = item.variant.color;
  const stroke = darken(fill, 0.28);
  const hw = w / 2;
  const hd = d / 2;

  switch (shape) {
    case 'sofa': {
      const back = d * 0.24;
      const arm = Math.min(0.14, w * 0.09);
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.06} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <rect x={-hw} y={-hd} width={w} height={back} rx={0.05} fill={darken(fill, 0.1)} stroke={stroke} strokeWidth={1} {...SW} />
          <rect x={-hw} y={-hd} width={arm} height={d} rx={0.05} fill={darken(fill, 0.1)} stroke={stroke} strokeWidth={1} {...SW} />
          <rect x={hw - arm} y={-hd} width={arm} height={d} rx={0.05} fill={darken(fill, 0.1)} stroke={stroke} strokeWidth={1} {...SW} />
          <line x1={0} y1={-hd + back} x2={0} y2={hd} stroke={stroke} strokeWidth={0.75} opacity={0.5} {...SW} />
        </g>
      );
    }
    case 'chair': {
      const back = d * 0.2;
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.09} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <rect x={-hw * 0.85} y={-hd} width={w * 0.85} height={back} rx={0.05} fill={darken(fill, 0.1)} stroke={stroke} strokeWidth={1} {...SW} />
        </g>
      );
    }
    case 'round-table':
      return (
        <g>
          <circle r={hw} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <circle r={hw * 0.62} fill="none" stroke={stroke} strokeWidth={0.75} opacity={0.45} {...SW} />
        </g>
      );
    case 'rect-table':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.04} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <rect x={-hw * 0.8} y={-hd * 0.6} width={w * 0.8} height={d * 0.6} fill="none" stroke={stroke} strokeWidth={0.75} opacity={0.4} {...SW} />
        </g>
      );
    case 'shelf':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <line x1={-hw} y1={0} x2={hw} y2={0} stroke={stroke} strokeWidth={0.75} opacity={0.6} {...SW} />
          <line x1={-hw * 0.34} y1={-hd} x2={-hw * 0.34} y2={hd} stroke={stroke} strokeWidth={0.75} opacity={0.4} {...SW} />
          <line x1={hw * 0.34} y1={-hd} x2={hw * 0.34} y2={hd} stroke={stroke} strokeWidth={0.75} opacity={0.4} {...SW} />
        </g>
      );
    case 'console':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.03} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <line x1={0} y1={-hd} x2={0} y2={hd} stroke={stroke} strokeWidth={0.75} opacity={0.5} {...SW} />
        </g>
      );
    case 'wardrobe':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <line x1={0} y1={-hd} x2={0} y2={hd} stroke={stroke} strokeWidth={1} opacity={0.6} {...SW} />
          <line x1={-hw} y1={hd} x2={hw} y2={-hd} stroke={stroke} strokeWidth={0.6} opacity={0.25} {...SW} />
        </g>
      );
    case 'bed': {
      const pillowH = d * 0.16;
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.04} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <rect x={-hw * 0.82} y={-hd + 0.08} width={w * 0.36} height={pillowH} rx={0.04} fill="#e2e8f1" stroke={stroke} strokeWidth={0.9} {...SW} />
          <rect x={hw * 0.1} y={-hd + 0.08} width={w * 0.36} height={pillowH} rx={0.04} fill="#e2e8f1" stroke={stroke} strokeWidth={0.9} {...SW} />
          <line x1={-hw} y1={-hd + d * 0.38} x2={hw} y2={-hd + d * 0.38} stroke={stroke} strokeWidth={0.9} opacity={0.55} {...SW} />
        </g>
      );
    }
    case 'rug':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.05} fill={fill} opacity={0.85} stroke={stroke} strokeWidth={1.5} {...SW} />
          <rect x={-hw + 0.12} y={-hd + 0.12} width={w - 0.24} height={d - 0.24} rx={0.03} fill="none" stroke={stroke} strokeWidth={0.75} opacity={0.6} {...SW} />
        </g>
      );
    case 'floor-lamp': {
      const lp = lampPartColors(fill);
      return (
        <g>
          <circle r={hw} fill={lp.glow} opacity={0.9} stroke={lp.glowStroke} strokeWidth={1.5} {...SW} />
          <circle r={Math.max(0.05, hw * 0.3)} fill={lp.body} stroke={lp.bodyDark} strokeWidth={1} {...SW} />
        </g>
      );
    }
    case 'pendant-lamp': {
      const lp = lampPartColors(fill);
      return (
        <g>
          <circle r={hw} fill={lp.glowPool} opacity={0.8} stroke="#e3c77e" strokeWidth={1.2} strokeDasharray="3 3" {...SW} />
          <circle r={hw * 0.4} fill={lp.body} stroke={lp.bodyDark} strokeWidth={1.2} {...SW} />
        </g>
      );
    }
    case 'desk':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={0.03} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <line x1={-hw} y1={-hd + d * 0.3} x2={hw} y2={-hd + d * 0.3} stroke={stroke} strokeWidth={0.75} opacity={0.5} {...SW} />
          <rect x={hw - w * 0.28} y={-hd + d * 0.34} width={w * 0.24} height={d * 0.6} fill="none" stroke={stroke} strokeWidth={0.75} opacity={0.4} {...SW} />
        </g>
      );
    case 'dining-set': {
      // 중앙 테이블 + 4방향 의자
      const tw = w * 0.55;
      const td = d * 0.55;
      const cw = w * 0.2;
      const cd = d * 0.16;
      const chair = (x: number, y: number, horizontal: boolean) => (
        <rect
          x={x - (horizontal ? cd : cw) / 2}
          y={y - (horizontal ? cw : cd) / 2}
          width={horizontal ? cd : cw}
          height={horizontal ? cw : cd}
          rx={0.04}
          fill={darken(fill, 0.1)}
          stroke={stroke}
          strokeWidth={1}
          {...SW}
        />
      );
      return (
        <g>
          {chair(0, -hd + cd / 2, false)}
          {chair(0, hd - cd / 2, false)}
          {chair(-hw + cd / 2, 0, true)}
          {chair(hw - cd / 2, 0, true)}
          <rect x={-tw / 2} y={-td / 2} width={tw} height={td} rx={0.04} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <rect x={-tw / 2 + 0.08} y={-td / 2 + 0.08} width={tw - 0.16} height={td - 0.16} fill="none" stroke={stroke} strokeWidth={0.75} opacity={0.4} {...SW} />
        </g>
      );
    }
    case 'plant':
      return (
        <g>
          <circle r={hw * 0.7} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />
          <circle cx={-hw * 0.3} cy={-hw * 0.25} r={hw * 0.55} fill="#8fa396" opacity={0.85} stroke="#6d8175" strokeWidth={1} {...SW} />
          <circle cx={hw * 0.35} cy={-hw * 0.1} r={hw * 0.45} fill="#9db2a4" opacity={0.85} stroke="#6d8175" strokeWidth={1} {...SW} />
          <circle cx={hw * 0.05} cy={hw * 0.38} r={hw * 0.4} fill="#87a08f" opacity={0.85} stroke="#6d8175" strokeWidth={1} {...SW} />
        </g>
      );
    default:
      return <rect x={-hw} y={-hd} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={1.5} {...SW} />;
  }
}

/** 러그·펜던트는 충돌 검사 제외 */
export const NON_COLLIDING_SHAPES = new Set<string>(['rug', 'pendant-lamp']);

export function shapeOf(catalogId: string): string {
  return catalogById.get(catalogId)?.shape ?? 'rect-table';
}
