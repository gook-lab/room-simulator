import type { Tracing, Vec2, Wall } from './types';

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

/** 스케일 보정: 기준선 실측/측정 비율로 언더레이만 리스케일 (벽·가구 불변) */
export function rescaleTracing(tracing: Tracing, factor: number): Tracing {
  if (!Number.isFinite(factor) || factor <= 0) return tracing;
  return {
    ...tracing,
    widthM: Number(((tracing.widthM ?? 0) * factor).toFixed(4)),
    heightM: Number(((tracing.heightM ?? 0) * factor).toFixed(4)),
  };
}

/**
 * 벽 자동 인식 결과(검출 캔버스 px 좌표) → 월드 벽 목록.
 * 검출 캔버스는 이미지 종횡비 그대로(레터박스 없음)이므로 단순 비례 변환.
 */
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
