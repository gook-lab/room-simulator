import { describe, expect, it } from 'vitest';
import { hotkeyAllowed, movementAllowed } from '../src/features/walkthrough/menu';

describe('워크스루 인게임 메뉴 가드 (Tab=메뉴+커서 모드)', () => {
  it('이동은 포인터 락 + 편집 패널 닫힘일 때만 허용', () => {
    expect(movementAllowed(true, false)).toBe(true);
    // 메뉴(커서 모드) 표시 중 — 키가 눌려 있어도 이동 정지
    expect(movementAllowed(false, false)).toBe(false);
    // 편집 패널 열림
    expect(movementAllowed(true, true)).toBe(false);
    expect(movementAllowed(false, true)).toBe(false);
  });

  it('핫키(Space/E/P)는 락 상태에서만 — 메뉴 중 무시', () => {
    expect(hotkeyAllowed(true)).toBe(true);
    expect(hotkeyAllowed(false)).toBe(false);
  });
});
