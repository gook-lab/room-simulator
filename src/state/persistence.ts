import type { Plan } from '../model/types';

/**
 * localStorage 저장 방어선.
 *
 * 저장소는 전체 스냅샷 1키(last-write-wins)라 비정상 상태(로드 폴백·크래시·
 * 다른 탭)가 한 번 덮으면 문서가 복구 불가로 사라진다. 여기서 세 겹으로 막는다:
 * 1) 병합 가드 — 저장 직전 기존 저장본과 비교해, 의도된 삭제가 아닌데
 *    사라지는 문서는 스냅샷에 되살려서 저장 (같은 id 는 메모리 우선 —
 *    undo 로 과거 내용을 복원한 경우도 저장돼야 하므로 updatedAt 비교는 안 함).
 * 2) 백업 1세대 — 덮어쓰기 전 이전 저장본을 BACKUP_KEY 로 보관. 메인이
 *    손상되면 로드가 백업으로 폴백하고, 손상 원본은 CORRUPT_KEY 로 보존.
 * 3) 용량 실패 표면화 — quota 초과는 백업을 비우고 1회 재시도, 그래도
 *    실패하면 조용히 삼키지 않고 결과로 알린다 (UI 가 배지로 표시).
 */

export const STORAGE_KEY = 'roomcast.plans.v1';
export const BACKUP_KEY = 'roomcast.plans.v1.bak';
export const CORRUPT_KEY = 'roomcast.plans.v1.corrupt';

export type PersistShape = { planOrder: string[]; plans: Record<string, Plan> };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const intendedRemovals = new Set<string>();

/** 삭제 액션이 호출 — 이 id 는 저장본에서 사라져도 정상 (가드가 복원하지 않음) */
export function markIntendedRemoval(id: string): void {
  intendedRemovals.add(id);
}

/** 테스트·저장 성공 후 초기화용 */
export function clearIntendedRemovals(): void {
  intendedRemovals.clear();
}

function parseShape(raw: string | null): PersistShape | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed.planOrder?.length && parsed.plans) return parsed;
  } catch {
    // 손상 — 호출측에서 폴백
  }
  return null;
}

/**
 * 메모리 스냅샷에 없지만 저장본에는 있는 문서를 복원해 합친다.
 * 의도된 삭제(intended)는 제외. 같은 id 는 메모리 쪽을 쓴다.
 */
export function mergeLostPlans(
  next: PersistShape,
  stored: PersistShape | null,
  intended: ReadonlySet<string> = intendedRemovals,
): { shape: PersistShape; restored: string[] } {
  if (!stored) return { shape: next, restored: [] };
  const restored: string[] = [];
  for (const id of stored.planOrder) {
    if (!next.plans[id] && stored.plans[id] && !intended.has(id)) restored.push(id);
  }
  if (restored.length === 0) return { shape: next, restored };
  const plans = { ...next.plans };
  for (const id of restored) plans[id] = stored.plans[id];
  return { shape: { plans, planOrder: [...next.planOrder, ...restored] }, restored };
}

/** 메인 → 손상 시 백업 폴백. 손상 원본은 CORRUPT_KEY 로 보존해 증거를 남긴다. */
export function loadPersistShape(storage: StorageLike): {
  shape: PersistShape | null;
  source: 'main' | 'backup' | 'none';
} {
  const rawMain = storage.getItem(STORAGE_KEY);
  const main = parseShape(rawMain);
  if (main) return { shape: main, source: 'main' };
  if (rawMain != null) {
    try {
      storage.setItem(CORRUPT_KEY, rawMain);
    } catch {
      // 보존 실패는 무시 (복구가 우선)
    }
  }
  const backup = parseShape(storage.getItem(BACKUP_KEY));
  if (backup) return { shape: backup, source: 'backup' };
  return { shape: null, source: 'none' };
}

export type SaveResult = { ok: boolean; restored: string[]; error?: 'quota' };

/** 병합 가드 → 백업 회전 → 저장. quota 실패는 백업을 비우고 1회 재시도. */
export function savePersistShape(storage: StorageLike, next: PersistShape): SaveResult {
  const prevRaw = storage.getItem(STORAGE_KEY);
  const { shape, restored } = mergeLostPlans(next, parseShape(prevRaw));
  const payload = JSON.stringify(shape);

  if (prevRaw != null) {
    try {
      storage.setItem(BACKUP_KEY, prevRaw);
    } catch {
      // 백업 회전 실패(용량) — 메인 저장이 우선이므로 백업은 건너뜀
    }
  }
  try {
    storage.setItem(STORAGE_KEY, payload);
  } catch {
    // 용량 확보 후 1회 재시도
    try {
      storage.removeItem(BACKUP_KEY);
      storage.setItem(STORAGE_KEY, payload);
    } catch {
      return { ok: false, restored, error: 'quota' };
    }
  }
  intendedRemovals.clear();
  return { ok: true, restored };
}
