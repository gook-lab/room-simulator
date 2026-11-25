/**
 * 단축키 표기 · 목록 · 단축키 시트 키 처리.
 * 키 표기는 플랫폼마다 다르게 쓴다 — 윈도 사용자에게 Cmd 를 보여 주면 못 누른다.
 */

export function isApplePlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function currentPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return uaData?.platform || navigator.platform || navigator.userAgent || '';
}

export type KeyLabels = {
  undo: string;
  redo: string;
  duplicate: string;
};

export function keyLabels(apple: boolean): KeyLabels {
  return apple
    ? { undo: '⌘Z', redo: '⇧⌘Z', duplicate: '⌘D' }
    : { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z', duplicate: 'Ctrl+D' };
}

export type ShortcutRow = { keys: string[]; label: string };
export type ShortcutGroup = { title: string; rows: ShortcutRow[] };

/** 단축키 시트 목록 — 툴독 툴팁 · inputRouting.toolForKeyCode 와 같은 키 */
export function shortcutGroups(apple: boolean): ShortcutGroup[] {
  const k = keyLabels(apple);
  return [
    {
      title: '도구',
      rows: [
        { keys: ['V'], label: '선택' },
        { keys: ['H'], label: '화면 옮기기' },
        { keys: ['S'], label: '선 그리기' },
        { keys: ['D'], label: '문 달기' },
        { keys: ['N'], label: '창 달기' },
        { keys: ['M'], label: '치수 재기' },
      ],
    },
    {
      title: '편집',
      rows: [
        { keys: [k.undo], label: '실행 취소' },
        { keys: [k.redo], label: '다시 실행' },
        { keys: [k.duplicate], label: '복제' },
        { keys: ['Delete'], label: '지우기' },
        { keys: ['←', '↑', '→', '↓'], label: '10cm 옮기기 (Shift 는 1cm)' },
        { keys: ['Esc'], label: '취소 · 선택 풀기' },
      ],
    },
    {
      title: '화면',
      rows: [
        { keys: ['Space'], label: '누른 채 끌어 화면 옮기기' },
        { keys: ['휠'], label: '확대 · 축소' },
        { keys: ['?'], label: '단축키 보기' },
      ],
    },
  ];
}

/** `?` — 영문 · 한글 자판 모두 Shift+/ 이다 */
export function isShortcutSheetKey(e: { key: string; code?: string; shiftKey?: boolean }): boolean {
  return e.key === '?' || (e.code === 'Slash' && e.shiftKey === true);
}

/**
 * 단축키 시트가 열려 있을 때 키 하나를 어떻게 처리할지.
 * 열린 동안 도구 단축키 · 실행 취소가 뒤 캔버스에 먹으면 안 되므로 Esc · ? 외에는 삼킨다.
 */
export function sheetKeyAction(
  open: boolean,
  e: { key: string; code?: string; shiftKey?: boolean },
): 'open' | 'close' | 'swallow' | 'pass' {
  if (!open) return isShortcutSheetKey(e) ? 'open' : 'pass';
  if (e.key === 'Escape' || isShortcutSheetKey(e)) return 'close';
  // 시트 안 조작할 것은 닫기 버튼 하나다. Enter · Space 는 그 버튼을 누른 것으로 보고,
  // Tab 은 삼켜 포커스를 시트 안에 둔다
  if (e.key === 'Enter' || e.key === ' ') return 'close';
  return 'swallow';
}
