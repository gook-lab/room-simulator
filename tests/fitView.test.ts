import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/model/templates';
import { createSamplePlan } from '../src/model/samplePlan';
import { planBounds } from '../src/model/geometry';
import type { Plan } from '../src/model/types';
import {
  fitBounds,
  fitCamera,
  makeTransform,
  w2s,
  type ScreenRect,
} from '../src/features/editor2d/view';

/** 실제 화면에서 잰 패널 자리 (에디터 캔버스 기준 px) */
const LAYOUTS: Record<string, { viewport: { w: number; h: number }; panels: ScreenRect[] }> = {
  '1440x900': {
    viewport: { w: 1440, h: 844 },
    panels: [
      { left: 20, top: 24, right: 80, bottom: 431 }, // 툴독
      { left: 1112, top: 24, right: 1420, bottom: 528 }, // 카탈로그
      { left: 20, top: 784, right: 384, bottom: 820 }, // 상태바
    ],
  },
  '1024x768': {
    viewport: { w: 1024, h: 712 },
    panels: [
      { left: 20, top: 24, right: 80, bottom: 431 },
      { left: 724, top: 24, right: 1004, bottom: 454 },
      { left: 20, top: 652, right: 384, bottom: 688 },
    ],
  },
};

/** 밑그림 문서는 좌하단에 밑그림 패널이 하나 더 뜬다 */
const UNDERLAY_PANEL = (h: number): ScreenRect => ({ left: 20, top: h - 84 - 150, right: 238, bottom: h - 84 });

function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function inside(a: ScreenRect, vp: { w: number; h: number }): boolean {
  return a.left >= 0 && a.top >= 0 && a.right <= vp.w && a.bottom <= vp.h;
}

/** 화면에 보여야 하는 것: 평면(문 호 포함) · 위쪽 치수선 · 오른쪽 치수선 */
function visibleParts(plan: Plan, vp: { w: number; h: number }, panels: ScreenRect[]) {
  const t = makeTransform(plan, vp, fitCamera(plan, vp, { obstacles: panels }));
  const f = fitBounds(plan);
  const b = planBounds(plan);
  const fa = w2s(t, f.min);
  const fb = w2s(t, f.max);
  const ba = w2s(t, b.min);
  const bb = w2s(t, b.max);
  return {
    t,
    plan: { left: fa.x, top: fa.y, right: fb.x, bottom: fb.y },
    topDim: { left: ba.x, top: ba.y - 34 - 11, right: bb.x, bottom: ba.y - 34 + 11 },
    rightDim: { left: bb.x + 34 - 31, top: ba.y, right: bb.x + 34 + 31, bottom: bb.y },
  };
}

const SAMPLE_UPLOAD: Plan = {
  id: 'upload-like',
  name: '샘플 도면',
  unitScale: 60,
  walls: [
    { id: 'a', a: { x: 1.9, y: 1.1 }, b: { x: 9.7, y: 1.1 }, thickness: 0.2, height: 2.4 },
    { id: 'b', a: { x: 9.7, y: 1.1 }, b: { x: 9.7, y: 6.7 }, thickness: 0.2, height: 2.4 },
    { id: 'c', a: { x: 9.7, y: 6.7 }, b: { x: 1.9, y: 6.7 }, thickness: 0.2, height: 2.4 },
    { id: 'd', a: { x: 1.9, y: 6.7 }, b: { x: 1.9, y: 1.1 }, thickness: 0.2, height: 2.4 },
  ],
  openings: [],
  rooms: [],
  items: [],
  tracing: { imageUrl: 'data:', opacity: 0.5, locked: true, visible: true, widthM: 10.9, heightM: 7.8 },
  updatedAt: '',
};

describe('fitCamera — 패널을 뺀 영역에 맞춤 (QA B-06)', () => {
  const plans: [string, Plan][] = [
    ...TEMPLATES.map((tpl) => [tpl.name, tpl.build()] as [string, Plan]),
    ['우리집 리모델링', createSamplePlan()],
  ];

  for (const [layoutName, { viewport, panels }] of Object.entries(LAYOUTS)) {
    for (const [name, plan] of plans) {
      it(`${layoutName} · ${name}: 평면 · 문 호 · 치수선이 화면 안이고 패널과 겹치지 않는다`, () => {
        const parts = visibleParts(plan, viewport, panels);
        for (const rect of [parts.plan, parts.topDim, parts.rightDim]) {
          expect(inside(rect, viewport)).toBe(true);
          for (const p of panels) expect(overlaps(rect, p)).toBe(false);
        }
      });
    }

    it(`${layoutName} · 샘플 업로드: 밑그림 패널까지 피한다`, () => {
      const withUnderlay = [...panels, UNDERLAY_PANEL(viewport.h)];
      const parts = visibleParts(SAMPLE_UPLOAD, viewport, withUnderlay);
      for (const rect of [parts.plan, parts.topDim, parts.rightDim]) {
        expect(inside(rect, viewport)).toBe(true);
        for (const p of withUnderlay) expect(overlaps(rect, p)).toBe(false);
      }
    });
  }

  it('모서리 패널은 도면이 더 크게 보이는 쪽 띠로 피한다', () => {
    const { viewport, panels } = LAYOUTS['1024x768'];
    const withUnderlay = [...panels, UNDERLAY_PANEL(viewport.h)];
    const zoom = fitCamera(SAMPLE_UPLOAD, viewport, { obstacles: withUnderlay }).zoom;
    // 밑그림 패널을 왼쪽 띠로만 피하면 가로 418px 에 10m 도면을 넣어야 한다 (zoom ≈ 0.45)
    expect(zoom).toBeGreaterThan(0.55);
  });

  it('패널이 없으면 도면 상자 중심이 뷰포트 중심에 온다', () => {
    const plan = TEMPLATES[1].build();
    const viewport = { w: 1200, h: 800 };
    const parts = visibleParts(plan, viewport, []);
    // 주석 자리(왼쪽 16 · 오른쪽 72 · 위 52 · 아래 16)까지 넣은 상자
    expect((parts.plan.left - 16 + parts.plan.right + 72) / 2).toBeCloseTo(600, 3);
    expect((parts.plan.top - 52 + parts.plan.bottom + 16) / 2).toBeCloseTo(400, 3);
  });
});

describe('fitBounds — 벽 선 밖으로 나가는 것까지 담는다', () => {
  it('밖으로 열리는 현관문 호가 범위에 들어간다 (34평 남쪽 현관)', () => {
    const plan = TEMPLATES.find((tpl) => tpl.name === '34평 아파트')!.build();
    const b = planBounds(plan);
    const f = fitBounds(plan);
    expect(f.max.y).toBeGreaterThan(b.max.y + 0.8);
  });

  it('닫힌 문 · 미닫이문은 호가 없어 범위를 넓히지 않는다', () => {
    const plan = TEMPLATES.find((tpl) => tpl.name === '34평 아파트')!.build();
    const closed = {
      ...plan,
      openings: plan.openings.map((o) => (o.id === 'o-door-entry' ? { ...o, open: false } : o)),
    };
    expect(fitBounds(closed).max.y).toBeLessThan(planBounds(plan).max.y + 0.2);
  });
});
