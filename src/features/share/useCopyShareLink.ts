import { useCallback } from 'react';
import { buildShareLink } from '../../model/shareLink';
import { useStore } from '../../state/store';

/**
 * 링크를 만들어 클립보드에 넣고 결과를 알림으로 띄운다.
 * 압축이 비동기라 Safari 는 await 뒤 writeText 를 사용자 동작 밖으로 보고 거절한다 —
 * Promise 를 받는 ClipboardItem 으로 먼저 쓰고, 안 되면 writeText 로 넘어간다.
 */
async function writeClipboard(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    }
  } catch {
    // 아래 writeText 로
  }
  try {
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

export function useCopyShareLink() {
  const showToast = useStore((s) => s.showToast);

  return useCallback(
    async (planId?: string) => {
      const { plans, currentPlanId } = useStore.getState();
      const plan = plans[planId ?? currentPlanId];
      if (!plan) return;
      const link = buildShareLink(plans, plan, window.location.href);
      const copied = await writeClipboard(link.then((l) => l.url));
      const { url, floorCount, droppedUnderlay } = await link;

      const notes = [
        floorCount > 1 ? `${floorCount}개 층을 모두 담았어요.` : '',
        droppedUnderlay ? '밑그림 이미지는 링크에 담기지 않아서 빼고 보냈어요.' : '',
      ].filter(Boolean);
      if (copied) {
        showToast('링크를 복사했어요', notes.join(' ') || '받은 분은 보기 전용으로 열어요.');
        return;
      }
      window.prompt('이 링크를 복사해 보내 주세요', url);
      if (notes.length > 0) showToast('링크를 만들었어요', notes.join(' '));
    },
    [showToast],
  );
}
