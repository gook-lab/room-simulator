import {
  detectEnclosedRegions,
  detectSegments,
  rasterizeSegments,
  silhouetteMask,
  type DetectedLine,
} from './wallDetect';

/**
 * 업로드 이미지 → 벽 후보 자동 인식 (DOM 어댑터).
 *
 * 이미지를 페이퍼 크기 캔버스에 object-fit: contain 과 동일한 매핑으로 그린 뒤
 * (표시 좌표계 = 트레이싱 좌표계 = 에디터 언더레이 좌표계 보장),
 * 어두운 픽셀을 이진화해 wallDetect 순수 코어로 긴 수평/수직 선분을 찾는다.
 * 실패(CORS·디코드 오류 등)는 빈 결과로 조용히 강등 — 수동 트레이싱 경로 유지.
 */
export type AutoTraceResult = {
  lines: DetectedLine[];
  wallCount: number;
  /** 닫힌 공간 후보 (검출 캔버스 px 좌표, cellPx=격자 셀 크기) */
  regions: { min: { x: number; y: number }; max: { x: number; y: number }; areaCells: number; cellPx: number }[];
};

const STEP = 2; // 다운샘플 간격 (px)
const DARK_LUM = 120; // 벽 판정 밝기 임계
const MIN_LEN_PX = 32; // 최소 벽 길이 — 문자·가구 심볼 필터
// 창·문 개구부를 가로질러 벽 중심선을 잇는 허용 끊김 — 에디터 모델(벽은
// 개구부를 관통, 개구부는 별도 배치)과 일치. 너무 크면 다른 벽과 오연결.
const GAP_PX = 24;
const MERGE_TOL_PX = 8; // 벽 두께 병합 허용
const MAX_LINES = 60;

export function autoTraceImage(
  imageUrl: string,
  paperW: number,
  paperH: number,
): Promise<AutoTraceResult> {
  return new Promise((resolve) => {
    const empty: AutoTraceResult = { lines: [], wallCount: 0, regions: [] };
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = paperW;
        canvas.height = paperH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(empty);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, paperW, paperH);
        const scale = Math.min(paperW / img.naturalWidth, paperH / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (paperW - dw) / 2, (paperH - dh) / 2, dw, dh);
        const data = ctx.getImageData(0, 0, paperW, paperH).data;
        const gw = Math.floor(paperW / STEP);
        const gh = Math.floor(paperH / STEP);
        const grid = new Uint8Array(gw * gh);
        for (let gy = 0; gy < gh; gy++) {
          for (let gx = 0; gx < gw; gx++) {
            // 셀 블록 전체를 검사 — 1~2px 얇은 벽이 다운샘플에서 소실되지 않게
            let dark = 0;
            for (let dy = 0; dy < STEP && !dark; dy++) {
              for (let dx = 0; dx < STEP; dx++) {
                const px = gx * STEP + dx;
                const py = gy * STEP + dy;
                if (px >= paperW || py >= paperH) continue;
                const i = (py * paperW + px) * 4;
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                if (data[i + 3] > 60 && lum < DARK_LUM) {
                  dark = 1;
                  break;
                }
              }
            }
            grid[gy * gw + gx] = dark;
          }
        }
        // 캡션·로고 밴드 제외 — 도면 이미지 하단(fitted 영역 아래 8%)은 제목/워터마크가 흔함
        const fittedBottom = (paperH - dh) / 2 + dh;
        const captionTop = fittedBottom - dh * 0.08;
        const gridLines = detectSegments(grid, gw, gh, {
          minLen: MIN_LEN_PX / STEP,
          gap: GAP_PX / STEP,
          mergeTol: MERGE_TOL_PX / STEP,
          maxLines: MAX_LINES,
          // 외곽 폐합: 코너 스냅 10px, 외곽 판정 밴드 12px, 외곽 브리징 90px(≈1.2m)
          close: {
            cornerSnap: 10 / STEP,
            boundaryMargin: 12 / STEP,
            boundaryBridge: 90 / STEP,
          },
        }).filter((l) => ((l.points[0].y + l.points[1].y) / 2) * STEP < captionTop);
        // 닫힌 공간(방) 검출 — 선분 마스크 + 실루엣 외피(둘레 완결) 기준.
        const mask = silhouetteMask(rasterizeSegments(gridLines, gw, gh, 2), gw, gh);
        // 최소 방 면적: 실제 스케일이 미정이므로 도면(선분 bbox) 크기에 상대적으로 —
        // 그려진 영역의 0.4% 이상(하한 120셀), 상위 12개까지만 방으로 채택
        let drawingCells = 0;
        {
          let mnX = Infinity;
          let mnY = Infinity;
          let mxX = -Infinity;
          let mxY = -Infinity;
          for (const l of gridLines) {
            for (const p of l.points) {
              mnX = Math.min(mnX, p.x);
              mxX = Math.max(mxX, p.x);
              mnY = Math.min(mnY, p.y);
              mxY = Math.max(mxY, p.y);
            }
          }
          drawingCells = Number.isFinite(mnX) ? (mxX - mnX) * (mxY - mnY) : 0;
        }
        const minRoomCells = Math.max(120, Math.round(drawingCells * 0.004));
        const regions = detectEnclosedRegions(mask, gw, gh, minRoomCells)
          .slice(0, 12)
          .map((r) => ({
          min: { x: r.min.x * STEP, y: r.min.y * STEP },
          max: { x: r.max.x * STEP, y: r.max.y * STEP },
          areaCells: r.areaCells,
          cellPx: STEP,
        }));
        const lines = gridLines.map((l) => ({
          ...l,
          points: l.points.map((p) => ({ x: p.x * STEP, y: p.y * STEP })),
        }));
        resolve({ lines, wallCount: lines.length, regions });
      } catch {
        resolve(empty);
      }
    };
    img.onerror = () => resolve(empty);
    img.src = imageUrl;
  });
}
