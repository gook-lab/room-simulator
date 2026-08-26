#!/usr/bin/env node
/**
 * 카탈로그 상품 정보(src/model/products.json) 관리 스크립트 — 소스 중립.
 *
 *   node scripts/sync-products.mjs              # products.json 검증 (기본)
 *   node scripts/sync-products.mjs --source X   # 어댑터 X로 동기화
 *
 * 데이터 소스는 어댑터(ADAPTERS)로 추상화한다. 네이버 쇼핑 검색 API가
 * 2026-07-31 종료되어 현재 등록된 라이브 어댑터는 없고, 실제 상품 페이지를
 * 열어 확인한 수동 큐레이션(products.json 직접 편집)이 유일한 소스다.
 * 향후 쿠팡 파트너스 등 새 소스가 생기면 어댑터만 추가하면 된다.
 *
 * 스키마(항목당): url / priceKrw / mall / brand? / specW·D·H?(m) / source? / fetchedAt
 * - spec* 은 상품 페이지 표기 실측 — 어댑터 동기화 시에도 덮어쓰지 않는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_PATH = path.join(__dirname, '../src/model/products.json');
const CATALOG_PATH = path.join(__dirname, '../src/model/catalog.ts');

/**
 * 데이터 소스 어댑터 레지스트리.
 * 형태: { [name]: { label, fetchProduct(catalogId) => Promise<Partial<ProductInfo>|null> } }
 * 현재 비어 있음 — 네이버 쇼핑 API 종료(2026-07-31), 공식 대체 없음.
 */
export const ADAPTERS = {};

/** 항목 1건 검증 — 오류 메시지 배열 반환 (빈 배열 = 유효) */
export function validateProduct(catalogId, entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return [`${catalogId}: 객체가 아님`];
  if (typeof entry.url !== 'string' || !/^https:\/\//.test(entry.url)) {
    errors.push(`${catalogId}: url 은 https 필수`);
  }
  if (!Number.isFinite(entry.priceKrw) || entry.priceKrw <= 0) {
    errors.push(`${catalogId}: priceKrw 는 양수 필수`);
  }
  if (typeof entry.mall !== 'string' || !entry.mall) {
    errors.push(`${catalogId}: mall 필수`);
  }
  if (typeof entry.fetchedAt !== 'string' || Number.isNaN(Date.parse(entry.fetchedAt))) {
    errors.push(`${catalogId}: fetchedAt 은 ISO 날짜 필수`);
  }
  for (const k of ['specW', 'specD', 'specH']) {
    const v = entry[k];
    if (v !== undefined && (!Number.isFinite(v) || v <= 0 || v > 5)) {
      errors.push(`${catalogId}: ${k} 는 0~5m 범위의 양수여야 함 (현재 ${v})`);
    }
  }
  return errors;
}

/** 어댑터 결과 머지 — 수동 큐레이션 spec·source 필드는 보존한다 */
export function mergeProduct(prev, next) {
  const merged = { ...prev, ...next };
  for (const k of ['specW', 'specD', 'specH', 'source']) {
    if (prev?.[k] !== undefined) merged[k] = prev[k];
  }
  return merged;
}

async function loadCatalogIds() {
  const src = await readFile(CATALOG_PATH, 'utf8');
  return new Set([...src.matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]));
}

async function validateAll() {
  const products = JSON.parse(await readFile(PRODUCTS_PATH, 'utf8'));
  const catalogIds = await loadCatalogIds();
  const errors = [];
  for (const [catalogId, entry] of Object.entries(products)) {
    if (!catalogIds.has(catalogId)) errors.push(`${catalogId}: 카탈로그에 없는 id`);
    errors.push(...validateProduct(catalogId, entry));
  }
  const n = Object.keys(products).length;
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log(`✓ products.json ${n}건 유효 (카탈로그 ${catalogIds.size}종 중)`);
}

async function syncFrom(sourceName) {
  const adapter = ADAPTERS[sourceName];
  if (!adapter) {
    console.error(`등록된 어댑터가 없습니다: "${sourceName}"`);
    console.error('현재 유일한 소스는 수동 큐레이션(products.json 직접 편집)입니다.');
    console.error('(네이버 쇼핑 검색 API 는 2026-07-31 종료 — 새 소스는 ADAPTERS 에 추가)');
    process.exit(1);
  }
  const products = JSON.parse(await readFile(PRODUCTS_PATH, 'utf8'));
  const catalogIds = await loadCatalogIds();
  let updated = 0;
  for (const catalogId of catalogIds) {
    const next = await adapter.fetchProduct(catalogId);
    if (!next) continue;
    products[catalogId] = mergeProduct(products[catalogId], next);
    updated += 1;
  }
  await writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`);
  console.log(`완료: ${updated}건 갱신 → ${PRODUCTS_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceIdx = process.argv.indexOf('--source');
  if (sourceIdx !== -1) {
    syncFrom(process.argv[sourceIdx + 1] ?? '');
  } else {
    validateAll();
  }
}
