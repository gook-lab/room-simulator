/** 받침이 있는 숫자 읽기 — 0(영) 1(일) 3(삼) 6(육) 7(칠) 8(팔) */
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8']);

/** 끝 글자에 받침이 있는가. 한글 · 숫자 외(영문 등)는 받침 없음으로 본다 */
export function hasBatchim(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return DIGIT_BATCHIM.has(last);
}

/** "소파와" · "책장과" */
export function withAnd(word: string): string {
  return `${word}${hasBatchim(word) ? '과' : '와'}`;
}
