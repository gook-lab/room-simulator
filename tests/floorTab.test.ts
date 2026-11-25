import { describe, expect, it } from 'vitest';
import { floorTabAction } from '../src/components/floorTab';

describe('floorTabAction (층 칩을 눌렀을 때 하는 일, 디자인 B-7)', () => {
  it('단층 문서의 "단층" 칩은 누를 거리가 없는 글자 칩이다', () => {
    expect(floorTabAction(1, true, false)).toBe('label');
  });

  it('층이 둘 이상이면 지금 층 칩은 이름 바꾸기, 다른 층 칩은 열기다', () => {
    expect(floorTabAction(2, true, false)).toBe('rename');
    expect(floorTabAction(2, false, false)).toBe('open');
  });

  it('받은 도면에서는 지금 층 이름을 바꿀 수 없고 다른 층은 열 수 있다', () => {
    expect(floorTabAction(2, true, true)).toBe('label');
    expect(floorTabAction(2, false, true)).toBe('open');
  });
});
