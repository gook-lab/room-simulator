#!/usr/bin/env node
/**
 * 첫 화면 로딩 측정 — 빈 캐시 Chromium 으로 같은 주소를 여러 번 열어 중앙값을 낸다.
 *
 *   PLAYWRIGHT_MODULE=<playwright 패키지 경로> node scripts/measure-first-load.mjs <URL> [회수=3]
 *
 * playwright 는 이 레포의 의존성이 아니라서 다른 곳에 깔린 패키지 경로를 환경 변수로 받는다.
 *
 * 조건 둘: 제한 없음 · 느린 망(4 Mbps 내려받기 / 2 Mbps 올리기 / 40 ms RTT, CDP).
 * 잰 값:
 *   - 첫 그림(FCP): performance 의 first-contentful-paint
 *   - 쓸 수 있는 시각: 대시보드의 "새 도면 만들기" 버튼이 크기를 가진 첫 프레임(navigationStart 기준)
 *   - 요청 수 · 전송량: 쓸 수 있는 시각 + 3초 안에 끝난 요청의 encodedDataLength 합
 *   - 큰 요청 상위 5개(무엇이 첫 화면을 붙잡는지 보려고)
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE;
if (!pwPath) {
  console.error('PLAYWRIGHT_MODULE 환경 변수에 playwright 패키지 경로를 넣어 주세요.');
  process.exit(2);
}
const { chromium } = require(pwPath);

const url = process.argv[2];
const runs = Number(process.argv[3] ?? 3);
if (!url) {
  console.error('사용법: node scripts/measure-first-load.mjs <URL> [회수]');
  process.exit(2);
}

const READY_SELECTOR = '.dashboard__header .btn';
const SETTLE_MS = 3000;
const CONDITIONS = {
  fast: null,
  slow: { offline: false, latency: 40, downloadThroughput: 4e6 / 8, uploadThroughput: 2e6 / 8 },
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function once(browser, throttle) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) await cdp.send('Network.emulateNetworkConditions', throttle);

  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, t: e.timestamp }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) Object.assign(r, { bytes: e.encodedDataLength, end: e.timestamp });
  });

  // 쓸 수 있는 시각은 페이지 안에서 매 프레임 확인해 적는다(프로토콜 왕복 지연을 빼려고).
  await page.addInitScript((sel) => {
    const tick = () => {
      const el = document.querySelector(sel);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) window.__readyAt = performance.now();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, READY_SELECTOR);
  await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForFunction(() => window.__readyAt != null, null, { timeout: 120_000 });
  const ready = await page.evaluate(() => window.__readyAt);
  await page.waitForTimeout(SETTLE_MS);
  const fcp = await page.evaluate(
    () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
  );
  const done = [...reqs.values()].filter((r) => r.bytes != null);
  const bytes = done.reduce((a, r) => a + r.bytes, 0);
  const top = [...done]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map((r) => `${(r.bytes / 1024).toFixed(1)}KB ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 70)}`);
  await context.close();
  return { fcp, ready, requests: done.length, bytes, top };
}

const browser = await chromium.launch();
const out = {};
for (const [name, throttle] of Object.entries(CONDITIONS)) {
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await once(browser, throttle));
  out[name] = {
    fcpMs: Math.round(median(samples.map((s) => s.fcp))),
    readyMs: Math.round(median(samples.map((s) => s.ready))),
    requests: median(samples.map((s) => s.requests)),
    kb: Math.round(median(samples.map((s) => s.bytes)) / 1024),
    samples: samples.map((s) => ({ fcp: Math.round(s.fcp), ready: Math.round(s.ready) })),
    top: samples[0].top,
  };
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
