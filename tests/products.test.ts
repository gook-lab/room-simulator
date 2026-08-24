import { describe, expect, it } from 'vitest';
import { applyProducts, catalogById } from '../src/model/catalog';
import type { CatalogItem, ProductInfo } from '../src/model/types';
import productsJson from '../src/model/products.json';
// @ts-expect-error mjs 모듈 (검증·머지 유틸만 사용)
import { ADAPTERS, mergeProduct, validateProduct } from '../scripts/sync-products.mjs';

const baseItem: CatalogItem = {
  id: 'sofa-linen-3',
  name: '린넨 3인 소파',
  category: 'sofa',
  shape: 'sofa',
  size: { w: 2.2, d: 0.92, h: 0.78 },
  price: 1_290_000,
  materialLabel: '패브릭',
  swatches: [{ id: 'sand', label: '샌드', color: '#dcc7ae' }],
};

describe('applyProducts (카탈로그 상품 머지)', () => {
  it('실판매가·실제원으로 대체, product 필드 부착', () => {
    const product: ProductInfo = {
      url: 'https://example.com/p/1',
      priceKrw: 799_000,
      mall: '테스트몰',
      specW: 2.01,
      specD: 0.88,
      fetchedAt: '2026-08-25T00:00:00Z',
    };
    const [merged] = applyProducts([baseItem], { 'sofa-linen-3': product });
    expect(merged.price).toBe(799_000);
    expect(merged.size.w).toBe(2.01);
    expect(merged.size.d).toBe(0.88);
    expect(merged.size.h).toBe(0.78); // spec 없는 축은 기존 유지
    expect(merged.product).toBe(product);
  });

  it('상품 없는 아이템은 원본 그대로 (참조 동일)', () => {
    const [merged] = applyProducts([baseItem], {});
    expect(merged).toBe(baseItem);
  });
});

describe('sync-products (소스 중립 어댑터)', () => {
  const valid = {
    url: 'https://example.com/p/1',
    priceKrw: 89_900,
    mall: 'IKEA 한국',
    specW: 0.8,
    fetchedAt: '2026-08-25T00:00:00+09:00',
  };

  it('validateProduct: 유효 항목은 오류 없음', () => {
    expect(validateProduct('x', valid)).toEqual([]);
  });

  it('validateProduct: http url·0원·spec 범위 밖은 오류', () => {
    expect(validateProduct('x', { ...valid, url: 'http://a.com' })).not.toEqual([]);
    expect(validateProduct('x', { ...valid, priceKrw: 0 })).not.toEqual([]);
    expect(validateProduct('x', { ...valid, specW: 7 })).not.toEqual([]);
    expect(validateProduct('x', null)).not.toEqual([]);
  });

  it('mergeProduct: 어댑터 결과가 큐레이션 spec·source 를 덮어쓰지 못한다', () => {
    const prev = { ...valid, specW: 0.8, source: 'browse' };
    const next = { url: 'https://b.com', priceKrw: 99_000, specW: 1.2, source: 'api' };
    const merged = mergeProduct(prev, next);
    expect(merged.priceKrw).toBe(99_000); // 가격·링크는 갱신
    expect(merged.url).toBe('https://b.com');
    expect(merged.specW).toBe(0.8); // 큐레이션 실측 보존
    expect(merged.source).toBe('browse');
  });

  it('라이브 어댑터는 현재 없음 (네이버 API 종료)', () => {
    expect(Object.keys(ADAPTERS)).toEqual([]);
  });
});

describe('products.json (실데이터 무결성)', () => {
  const entries = Object.entries(productsJson as Record<string, ProductInfo>);

  it('모든 키는 실제 카탈로그 id', () => {
    for (const [id] of entries) {
      expect(catalogById.has(id), id).toBe(true);
    }
  });

  it('모든 항목이 스키마 검증 통과 (https·양수 가격·spec 범위)', () => {
    for (const [id, entry] of entries) {
      expect(validateProduct(id, entry), id).toEqual([]);
    }
  });
});
