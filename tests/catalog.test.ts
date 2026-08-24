import { describe, expect, it } from 'vitest';
import { CATALOG, CATEGORY_LABELS, CATEGORY_ORDER, formatSize } from '../src/model/catalog';

describe('카탈로그 무결성', () => {
  it('id 유일성', () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 항목: 유효 카테고리, 양수 치수/가격, 스와치 1개 이상', () => {
    for (const c of CATALOG) {
      expect(CATEGORY_ORDER).toContain(c.category);
      expect(CATEGORY_LABELS[c.category]).toBeTruthy();
      expect(c.size.w).toBeGreaterThan(0);
      expect(c.size.d).toBeGreaterThan(0);
      expect(c.size.h).toBeGreaterThan(0);
      expect(c.price).toBeGreaterThan(0);
      expect(c.swatches.length).toBeGreaterThanOrEqual(1);
      // 일반 가구는 "W × D cm", 램프·화분·라운드는 "Ø .." (목업 표기 준수)
      expect(formatSize(c)).toMatch(/cm|Ø/);
    }
  });

  it('카테고리 균형: 전 카테고리에 항목 존재', () => {
    for (const cat of CATEGORY_ORDER) {
      expect(CATALOG.filter((c) => c.category === cat).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('확충 규모: 45종 이상', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(45);
  });

  it('소품(decor) 확충: 12종 이상', () => {
    expect(CATALOG.filter((c) => c.category === 'decor').length).toBeGreaterThanOrEqual(12);
  });
});
