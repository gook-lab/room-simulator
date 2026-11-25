/**
 * markup 의 var(--색토큰) 을 css(tokens.css 원문)의 값으로 바꾼다. 독립 SVG 파일에는
 * 앱 스타일시트가 없어 풀어 써야 한다. 없는 토큰은 그대로 둔다.
 */
export function resolveCssVars(markup: string, css: string): string {
  const values = new Map(
    [...css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\));/gi)].map((m) => [m[1], m[2]]),
  );
  return markup.replace(/var\((--[a-z0-9-]+)\)/gi, (whole, name: string) => values.get(name) ?? whole);
}
