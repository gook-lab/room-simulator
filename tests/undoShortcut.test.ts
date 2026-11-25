import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../src/state/store';
import { handleUndoKey } from '../src/state/useUndoShortcut';
import type { View } from '../src/model/types';

const st = () => useStore.getState();
const cur = () => st().plans[st().currentPlanId];

function cmdZ(over: Partial<Parameters<typeof handleUndoKey>[0]> = {}) {
  const e = {
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    key: 'z',
    target: null,
    preventDefault: vi.fn(),
    ...over,
  };
  handleUndoKey(e);
  return e;
}

/** 가구 하나를 지우는 편집(커밋) — 되돌리면 개수가 돌아온다 */
function removeFirstItem() {
  st().updatePlan((p) => ({ ...p, items: p.items.slice(1) }));
}

describe('Cmd+Z 화면 가드 (QA B-02)', () => {
  beforeEach(() => st().openPlan(st().planOrder[0]));

  it('대시보드 · 업로드에서는 도면 편집을 되돌리지 않는다', () => {
    const before = cur().items.length;
    removeFirstItem();
    for (const screen of ['dashboard', 'upload'] as const) {
      st().navigate(screen);
      const mac = cmdZ();
      const win = cmdZ({ metaKey: false, ctrlKey: true });
      expect(cur().items, screen).toHaveLength(before - 1);
      expect(mac.preventDefault).not.toHaveBeenCalled();
      expect(win.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('에디터 2D · 워크스루 · 조감도에서는 되돌리고 다시 실행한다', () => {
    for (const view of ['2d', 'walkthrough', 'birdseye'] as View[]) {
      st().openPlan(st().planOrder[0]);
      st().setView(view);
      const before = cur().items.length;
      removeFirstItem();
      cmdZ();
      expect(cur().items, `${view} undo`).toHaveLength(before);
      cmdZ({ shiftKey: true });
      expect(cur().items, `${view} redo`).toHaveLength(before - 1);
    }
  });

  it('입력란 안의 Cmd+Z 는 입력란 몫이다', () => {
    const before = cur().items.length;
    removeFirstItem();
    cmdZ({ target: { tagName: 'INPUT' } as unknown as EventTarget });
    expect(cur().items).toHaveLength(before - 1);
  });
});
