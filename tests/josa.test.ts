import { describe, expect, it } from 'vitest';
import { hasBatchim, withAnd } from '../src/features/editor2d/josa';

describe('끌기 경고 칩 조사 — "소파와 겹쳐요" · "책장과 겹쳐요"', () => {
  it('받침에 따라 와 · 과', () => {
    expect(withAnd('린넨 3인 소파')).toBe('린넨 3인 소파와');
    expect(withAnd('슬림 책장')).toBe('슬림 책장과');
    expect(withAnd('퀸 패브릭 베드')).toBe('퀸 패브릭 베드와');
  });

  it('숫자 · 영문으로 끝나는 이름', () => {
    expect(withAnd('LTV 콘솔 1600')).toBe('LTV 콘솔 1600과');
    expect(withAnd('스툴 2')).toBe('스툴 2와');
    expect(hasBatchim('TV')).toBe(false);
  });
});
