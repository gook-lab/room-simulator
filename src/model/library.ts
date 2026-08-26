import type { Plan } from './types';
import { catalogById } from './catalog';

/**
 * 가구 라이브러리 — "견적서" 성격을 낮춘 쇼핑 리스트 집계.
 *
 * 배치된 가구(바닥+벽 부착)를 카탈로그 단위로 묶고, **실판매가·상품 링크가
 * 확인된 아이템만 가격을 표시**한다(추정가 남발 금지 — 나머지는 목록만).
 * 합계는 "실판매가 합계"와 "추정 포함 합계"를 구분해 제공한다.
 */
export type LibraryRow = {
  catalogId: string;
  name: string;
  count: number;
  /** 실판매가 (확인된 상품만) */
  priceKrw?: number;
  url?: string;
  mall?: string;
};

export type LibrarySummary = {
  rows: LibraryRow[];
  /** 실판매가 아이템 합계 (원) */
  realSum: number;
  realCount: number;
  /** 추정가 포함 전체 합계 (원) */
  totalSum: number;
  estCount: number;
};

export function aggregateLibrary(plan: Plan): LibrarySummary {
  const byId = new Map<string, LibraryRow & { estUnit: number }>();
  const all = [...plan.items, ...(plan.wallItems ?? [])];
  for (const item of all) {
    const cat = catalogById.get(item.catalogId);
    if (!cat) continue;
    const cur = byId.get(item.catalogId);
    if (cur) {
      cur.count += 1;
    } else {
      byId.set(item.catalogId, {
        catalogId: item.catalogId,
        name: cat.name,
        count: 1,
        priceKrw: cat.product?.priceKrw,
        url: cat.product?.url,
        mall: cat.product?.mall,
        estUnit: cat.price,
      });
    }
  }
  const rows = [...byId.values()].sort((a, b) => {
    // 실판매가 있는 항목 우선, 그다음 수량 많은 순
    if ((a.priceKrw != null) !== (b.priceKrw != null)) return a.priceKrw != null ? -1 : 1;
    return b.count - a.count;
  });
  let realSum = 0;
  let realCount = 0;
  let totalSum = 0;
  let estCount = 0;
  for (const r of rows) {
    if (r.priceKrw != null) {
      realSum += r.priceKrw * r.count;
      realCount += r.count;
      totalSum += r.priceKrw * r.count;
    } else {
      estCount += r.count;
      totalSum += r.estUnit * r.count;
    }
  }
  return {
    rows: rows.map(({ estUnit: _e, ...r }) => r),
    realSum,
    realCount,
    totalSum,
    estCount,
  };
}

/** 쇼핑 리스트 텍스트 (클립보드 복사용) */
export function shoppingListText(plan: Plan): string {
  const lib = aggregateLibrary(plan);
  const lines = lib.rows.map((r) => {
    const qty = r.count > 1 ? ` ×${r.count}` : '';
    const price = r.priceKrw != null ? ` — ₩${(r.priceKrw * r.count).toLocaleString('ko-KR')}` : '';
    const url = r.url ? `\n  ${r.url}` : '';
    return `· ${r.name}${qty}${price}${url}`;
  });
  const footer =
    lib.realCount > 0
      ? `\n실판매가 합계(${lib.realCount}점): ₩${lib.realSum.toLocaleString('ko-KR')}`
      : '';
  return `${plan.name} 가구 리스트\n${lines.join('\n')}${footer}`;
}
