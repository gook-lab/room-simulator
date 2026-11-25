import { describe, expect, it } from 'vitest';
import type { Plan } from '../src/model/types';
import { TEMPLATES } from '../src/model/templates';
import { traceRaster } from '../src/features/upload/autoTrace';
import { buildAutoGeometry, underlaySize } from '../src/model/underlay';
import { isolatedRoomIds } from '../src/features/editor2d/editorState';
import { rasterPlan, type Shape } from './rasterPlan';

/** UploadTrace "샘플 도면 사용" 과 같은 밑그림 · 같은 인식 경로 */
function sampleUpload(): Plan {
  const lum = 0x6e * 0.299 + 0x6a * 0.587 + 0x63 * 0.114;
  const R = (x0: number, y0: number, x1: number, y1: number): Shape => ({ rect: [x0, y0, x1, y1], lum });
  const shapes = [
    R(138, 78, 702, 82),
    R(138, 478, 702, 482),
    R(138, 78, 142, 482),
    R(698, 78, 702, 482),
    R(418, 80, 422, 480),
    R(420, 268, 700, 272),
  ];
  const trace = traceRaster(rasterPlan(780, 560, shapes, 1), 780, 560, { top: 0, height: 560 }, { knownWidthM: 10.9 });
  const size = underlaySize(780, 560, 10.9);
  let n = 0;
  const g = buildAutoGeometry(trace, 780, 560, size.widthM, size.heightM, () => `u${n++}-ad${n}`);
  return { id: 'up', name: '샘플 도면', unitScale: 60, items: [], updatedAt: 'now', ...g };
}

describe('"문이 없는 방 N개" 칩 조건 (기획 후보 7)', () => {
  it('샘플 업로드(문 0)에서는 칩이 뜬다', () => {
    expect(isolatedRoomIds(sampleUpload()).length).toBeGreaterThan(0);
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))('템플릿 %s 에서는 뜨지 않는다', (_, tpl) => {
    expect(isolatedRoomIds(tpl.build())).toEqual([]);
  });

  it('문을 하나 달면 그 문으로 이어진 방은 목록에서 빠진다', () => {
    const plan = sampleUpload();
    const before = isolatedRoomIds(plan).length;
    // 가운데 세로 벽(거실 | 침실 · 주방)에 문을 단다
    const mid = plan.walls
      .filter((w) => Math.abs(w.a.x - w.b.x) < 0.05)
      .sort((a, b) => Math.abs(a.a.x - 5.45) - Math.abs(b.a.x - 5.45))[0];
    const withDoor: Plan = {
      ...plan,
      openings: [{ id: 'd1', wallId: mid.id, t: 0.25, width: 0.9, kind: 'door', swing: 'left' }],
    };
    expect(isolatedRoomIds(withDoor).length).toBeLessThan(before);
  });
});
