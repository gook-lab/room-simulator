import { describe, expect, it, vi } from 'vitest';
import {
  isApplePlatform,
  isShortcutSheetKey,
  rememberFocus,
  keyLabels,
  sheetKeyAction,
  shortcutGroups,
} from '../src/features/editor2d/shortcuts';
import { OVERLAY_SELECTOR, toolForKeyCode } from '../src/features/editor2d/inputRouting';
import { isEmptyPlan } from '../src/features/editor2d/editorState';
import { TEMPLATES } from '../src/model/templates';
import type { Plan } from '../src/model/types';

describe('키 표기 — 플랫폼별 (디자인 B-3)', () => {
  it('맥 · 아이패드는 ⌘, 윈도 · 리눅스는 Ctrl', () => {
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('macOS')).toBe(true);
    expect(isApplePlatform('iPad')).toBe(true);
    expect(isApplePlatform('Win32')).toBe(false);
    expect(isApplePlatform('Windows')).toBe(false);
    expect(isApplePlatform('Linux x86_64')).toBe(false);
    expect(keyLabels(true).undo).toBe('⌘Z');
    expect(keyLabels(false).undo).toBe('Ctrl+Z');
    expect(keyLabels(false).redo).toBe('Ctrl+Shift+Z');
  });

  it('단축키 목록의 도구 키는 실제 도구 단축키와 같다', () => {
    const tools = shortcutGroups(true).find((g) => g.title === '도구')!.rows;
    for (const row of tools) {
      expect(toolForKeyCode(`Key${row.keys[0]}`)).not.toBeNull();
    }
    const edit = shortcutGroups(false).find((g) => g.title === '편집')!.rows;
    expect(edit.some((r) => r.keys.includes('Ctrl+Z'))).toBe(true);
    expect(JSON.stringify(shortcutGroups(false))).not.toContain('⌘');
  });
});

describe('단축키 시트 열고 닫기 (디자인 B-5)', () => {
  it('? 로 연다 — 영문 key 와 한글 자판의 Shift+Slash 모두', () => {
    expect(isShortcutSheetKey({ key: '?' })).toBe(true);
    expect(isShortcutSheetKey({ key: '/', code: 'Slash', shiftKey: true })).toBe(true);
    expect(isShortcutSheetKey({ key: '/', code: 'Slash', shiftKey: false })).toBe(false);
    expect(sheetKeyAction(false, { key: '?' })).toBe('open');
    expect(sheetKeyAction(false, { key: 'v', code: 'KeyV' })).toBe('pass');
  });

  it('열린 동안 Esc · ? 는 닫고, 도구 키 · Tab 은 뒤 캔버스로 안 넘긴다', () => {
    expect(sheetKeyAction(true, { key: 'Escape' })).toBe('close');
    expect(sheetKeyAction(true, { key: '?' })).toBe('close');
    expect(sheetKeyAction(true, { key: 'Enter' })).toBe('close');
    expect(sheetKeyAction(true, { key: 'd', code: 'KeyD' })).toBe('swallow');
    expect(sheetKeyAction(true, { key: 'z', code: 'KeyZ' })).toBe('swallow');
    expect(sheetKeyAction(true, { key: 'Tab' })).toBe('swallow');
  });

  it('닫으면 연 순간 포커스가 있던 곳으로 돌아간다', () => {
    const opener = { focus: vi.fn(), isConnected: true };
    const restore = rememberFocus(opener);
    expect(opener.focus).not.toHaveBeenCalled();
    restore();
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });

  it('연 버튼이 사라졌으면 포커스를 옮기지 않는다', () => {
    const gone = { focus: vi.fn(), isConnected: false };
    rememberFocus(gone)();
    expect(gone.focus).not.toHaveBeenCalled();
    expect(() => rememberFocus(null)()).not.toThrow();
  });

  it('시트 · 빈 상태 카드 · 안내 칩은 오버레이로 등록돼 휠이 캔버스 줌으로 새지 않는다', () => {
    for (const cls of ['.shortcut-sheet', '.empty-state', '.miss-hint']) {
      expect(OVERLAY_SELECTOR).toContain(cls);
    }
  });
});

describe('빈 도면 안내 카드 조건 (디자인 B-4)', () => {
  const blank: Plan = {
    id: 'p',
    name: '새 도면',
    unitScale: 60,
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    updatedAt: '',
  };

  it('벽 · 가구 · 밑그림이 없으면 보이고, 첫 벽이 생기면 사라진다', () => {
    expect(isEmptyPlan(blank)).toBe(true);
    const oneWall = {
      ...blank,
      walls: [{ id: 'w', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness: 0.15, height: 2.4 }],
    };
    expect(isEmptyPlan(oneWall)).toBe(false);
  });

  it('밑그림만 있는 업로드 도면 · 템플릿에는 뜨지 않는다', () => {
    const traced = {
      ...blank,
      tracing: { imageUrl: 'data:', opacity: 0.5, locked: true, visible: true },
    };
    expect(isEmptyPlan(traced)).toBe(false);
    for (const tpl of TEMPLATES) expect(isEmptyPlan(tpl.build())).toBe(false);
  });
});
