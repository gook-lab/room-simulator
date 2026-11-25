import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NarrowScreenNotice } from '../src/components/NarrowScreenNotice';

describe('좁은 창 안내', () => {
  it('깨진 화면 대신 데스크톱용이라는 이유를 해요체로 알려 준다', () => {
    const html = renderToStaticMarkup(createElement(NarrowScreenNotice));
    expect(html).toContain('데스크톱 화면에 맞춰져 있어요');
    expect(html).toContain('창을 더 넓게 열거나 컴퓨터에서 열어 주세요.');
  });
});
