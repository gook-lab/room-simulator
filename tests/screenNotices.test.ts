import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NarrowScreenNotice } from '../src/components/NarrowScreenNotice';
import { CanvasBoundary, GlFallback } from '../src/features/three/CanvasBoundary';

describe('좁은 창 안내', () => {
  it('깨진 화면 대신 데스크톱용이라는 이유를 해요체로 알려 준다', () => {
    const html = renderToStaticMarkup(createElement(NarrowScreenNotice));
    expect(html).toContain('데스크톱 화면에 맞춰져 있어요');
    expect(html).toContain('창을 더 넓게 열거나 컴퓨터에서 열어 주세요.');
  });
});

describe('WebGL 폴백', () => {
  it('3D 를 못 그리는 이유와 [평면도로 돌아가기] 를 보여 준다', () => {
    const html = renderToStaticMarkup(createElement(GlFallback, { tone: 'light', onBack: () => {} }));
    expect(html).toContain('이 브라우저에선 3D를 볼 수 없어요');
    expect(html).toContain('평면도로 돌아가기');
    expect(html).toContain('gl-fallback--light');
  });

  it('돌아갈 곳이 없으면 버튼 없이 안내만 둔다', () => {
    const html = renderToStaticMarkup(createElement(GlFallback, { tone: 'dark' }));
    expect(html).not.toContain('<button');
  });

  it('캔버스가 실패하면 부모에게 알려 이동 · 메뉴 HUD 를 걷어 내게 한다', () => {
    let failed = 0;
    const boundary = new CanvasBoundary({ children: null, onFail: () => failed++ });
    expect(CanvasBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    boundary.componentDidCatch();
    expect(failed).toBe(1);
  });
});
