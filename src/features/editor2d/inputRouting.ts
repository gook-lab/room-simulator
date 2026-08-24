/**
 * 입력 라우팅 규칙 (ARCHITECTURE.md "입력 라우팅 규칙" 절 참조)
 *
 * 1. 포인터가 떠 있는 표면이 이벤트의 주인이다.
 *    캔버스 줌/팬은 포인터가 캔버스 위에 있을 때만 — 오버레이(카탈로그·인스펙터·
 *    툴독·상태바·뷰 탭 등) 위의 wheel 은 그 패널의 스크롤로만 소비된다.
 * 2. 패널 스크롤이 끝에 닿아도 캔버스로 체이닝하지 않는다
 *    (.scroll-y 의 overscroll-behavior: contain + 아래 target 가드).
 * 3. 캔버스 위 휠 = 커서 기준 줌 (트랙패드 핀치 ctrlKey wheel 포함). 팬은 Space/휠클릭 드래그.
 *
 * 새 오버레이 패널을 추가하면 반드시 OVERLAY_SELECTOR 에 클래스를 등록할 것.
 */
export const OVERLAY_SELECTOR =
  '.float-panel, .tooldock, .statusbar, .collision-actions, .viewtabs, .topbar';

/**
 * wheel 이벤트를 캔버스 줌으로 라우팅해도 되는가.
 * target이 오버레이 서브트리 안이면 false — 패널 스크롤에 양보한다.
 */
export function wheelTargetsCanvas(
  target: { closest?: (selector: string) => unknown } | null | undefined,
): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  return target.closest(OVERLAY_SELECTOR) == null;
}
