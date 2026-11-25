import { describe, expect, it } from 'vitest';
import type { Plan } from '../src/model/types';
import { TEMPLATES } from '../src/model/templates';
import { roomConnectivity } from '../src/model/roomConnectivity';
import { traceRaster } from '../src/features/upload/autoTrace';
import { buildAutoGeometry, underlaySize } from '../src/model/underlay';
import { rasterPlan, type Shape } from './rasterPlan';

const R = (x0: number, y0: number, x1: number, y1: number, lum = 0): Shape => ({ rect: [x0, y0, x1, y1], lum });

/** 업로드 화면과 같은 경로로 인식한 도면 */
function uploaded(shapes: Shape[], srcW: number, srcH: number, knownWidthM?: number): Plan {
  const paperW = 780;
  const paperH = Math.round((paperW * srcH) / srcW);
  const trace = traceRaster(
    rasterPlan(paperW, paperH, shapes, paperW / srcW),
    paperW,
    paperH,
    { top: 0, height: paperH },
    knownWidthM ? { knownWidthM } : undefined,
  );
  const size = underlaySize(srcW, srcH, knownWidthM ?? (trace.suggestedWidthM || 10));
  let n = 0;
  const g = buildAutoGeometry(trace, paperW, paperH, size.widthM, size.heightM, () => `u${n++}-ad${n}`);
  return { id: 'up', name: '업로드', unitScale: 60, items: [], updatedAt: 'now', ...g };
}

const lum = 0x6e * 0.299 + 0x6a * 0.587 + 0x63 * 0.114;
const SAMPLE_PLAN: Shape[] = [
  R(138, 78, 702, 82, lum),
  R(138, 478, 702, 482, lum),
  R(138, 78, 142, 482, lum),
  R(698, 78, 702, 482, lum),
  R(418, 80, 422, 480, lum),
  R(420, 268, 700, 272, lum),
];

describe('방 연결 판정 (roomConnectivity)', () => {
  it('샘플 업로드(문 0): 방 3개가 모두 벽으로 막혀 셋 다 이어지지 않은 방', () => {
    const plan = uploaded(SAMPLE_PLAN, 780, 560, 10.9);
    expect(plan.rooms).toHaveLength(3);
    expect(plan.openings).toHaveLength(0);
    const c = roomConnectivity(plan);
    expect(c.links).toHaveLength(3); // 거실-침실 · 거실-주방 · 침실-주방
    expect(c.links.every((l) => l.via === null)).toBe(true);
    expect(c.isolatedRoomIds).toHaveLength(3);
    expect(c.groupCount).toBe(3);
  });

  it('업로드에서 문을 찾은 벽은 이어짐: 문 하나 → 두 방 연결, 남은 한 방만 고립', () => {
    const T = 6;
    const plan = uploaded(
      [
        R(100, 100, 1100, 100 + T),
        R(100, 700 - T, 1100, 700),
        R(100, 100, 100 + T, 700),
        R(1100 - T, 100, 1100, 700),
        R(600, 100, 600 + T, 400), // 400..430 문 갭 — 오른쪽 방 ↔ 왼쪽 아래 방
        R(600, 430, 600 + T, 700),
        R(100, 380, 600, 380 + T),
      ],
      1200,
      800,
    );
    expect(plan.rooms).toHaveLength(3);
    expect(plan.openings.filter((o) => o.kind === 'door')).toHaveLength(1);
    const c = roomConnectivity(plan);
    expect(c.links.filter((l) => l.via === 'door')).toHaveLength(1);
    expect(c.isolatedRoomIds).toHaveLength(1);
    expect(c.groupCount).toBe(2);
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))('템플릿 %s: 모든 방이 이어져 고립된 방 0', (_, tpl) => {
    const c = roomConnectivity(tpl.build());
    expect(c.isolatedRoomIds).toEqual([]);
    expect(c.groupCount).toBe(1);
  });

  it('열린 통로(divider 사이 빈 곳)도 이어진 것으로 본다 — 25평 주방 ↔ 거실', () => {
    const plan = TEMPLATES.find((t) => t.id === 'tpl-59')!.build();
    const link = roomConnectivity(plan).links.find(
      (l) => [l.a, l.b].sort().join() === ['r-kitchen', 'r-living'].sort().join(),
    );
    expect(link?.via).toBe('passage');
  });

  it('창은 통로가 아니다 — 34평 팬트리 문을 같은 자리 창으로 바꾸면 팬트리만 고립', () => {
    const plan = TEMPLATES.find((t) => t.id === 'tpl-84')!.build();
    const pantryWindow = {
      ...plan,
      openings: plan.openings.map((o) => (o.id === 'o-door-pantry' ? { ...o, kind: 'window' as const } : o)),
    };
    const c = roomConnectivity(pantryWindow);
    expect(c.isolatedRoomIds).toEqual(['r-pantry']);
    expect(c.groupCount).toBe(2);
  });

  it('닫힌 문도 문이다 — 원룸 욕실 문(open:false)으로 두 방이 이어짐', () => {
    const plan = TEMPLATES.find((t) => t.id === 'tpl-studio')!.build();
    expect(plan.openings.find((o) => o.id === 'o-door-bath')?.open).toBe(false);
    const c = roomConnectivity(plan);
    expect(c.links).toEqual([expect.objectContaining({ via: 'door' })]);
    const noDoor = roomConnectivity({ ...plan, openings: plan.openings.filter((o) => o.kind !== 'door') });
    expect(noDoor.isolatedRoomIds).toHaveLength(2);
  });

  it('방이 하나뿐이면 고립으로 세지 않는다', () => {
    const plan = TEMPLATES[0].build();
    expect(roomConnectivity({ ...plan, rooms: plan.rooms.slice(0, 1) }).isolatedRoomIds).toEqual([]);
  });
});
