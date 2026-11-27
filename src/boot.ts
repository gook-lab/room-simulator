/**
 * index.html 의 시작 화면(#boot)을 걷는다. 앱이 첫 화면을 그린 뒤 한 번 부른다.
 * 축소 모션이면 바로 지우고, 아니면 0.18초 흐려진 뒤 지운다. 여러 번 불러도 된다.
 */
export function dismissBoot(doc: Document = document): void {
  const el = doc.getElementById('boot');
  if (!el || el.dataset.state === 'leaving') return;
  const reduce = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduce) {
    el.remove();
    return;
  }
  el.dataset.state = 'leaving';
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  // transitionend 가 안 오는 경우(탭이 숨겨짐 등)에도 지운다
  setTimeout(() => el.remove(), 400);
}
