/**
 * 900px 미만 창에서만 보이는 안내(보이고 숨는 건 app.css 미디어 쿼리).
 * 모바일은 지원 범위 밖이라 깨진 화면 대신 앱이 무엇인지와 이유를 보여 준다.
 * 표지 그림은 같은 미디어 쿼리 안 CSS 배경이라 넓은 창에서는 받지 않는다.
 */
export function NarrowScreenNotice() {
  return (
    <section className="narrow-notice" aria-labelledby="narrow-notice-title">
      <span className="brand narrow-notice__brand">
        <span className="brand__mark" aria-hidden="true" />
        <span className="brand__word">Room Simulator</span>
      </span>
      <span className="narrow-notice__art" aria-hidden="true" />
      <p className="narrow-notice__lede">평면도를 그리고 가구를 놓은 뒤, 3D로 걸어 보는 인테리어 플래너예요.</p>
      <div className="narrow-notice__card">
        <h1 id="narrow-notice-title" className="narrow-notice__title">
          데스크톱 화면에 맞춰져 있어요
        </h1>
        <p className="narrow-notice__desc">창을 더 넓게 열거나 컴퓨터에서 열어 주세요.</p>
      </div>
    </section>
  );
}
