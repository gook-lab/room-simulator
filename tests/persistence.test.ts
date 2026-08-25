import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  STORAGE_KEY,
  clearIntendedRemovals,
  loadPersistShape,
  markIntendedRemoval,
  mergeLostPlans,
  savePersistShape,
  type PersistShape,
} from '../src/state/persistence';
import type { Plan } from '../src/model/types';

const plan = (id: string, name = id): Plan => ({
  id,
  name,
  unitScale: 50,
  walls: [],
  openings: [],
  rooms: [],
  items: [],
  updatedAt: '2026-08-25T00:00:00.000Z',
});

const shape = (...ids: string[]): PersistShape => ({
  planOrder: ids,
  plans: Object.fromEntries(ids.map((id) => [id, plan(id)])),
});

function fakeStorage(opts?: { failKeys?: Set<string>; failAll?: boolean }) {
  const map = new Map<string, string>();
  let failAll = opts?.failAll ?? false;
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failAll || opts?.failKeys?.has(k)) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    _map: map,
    _setFailAll: (v: boolean) => {
      failAll = v;
    },
  };
}

beforeEach(() => clearIntendedRemovals());

describe('mergeLostPlans — 병합 가드', () => {
  it('저장본에만 있는 문서를 복원한다 (사건 재현: 폴백 상태가 기존 저장본을 덮는 경우)', () => {
    const memory = shape('sample-a', 'sample-b'); // 로드 실패 → 샘플 폴백 상태
    const stored = shape('mp-f1', 'sample-a');
    const { shape: merged, restored } = mergeLostPlans(memory, stored, new Set());
    expect(restored).toEqual(['mp-f1']);
    expect(merged.plans['mp-f1']).toBeDefined();
    expect(merged.planOrder).toEqual(['sample-a', 'sample-b', 'mp-f1']);
  });

  it('의도된 삭제는 복원하지 않는다', () => {
    const { restored } = mergeLostPlans(shape('a'), shape('a', 'b'), new Set(['b']));
    expect(restored).toEqual([]);
  });

  it('같은 id 는 메모리 쪽을 쓴다 (undo 로 되돌린 내용도 저장돼야 함)', () => {
    const memory = shape('a');
    memory.plans['a'] = { ...memory.plans['a'], name: '메모리 최신' };
    const stored = shape('a');
    const { shape: merged } = mergeLostPlans(memory, stored, new Set());
    expect(merged.plans['a'].name).toBe('메모리 최신');
  });
});

describe('save/load — 백업 회전과 폴백', () => {
  it('저장 시 이전 저장본이 백업으로 남고, 메인 손상 시 백업으로 로드된다', () => {
    const st = fakeStorage();
    savePersistShape(st, shape('a'));
    savePersistShape(st, shape('a', 'b'));
    expect(JSON.parse(st._map.get(BACKUP_KEY)!).planOrder).toEqual(['a']);

    st._map.set(STORAGE_KEY, '{corrupt');
    const { shape: loaded, source } = loadPersistShape(st);
    expect(source).toBe('backup');
    expect(loaded?.planOrder).toEqual(['a']);
    expect(st._map.get(CORRUPT_KEY)).toBe('{corrupt'); // 손상 원본 보존
  });

  it('메인·백업 모두 없으면 null (호출측 샘플 폴백)', () => {
    expect(loadPersistShape(fakeStorage())).toEqual({ shape: null, source: 'none' });
  });

  it('의도된 삭제 후 저장하면 저장본에서도 사라진다', () => {
    const st = fakeStorage();
    savePersistShape(st, shape('a', 'b'));
    markIntendedRemoval('b');
    savePersistShape(st, shape('a'));
    expect(JSON.parse(st._map.get(STORAGE_KEY)!).planOrder).toEqual(['a']);
  });

  it('삭제 마킹은 저장 성공 시 소진된다 — 같은 id 재생성 문서는 이후 보호됨', () => {
    const st = fakeStorage();
    savePersistShape(st, shape('a', 'b'));
    markIntendedRemoval('b');
    savePersistShape(st, shape('a'));
    // b 를 다시 만들고 저장 → 이후 폴백 상태가 덮어도 b 는 복원 대상
    savePersistShape(st, shape('a', 'b'));
    const { restored } = mergeLostPlans(shape('a'), JSON.parse(st._map.get(STORAGE_KEY)!));
    expect(restored).toEqual(['b']);
  });
});

describe('quota 초과', () => {
  it('메인 저장 실패 시 백업을 비우고 재시도해 성공한다', () => {
    const st = fakeStorage();
    savePersistShape(st, shape('a'));
    savePersistShape(st, shape('a', 'b'));
    // 다음 setItem 부터 실패시키되, removeItem 후 재시도는 성공하도록 1회성 실패
    let failures = 2; // 백업 회전 1회 + 메인 1회 실패
    const orig = st.setItem;
    st.setItem = (k: string, v: string) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('QuotaExceededError');
      }
      orig(k, v);
    };
    const result = savePersistShape(st, shape('a', 'b', 'c'));
    expect(result.ok).toBe(true);
    expect(st._map.get(BACKUP_KEY)).toBeUndefined(); // 재시도가 백업을 비움
    expect(JSON.parse(st._map.get(STORAGE_KEY)!).planOrder).toEqual(['a', 'b', 'c']);
  });

  it('재시도까지 실패하면 ok:false + error:quota 를 반환한다 (조용히 삼키지 않음)', () => {
    const st = fakeStorage();
    savePersistShape(st, shape('a'));
    st._setFailAll(true);
    const result = savePersistShape(st, shape('a', 'b'));
    expect(result).toMatchObject({ ok: false, error: 'quota' });
    // 기존 저장본은 그대로 남아있다
    expect(JSON.parse(st._map.get(STORAGE_KEY)!).planOrder).toEqual(['a']);
  });
});
