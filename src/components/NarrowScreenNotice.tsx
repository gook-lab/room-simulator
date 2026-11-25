/**
 * 900px 미만 창에서만 보이는 안내(보이고 숨는 건 app.css 미디어 쿼리).
 * 모바일은 지원 범위 밖이라 깨진 화면 대신 이유를 보여 준다.
 */
export function NarrowScreenNotice() {
  return (
    <section className="narrow-notice" aria-labelledby="narrow-notice-title">
      <span className="brand__mark" aria-hidden="true" />
      <h1 id="narrow-notice-title" className="narrow-notice__title">
        데스크톱 화면에 맞춰져 있어요
      </h1>
      <p className="narrow-notice__desc">창을 더 넓게 열거나 컴퓨터에서 열어 주세요.</p>
    </section>
  );
}
