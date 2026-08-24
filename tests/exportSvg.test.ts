import { describe, expect, it } from 'vitest';
import { renderPlanSvgString } from '../src/features/editor2d/ExportSvg';
import { createSamplePlan } from '../src/model/samplePlan';
import { TEMPLATES } from '../src/model/templates';
import { createWallItem } from '../src/model/wallItems';

describe('renderPlanSvgString (도면 SVG 내보내기)', () => {
  it('독립 SVG — xmlns·흰 배경·룸 라벨·외곽 치수 포함', () => {
    const svg = renderPlanSvgString(createSamplePlan());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('#ffffff');
    expect(svg).toContain('거실');
    expect(svg).toContain('10.4 m');
    expect(svg).toContain('7.1 m');
  });

  it('CSS 변수 폰트가 실제 스택으로 치환된다', () => {
    const svg = renderPlanSvgString(createSamplePlan());
    expect(svg).not.toContain('var(--font');
    expect(svg).toContain('ui-monospace');
  });

  it('치수 주석·벽 부착 아이템·마감 채움 포함', () => {
    const plan = {
      ...createSamplePlan(),
      dimensions: [{ id: 'dim-1', a: { x: 1, y: 1 }, b: { x: 4.1, y: 1 } }],
      wallItems: [createWallItem('wall-clock', 'w-n', 0.1, 'front')],
      rooms: createSamplePlan().rooms.map((r) =>
        r.id === 'r-living' ? { ...r, floorFinish: 'herringbone' } : r,
      ),
    };
    const svg = renderPlanSvgString(plan);
    expect(svg).toContain('3.10 m'); // 치수 주석 라벨
    expect(svg).toContain('#f4ecdd'); // 헤링본 2D 색
    expect(svg).toContain('Roomcast'); // 푸터
  });

  it('템플릿 전부 렌더 가능 (크래시·빈 출력 없음)', () => {
    for (const tpl of TEMPLATES) {
      const svg = renderPlanSvgString(tpl.build());
      expect(svg.length).toBeGreaterThan(2000);
      expect(svg).toContain('</svg>');
    }
  });
});
