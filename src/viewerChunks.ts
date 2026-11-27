import { lazy } from 'react';

/**
 * 3D 화면(워크스루 · 조감도)은 three.js · R3F · drei 를 끌고 와 번들의 대부분을 차지한다.
 * 첫 화면(대시보드)에는 필요 없으므로 따로 받는다(46차 측정: DECISIONS "첫 화면 로딩").
 */
const loadWalkthrough = () =>
  import('./features/walkthrough/Walkthrough').then((m) => ({ default: m.Walkthrough }));
const loadBirdseye = () => import('./features/birdseye/Birdseye').then((m) => ({ default: m.Birdseye }));

/** lazy 컴포넌트 묶음. 받기에 실패하면 lazy 가 그 실패를 기억하므로 다시 시도할 때 새로 만든다. */
export function makeViewerViews() {
  return { Walkthrough: lazy(loadWalkthrough), Birdseye: lazy(loadBirdseye) };
}

let prefetched = false;

/** 도면을 연 뒤 쉬는 틈에 3D 코드를 미리 받는다. 실패해도 조용히 넘기고 들어갈 때 다시 받는다. */
export function prefetchViewers(): void {
  if (prefetched) return;
  prefetched = true;
  const run = () => {
    loadWalkthrough().catch(() => (prefetched = false));
    loadBirdseye().catch(() => (prefetched = false));
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
