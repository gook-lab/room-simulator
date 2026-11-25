import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/model/templates';
import { createSamplePlan } from '../src/model/samplePlan';
import { catalogById } from '../src/model/catalog';
import { itemAabb, pointInPolygon } from '../src/model/geometry';
import type { Plan } from '../src/model/types';
import { layoutRoomLabels, roomLabelSpec, textWidthPx } from '../src/features/editor2d/roomLabels';
import { readFileSync } from 'node:fs';
import { BASE_PX_PER_M, fitCamera } from '../src/features/editor2d/view';
import { renderPlanSvgString, resolveCssVars } from '../src/features/editor2d/ExportSvg';

/** 이름표 상자 (world) */
function labelBox(plan: Plan, roomId: string, pxPerM: number) {
  const { at, spec } = layoutRoomLabels(plan, pxPerM).get(roomId)!;
  const hw = spec.wPx / 2 / pxPerM;
  const hh = spec.hPx / 2 / pxPerM;
  return { min: { x: at.x - hw, y: at.y - hh }, max: { x: at.x + hw, y: at.y + hh } };
}

function hitsFurniture(plan: Plan, box: { min: { x: number; y: number }; max: { x: number; y: number } }) {
  return plan.items
    .filter((it) => !it.parentId && catalogById.get(it.catalogId)?.category !== 'rug')
    .filter((it) => {
      const a = itemAabb(it);
      return a.min.x < box.max.x && box.min.x < a.max.x && a.min.y < box.max.y && box.min.y < a.max.y;
    })
    .map((it) => it.catalogId);
}

const t25 = () => TEMPLATES.find((tpl) => tpl.name === '25평 아파트')!.build();

describe('layoutRoomLabels — 방 이름표가 가구를 피한다 (QA B-07)', () => {
  // 1440×900 · 1024×768 에서 템플릿을 열 때의 화면 맞춤 배율과 기본 배율(66px/m)
  const fitScales = [
    { w: 1440, h: 844, panels: [[20, 24, 80, 431], [1112, 24, 1420, 528], [20, 784, 384, 820]] },
    { w: 1024, h: 712, panels: [[20, 24, 80, 431], [724, 24, 1004, 454], [20, 652, 384, 688]] },
  ].map(({ w, h, panels }) => {
    const obstacles = panels.map(([left, top, right, bottom]) => ({ left, top, right, bottom }));
    return Math.round(fitCamera(t25(), { w, h }, { obstacles }).zoom * BASE_PX_PER_M);
  });
  for (const pxPerM of [...fitScales, BASE_PX_PER_M]) {
    it(`25평 주방 · 안방 · 거실 이름표가 가구와 겹치지 않는다 (${pxPerM}px/m)`, () => {
      const plan = t25();
      for (const name of ['주방', '안방', '거실']) {
        const room = plan.rooms.find((r) => r.name === name)!;
        expect(hitsFurniture(plan, labelBox(plan, room.id, pxPerM))).toEqual([]);
      }
    });
  }

  it('이름표는 제 방 안에 있다 (템플릿 3종 · 샘플)', () => {
    for (const plan of [...TEMPLATES.map((tpl) => tpl.build()), createSamplePlan()]) {
      const spots = layoutRoomLabels(plan, 66);
      for (const room of plan.rooms) {
        expect(pointInPolygon(spots.get(room.id)!.at, room.polygon)).toBe(true);
      }
    }
  });

  it('가구가 없는 방은 넓이 중심에 둔다', () => {
    const plan = { ...t25(), items: [], openings: [] };
    const room = plan.rooms.find((r) => r.name === '거실')!;
    const xs = room.polygon.map((p) => p.x);
    const spot = layoutRoomLabels(plan, 66).get(room.id)!.at;
    expect(spot.x).toBeGreaterThan(Math.min(...xs));
    expect(spot.x).toBeLessThan(Math.max(...xs));
    // 가구를 다 빼면 가구 있는 배치와 자리가 달라진다 (가구를 실제로 피했다는 뜻)
    const withFurniture = layoutRoomLabels(t25(), 66).get(room.id)!.at;
    expect(withFurniture).not.toEqual(spot);
  });

  it('큰 방은 이름 · 면적 두 줄, 작은 방은 한 줄', () => {
    const plan = t25();
    const living = roomLabelSpec(plan.rooms.find((r) => r.name === '거실')!);
    const bath = roomLabelSpec(plan.rooms.find((r) => r.name === '공용 욕실')!);
    expect(living.kind).toBe('big');
    expect(living.lines).toHaveLength(2);
    expect(bath.kind).toBe('line');
    expect(bath.lines[0]).toContain('공용 욕실 · ');
  });

  it('글자 폭 어림: 한글은 숫자보다 넓다', () => {
    expect(textWidthPx('거실', 12)).toBeGreaterThan(textWidthPx('12', 12));
  });
});

describe('내보내기 SVG 의 이름표', () => {
  // vitest 는 CSS ?raw 가져오기를 빈 문자열로 돌려줘서 tokens.css 원문을 직접 넘긴다
  it('받침 · 글자 색 토큰이 tokens.css 값으로 풀린다', () => {
    const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
    const svg = resolveCssVars(renderPlanSvgString(t25()), css);
    expect(svg).not.toMatch(/var\(--/);
    expect(svg).toContain('fill="#ffffff" opacity="0.85"');
    expect(svg).toContain('거실');
  });

  it('없는 토큰은 그대로 둔다', () => {
    expect(resolveCssVars('fill="var(--nope)"', '--panel: #ffffff;')).toBe('fill="var(--nope)"');
  });
});
