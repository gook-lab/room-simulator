import { describe, expect, it } from 'vitest';
import { OVERLAY_SELECTOR, wheelTargetsCanvas } from '../src/features/editor2d/inputRouting';

/** DOM 없는 환경용 target 스텁 */
const el = (matchedOverlay: boolean) => ({
  closest: (sel: string) => {
    expect(sel).toBe(OVERLAY_SELECTOR);
    return matchedOverlay ? {} : null;
  },
});

describe('wheelTargetsCanvas (입력 라우팅 가드)', () => {
  it('캔버스(오버레이 밖) target → 줌 허용', () => {
    expect(wheelTargetsCanvas(el(false))).toBe(true);
  });

  it('오버레이(카탈로그/인스펙터 등) 서브트리 target → 줌 금지', () => {
    expect(wheelTargetsCanvas(el(true))).toBe(false);
  });

  it('target 없음·closest 미지원(text node 등) → 안전하게 금지', () => {
    expect(wheelTargetsCanvas(null)).toBe(false);
    expect(wheelTargetsCanvas(undefined)).toBe(false);
    expect(wheelTargetsCanvas({} as never)).toBe(false);
  });

  it('OVERLAY_SELECTOR 에 주요 오버레이 클래스 포함', () => {
    for (const cls of ['.float-panel', '.tooldock', '.statusbar', '.viewtabs', '.topbar']) {
      expect(OVERLAY_SELECTOR).toContain(cls);
    }
  });
});

describe('toolForKeyCode (도구 단축키 — 물리 키코드)', () => {
  it('V/H/S/W/D/N/M 매핑, S·W 는 모두 선 그리기', async () => {
    const { toolForKeyCode } = await import('../src/features/editor2d/inputRouting');
    expect(toolForKeyCode('KeyV')).toBe('select');
    expect(toolForKeyCode('KeyH')).toBe('hand');
    expect(toolForKeyCode('KeyS')).toBe('wall');
    expect(toolForKeyCode('KeyW')).toBe('wall');
    expect(toolForKeyCode('KeyD')).toBe('door');
    expect(toolForKeyCode('KeyN')).toBe('window');
    expect(toolForKeyCode('KeyM')).toBe('dimension');
    expect(toolForKeyCode('KeyZ')).toBeNull();
  });
});
