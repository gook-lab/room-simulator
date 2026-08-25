import type { Plan, Room, Tracing, Vec2, Wall } from './types';

/**
 * 업로드 언더레이(밑그림) 헬퍼 — "넣는 대로 즉시 로드" 경로의 순수 계산.
 *
 * 업로드하면 도면 이미지는 스케일 추정치(기본 폭 10m)로 곧바로 에디터에
 * 깔리고, 스케일 보정·벽 자동 인식은 에디터 안의 선택 기능이다.
 */

/** 업로드 기본 가정: 도면 이미지 폭 ≈ 10m */
export const DEFAULT_UNDERLAY_WIDTH_M = 10;

/** 이미지 종횡비로 언더레이 실세계 크기 산출 */
export function underlaySize(
  naturalW: number,
  naturalH: number,
  widthM: number = DEFAULT_UNDERLAY_WIDTH_M,
): { widthM: number; heightM: number } {
  const ratio = naturalW > 0 ? naturalH / naturalW : 1;
  return { widthM, heightM: Number((widthM * ratio).toFixed(3)) };
}

/** 언더레이 크기만 리스케일 */
export function rescaleTracing(tracing: Tracing, factor: number): Tracing {
  if (!Number.isFinite(factor) || factor <= 0) return tracing;
  return {
    ...tracing,
    widthM: Number(((tracing.widthM ?? 0) * factor).toFixed(4)),
    heightM: Number(((tracing.heightM ?? 0) * factor).toFixed(4)),
  };
}

/**
 * 스케일 보정: 문서 지오메트리 전체를 원점 기준 리스케일.
 * 벽·방(자동 인식분 포함)이 언더레이에서 파생되므로 함께 배율되어야 정합이
 * 유지된다. **가구 크기는 실물 치수라 불변** — 위치만 배율. 개구부/벽 부착의
 * t(0..1)·부착 높이는 상대/절대 값이라 그대로 둔다.
 */
export function rescalePlanGeometry(plan: Plan, factor: number): Plan {
  if (!Number.isFinite(factor) || factor <= 0) return plan;
  const sv = (v: number) => Number((v * factor).toFixed(4));
  const sp = (p: Vec2): Vec2 => ({ x: sv(p.x), y: sv(p.y) });
  return {
    ...plan,
    tracing: plan.tracing ? rescaleTracing(plan.tracing, factor) : plan.tracing,
    walls: plan.walls.map((w) => ({ ...w, a: sp(w.a), b: sp(w.b) })),
    rooms: plan.rooms.map((r) => ({
      ...r,
      polygon: r.polygon.map(sp),
      areaSqm: Number((r.areaSqm * factor * factor).toFixed(2)),
    })),
    items: plan.items.map((i) => ({ ...i, position: sp(i.position) })),
    dimensions: (plan.dimensions ?? []).map((d) => ({ ...d, a: sp(d.a), b: sp(d.b) })),
  };
}

/**
 * 벽 자동 인식 결과(검출 캔버스 px 좌표) → 월드 벽 목록.
 * 검출 캔버스는 이미지 종횡비 그대로(레터박스 없음)이므로 단순 비례 변환.
 */
/**
 * 닫힌 영역 검출 결과(검출 캔버스 px) → 방 목록 (best-effort).
 * 폴리곤은 bbox 직사각 근사, 면적은 실제 채움 셀 기반(px²→㎡ 환산)이라
 * L자형도 면적은 과대평가되지 않는다.
 */
export function regionsToRooms(
  regions: {
    min: Vec2;
    max: Vec2;
    areaCells: number;
    cellPx: number;
    polygon?: Vec2[];
  }[],
  srcW: number,
  srcH: number,
  widthM: number,
  heightM: number,
  makeId: () => string,
): Room[] {
  const sx = widthM / srcW;
  const sy = heightM / srcH;
  const sp = (p: Vec2): Vec2 => ({
    x: Number((p.x * sx).toFixed(3)),
    y: Number((p.y * sy).toFixed(3)),
  });
  return regions.map((r, i) => {
    const min = sp(r.min);
    const max = sp(r.max);
    const areaSqm = Number((r.areaCells * r.cellPx * r.cellPx * sx * sy).toFixed(2));
    // 직교 윤곽 폴리곤(L자 지원) 우선, 없으면 bbox 폴백
    const polygon =
      r.polygon && r.polygon.length >= 4
        ? r.polygon.map(sp)
        : [
            { x: min.x, y: min.y },
            { x: max.x, y: min.y },
            { x: max.x, y: max.y },
            { x: min.x, y: max.y },
          ];
    return {
      id: makeId(),
      name: `공간 ${i + 1}`,
      wallIds: [],
      polygon,
      areaSqm,
      floor: 'living' as const,
    };
  });
}

export function linesToWalls(
  lines: { points: Vec2[] }[],
  srcW: number,
  srcH: number,
  widthM: number,
  heightM: number,
  makeId: () => string,
): Wall[] {
  const toWorld = (p: Vec2): Vec2 => ({
    x: Number(((p.x / srcW) * widthM).toFixed(3)),
    y: Number(((p.y / srcH) * heightM).toFixed(3)),
  });
  const walls: Wall[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.points.length - 1; i++) {
      walls.push({
        id: makeId(),
        a: toWorld(line.points[i]),
        b: toWorld(line.points[i + 1]),
        thickness: 0.15,
        height: 2.4,
      });
    }
  }
  return walls;
}
