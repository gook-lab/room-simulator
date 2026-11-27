/**
 * 층 칩을 눌렀을 때 하는 일 (디자인 B-7).
 * - open: 다른 층으로 옮긴다
 * - rename: 지금 층 이름을 바꾼다 (층이 둘 이상일 때만 — 이름이 층을 가리는 수단이라)
 * - label: 누를 거리가 없는 칩이다. 단층 문서의 "단층"이나 받은 도면의 지금 층은
 *   버튼으로 두면 눌러도 반응이 없는 버튼이 되므로 글자 칩으로 그린다.
 */
export type FloorTabAction = 'open' | 'rename' | 'label';

export function floorTabAction(floorCount: number, active: boolean, readOnly: boolean): FloorTabAction {
  if (!active) return 'open';
  if (floorCount <= 1 || readOnly) return 'label';
  return 'rename';
}
