import { describe, expect, it } from 'vitest';
import { formatManwon, planCardMeta, workingPlan } from '../src/features/dashboard/planCardFormat';
import type { Plan } from '../src/model/types';

describe('formatManwon — 카드 금액은 만 원 단위', () => {
  it.each([
    [5_497_600, '550만 원'],
    [910_000, '91만 원'],
    [12_345_000, '1,235만 원'],
    [4_000, '1만 원 미만'],
    [100_000_000, '1억 원'],
    [123_450_000, '1억 2,345만 원'],
    [0, '0원'],
  ])('%d원 → %s', (won, label) => {
    expect(formatManwon(won)).toBe(label);
  });
});

describe('planCardMeta — 도면 카드 메타 줄', () => {
  it('가구가 없으면 금액 대신 "가구 없음"', () => {
    expect(planCardMeta(23.4, 0, 0)).toBe('23㎡ · 가구 없음');
  });

  it('영문 축약(₩5.5M · ₩0K) 없이 만 원 단위 대략값을 쓴다', () => {
    const meta = planCardMeta(74.2, 13, 5_497_600);
    expect(meta).toBe('74㎡ · 가구 13개 · 추정 포함 약 550만 원');
    expect(meta).not.toMatch(/₩|K\b|M\b/);
  });
});

describe('workingPlan — "작업 중" 배지와 오른쪽 패널이 같은 도면', () => {
  const plan = (id: string) => ({ id }) as Plan;
  const a = plan('a');
  const b = plan('b');
  const plans = { a, b };

  it('목록 첫 카드가 아니라 마지막으로 연 도면을 짚는다', () => {
    expect(workingPlan(plans, [a, b], 'b')).toBe(b);
  });

  it('마지막으로 연 도면이 지워졌으면 첫 도면으로 물러난다', () => {
    expect(workingPlan(plans, [a, b], 'gone')).toBe(a);
  });
});
