import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '../src/model/types';
import { TEMPLATES } from '../src/model/templates';
import { toggleDoor } from '../src/model/interactions3d';
import { encodeShareHash, readShareHash, type SharedBundle } from '../src/model/shareLink';
import { BACKUP_KEY, STORAGE_KEY, type PersistShape } from '../src/state/persistence';
import type { useStore as UseStore } from '../src/state/store';

/**
 * 받은 사람의 브라우저에 이미 저장본이 있는 상태에서 공유 링크를 연다.
 * store 는 모듈을 불러올 때 저장본을 읽으므로, 저장본을 먼저 심고 동적으로 불러온다.
 */
const mine = (id: string, name: string): Plan => ({
  ...TEMPLATES[0].build(),
  id,
  name,
  updatedAt: '2026-11-01T00:00:00.000Z',
});
const existing: PersistShape = {
  planOrder: ['mine-a', 'mine-b'],
  plans: { 'mine-a': mine('mine-a', '우리집'), 'mine-b': mine('mine-b', '작업실') },
};

let useStore: typeof UseStore;

function storageSnapshot(): Record<string, string | null> {
  return {
    main: localStorage.getItem(STORAGE_KEY),
    backup: localStorage.getItem(BACKUP_KEY),
  };
}

async function bundleOf(plans: Record<string, Plan>, current: Plan): Promise<SharedBundle> {
  const result = await readShareHash((await encodeShareHash(plans, current)).hash);
  if (!result.ok) throw new Error(result.message);
  return result.bundle;
}

async function singleBundle(): Promise<SharedBundle> {
  const plan = TEMPLATES.find((t) => t.id === 'tpl-59')!.build();
  return bundleOf({ [plan.id]: plan }, plan);
}

async function buildingBundle(): Promise<SharedBundle> {
  const f1 = { ...TEMPLATES[1].build(), id: 'f1', buildingId: 'bld-sender', floorLabel: '1층' };
  const f2 = { ...TEMPLATES[0].build(), id: 'f2', buildingId: 'bld-sender', floorLabel: '2층' };
  return bundleOf({ f1, f2 }, f2);
}

