import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissBoot } from '../src/boot';

// 46차 첫인상: index.html 시작 화면 · public/404.html · 3D 청크 분리를 묶어 둔다.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const indexHtml = read('index.html');
const notFoundHtml = read('public/404.html');
const tokens = read('src/styles/tokens.css');

function token(name: string): string {
  const m = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`토큰 없음: --${name}`);
  return m[1].trim().toLowerCase();
}

describe('index.html 시작 화면', () => {
  it('CSS 가 오기 전에 쓰는 색이 tokens.css 와 같다', () => {
    const inlineCss = indexHtml.toLowerCase();
    for (const name of ['app-bg', 'ink', 'text-2', 'accent', 'accent-deep', 'accent-deeper', 'neutral-fill']) {
      expect(inlineCss, `--${name}`).toContain(token(name));
    }
  });

  it('JS 꺼짐 안내 · 다시 불러오기 · 15초 느린 망 안내가 있다', () => {
    expect(indexHtml).toMatch(/<noscript>[\s\S]*JavaScript 를 켜야/);
    expect(indexHtml).toMatch(/class="boot__retry"[^>]*hidden/);
    expect(indexHtml).toContain('15000');
    expect(indexHtml).toContain('연결이 느려요');
  });

  it('글꼴 스타일시트가 첫 그림을 막지 않는다', () => {
    const fontLinks = indexHtml.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) ?? [];
    // noscript 안의 하나를 빼면 모두 media="print" 로 늦게 붙는다
    const blocking = fontLinks.filter((l) => !l.includes('media="print"'));
    expect(blocking.length).toBe(1);
    expect(indexHtml.indexOf(blocking[0])).toBeGreaterThan(indexHtml.indexOf('<noscript>'));
  });
});

describe('public/404.html', () => {
  it('검색에서 빼고, JS 없이, 처음 화면으로 가는 링크가 있다', () => {
    expect(notFoundHtml).toContain('<meta name="robots" content="noindex" />');
    expect(notFoundHtml).not.toMatch(/<script/i);
    expect(notFoundHtml).toMatch(/<a class="home" href="\/">처음 화면으로<\/a>/);
  });
});

describe('3D 청크 분리', () => {
  it('App 은 워크스루 · 조감도를 정적으로 가져오지 않는다(첫 화면 번들에 three.js 가 다시 들어오지 않게)', () => {
    const app = read('src/App.tsx');
    expect(app).not.toMatch(/from '\.\/features\/(walkthrough|birdseye)\//);
    const chunks = read('src/viewerChunks.ts');
    expect(chunks).toContain("import('./features/walkthrough/Walkthrough')");
    expect(chunks).toContain("import('./features/birdseye/Birdseye')");
  });
});

describe('dismissBoot', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeDoc(reduce: boolean) {
    const el = {
      dataset: {} as Record<string, string>,
      removed: 0,
      remove() {
        this.removed++;
      },
      addEventListener: vi.fn(),
    };
    let present = true;
    const doc = {
      getElementById: (id: string) => (id === 'boot' && present ? el : null),
      defaultView: { matchMedia: () => ({ matches: reduce }) },
    };
    el.remove = function () {
      this.removed++;
      present = false;
    };
    return { doc: doc as unknown as Document, el };
  }

  it('축소 모션이면 바로 지운다', () => {
    const { doc, el } = fakeDoc(true);
    dismissBoot(doc);
    expect(el.removed).toBe(1);
    expect(el.dataset.state).toBeUndefined();
  });

  it('아니면 흐려지는 상태로 바꾸고 늦어도 0.4초 뒤 지운다. 두 번 불러도 한 번만 처리한다', () => {
    vi.useFakeTimers();
    const { doc, el } = fakeDoc(false);
    dismissBoot(doc);
    dismissBoot(doc);
    expect(el.dataset.state).toBe('leaving');
    expect(el.addEventListener).toHaveBeenCalledTimes(1);
    expect(el.removed).toBe(0);
    vi.advanceTimersByTime(400);
    expect(el.removed).toBe(1);
  });

  it('시작 화면이 없으면 아무것도 하지 않는다', () => {
    const doc = { getElementById: () => null } as unknown as Document;
    expect(() => dismissBoot(doc)).not.toThrow();
  });
});