beforeAll(async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  ({ useStore } = await import('../src/state/store'));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  // 다음 시험이 공유 보기 밖에서 시작하도록
  if (useStore.getState().sharedView) useStore.getState().navigate('dashboard');
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('공유 링크 보기 — 받은 사람 저장소 불변', () => {
  it('저장본을 그대로 읽어 내 문서로 시작한다', () => {
    expect(useStore.getState().planOrder).toEqual(['mine-a', 'mine-b']);
  });

  it('링크를 열고 무엇을 눌러도 복사 전까지 저장소가 한 글자도 바뀌지 않는다', async () => {
    const bundle = await singleBundle();
    const before = storageSnapshot();
    const s = useStore.getState();
    s.openShared(bundle);
    const sharedId = useStore.getState().currentPlanId;
    const door = useStore.getState().plans[sharedId].openings.find((o) => o.kind === 'door')!;

    // 편집 · 삭제 · 층 · 이름 · 히스토리 경로를 전부 두드린다
    const st = () => useStore.getState();
    st().updatePlan((p) => ({ ...p, items: [] }));
    st().updatePlan((p) => ({ ...p, walls: [] }), { commit: false });
    st().pushHistory(st().plans[sharedId]);
    st().undo();
    st().redo();
    st().addFloor('empty');
    st().addFloor('duplicate');
    st().deleteFloor(sharedId);
    st().renamePlan(sharedId, '바꿈');
    st().renameFloor(sharedId, '3층');
    st().duplicatePlan(sharedId);
    st().addPlan(mine('intruder', '끼어든 문서'));
    st().addPlanAsFloor(mine('intruder2', '끼어든 층'));
    // 둘러보기 조작(문 여닫기)은 화면에만 반영된다
    st().updatePlan((p) => toggleDoor(p, door.id), { viewOnly: true });
    vi.advanceTimersByTime(10_000);

    expect(storageSnapshot()).toEqual(before);
    const viewed = st().plans[sharedId];
    expect(viewed.items.length).toBe(bundle.plans[0].items.length);
    expect(viewed.walls.length).toBe(bundle.plans[0].walls.length);
    expect(viewed.name).toBe(bundle.plans[0].name);
    expect(viewed.openings.find((o) => o.id === door.id)!.open).toBe(false);
    expect(st().planOrder).toEqual([sharedId]);
    expect(st().history.past).toHaveLength(0);
  });

  it('보기를 나가면 내 문서로 돌아오고 저장소는 그대로다', async () => {
    const bundle = await singleBundle();
    const before = storageSnapshot();
    useStore.getState().openShared(bundle);
    useStore.getState().navigate('dashboard');
    vi.advanceTimersByTime(10_000);

    const s = useStore.getState();
    expect(s.sharedView).toBeNull();
    expect(s.screen).toBe('dashboard');
    expect(s.planOrder).toEqual(['mine-a', 'mine-b']);
    expect(storageSnapshot()).toEqual(before);
  });

  it('보기로 들어가기 전에 미뤄 둔 내 편집은 먼저 저장한다', async () => {
    const bundle = await singleBundle();
    useStore.getState().openPlan('mine-a');
    useStore.getState().updatePlan((p) => ({ ...p, name: '우리집 2' }));
    useStore.getState().openShared(bundle);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistShape;
    expect(stored.plans['mine-a'].name).toBe('우리집 2');
    expect(stored.planOrder).toEqual(['mine-a', 'mine-b']);
    expect(Object.keys(stored.plans)).not.toContain(useStore.getState().currentPlanId);
  });
});

describe('공유 링크 보기 — 내 도면으로 복사', () => {
  it('새 id 의 내 도면이 생기고 편집 화면으로 간다. 기존 문서는 그대로 저장된다', async () => {
    const bundle = await singleBundle();
    const storedBefore = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistShape;
    useStore.getState().openShared(bundle);
    useStore.getState().copySharedToMine();

    const s = useStore.getState();
    expect(s.sharedView).toBeNull();
    expect(s.screen).toBe('editor');
    expect(s.view).toBe('2d');
    const copyId = s.currentPlanId;
    expect(copyId).not.toBe(bundle.currentId);
    expect(storedBefore.planOrder).not.toContain(copyId);

    // 알림이 뜨는 순간 이미 저장돼 있다
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as PersistShape;
    expect(stored.planOrder).toEqual([copyId, ...storedBefore.planOrder]);
    for (const id of storedBefore.planOrder) {
      expect(stored.plans[id]).toEqual(storedBefore.plans[id]);
    }
    expect(stored.plans[copyId].walls).toEqual(bundle.plans[0].walls);

    // 복사본은 고칠 수 있다
    useStore.getState().updatePlan((p) => ({ ...p, items: [] }));
    expect(useStore.getState().plans[copyId].items).toHaveLength(0);
  });

  it('여러 층은 새 건물 id 로 이어서 복사하고, 두 번 복사해도 층이 섞이지 않는다', async () => {
    const bundle = await buildingBundle();
    useStore.getState().openShared(bundle);
    expect(useStore.getState().plans[useStore.getState().currentPlanId].floorLabel).toBe('2층');
    useStore.getState().copySharedToMine();
    const first = useStore.getState();
    const firstBuilding = first.plans[first.currentPlanId].buildingId!;
    expect(first.plans[first.currentPlanId].floorLabel).toBe('2층');

    useStore.getState().openShared(bundle);
    useStore.getState().copySharedToMine();
    const second = useStore.getState();
    const secondBuilding = second.plans[second.currentPlanId].buildingId!;

    expect(firstBuilding).not.toBe('bld-sender');
    expect(secondBuilding).not.toBe(firstBuilding);
    const floorsOf = (bld: string) =>
      Object.values(second.plans).filter((p) => p.buildingId === bld).length;
    expect(floorsOf(firstBuilding)).toBe(2);
    expect(floorsOf(secondBuilding)).toBe(2);
  });

  it('보기 중에 다른 링크를 열어도 맡겨 둔 내 문서는 그대로 남는다', async () => {
    const before = useStore.getState().planOrder;
    useStore.getState().openShared(await singleBundle());
    useStore.getState().openShared(await buildingBundle());
    useStore.getState().navigate('dashboard');
    expect(useStore.getState().planOrder).toEqual(before);
  });
});
