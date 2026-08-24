import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/model/templates';
import { catalogById } from '../src/model/catalog';
import { pointInPolygon, wallLength } from '../src/model/geometry';
import { collisionsFor } from '../src/features/editor2d/interactions';

const EXPECTED_AREA: Record<string, number> = {
  'tpl-studio': 23,
  'tpl-59': 59,
  'tpl-84': 84,
};

describe('평형 템플릿', () => {
  it('3종(원룸·25평·34평) 제공', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['tpl-studio', 'tpl-59', 'tpl-84']);
  });

  for (const tpl of TEMPLATES) {
    describe(tpl.name, () => {
      const plan = tpl.build();

      it('전용 면적이 평형 근사와 일치', () => {
        const area = plan.rooms.reduce((s, r) => s + r.areaSqm, 0);
        expect(Math.abs(area - EXPECTED_AREA[tpl.id])).toBeLessThanOrEqual(1.5);
      });

      it('벽·개구부·룸·가구 id 유일성', () => {
        for (const ids of [
          plan.walls.map((w) => w.id),
          plan.openings.map((o) => o.id),
          plan.rooms.map((r) => r.id),
          plan.items.map((i) => i.id),
        ]) {
          expect(new Set(ids).size).toBe(ids.length);
        }
      });

      it('개구부가 유효한 벽 위에 있고 벽 길이 안에 들어간다', () => {
        for (const o of plan.openings) {
          const w = plan.walls.find((x) => x.id === o.wallId);
          expect(w, `${o.id} → ${o.wallId}`).toBeTruthy();
          const len = wallLength(w!);
          expect(o.t * len - o.width / 2).toBeGreaterThanOrEqual(-1e-6);
          expect(o.t * len + o.width / 2).toBeLessThanOrEqual(len + 1e-6);
        }
      });

      it('가구: 유효 카탈로그 + 지정 룸 내부 배치', () => {
        for (const item of plan.items) {
          expect(catalogById.get(item.catalogId), item.id).toBeTruthy();
          const room = plan.rooms.find((r) => r.id === item.roomId);
          expect(room, `${item.id} roomId`).toBeTruthy();
          expect(
            pointInPolygon(item.position, room!.polygon),
            `${item.id} 중심이 ${room!.name} 내부`,
          ).toBe(true);
        }
      });

      it('배치 가구끼리 충돌 없음', () => {
        for (const item of plan.items) {
          expect(collisionsFor(plan, item), `${item.id} 충돌`).toEqual([]);
        }
      });

      it('build() 는 매번 새 plan 인스턴스·고유 id', () => {
        const a = tpl.build();
        const b = tpl.build();
        expect(a.id).not.toBe(b.id);
        expect(a).not.toBe(b);
        expect(a.items[0]).not.toBe(b.items[0]);
      });
    });
  }
});

describe('템플릿 현실화 (안목치수·욕실 구성)', () => {
  const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.build()]));

  it('욕실 개수: 원룸 1 / 25평 2(공용+안방) / 34평 2(공용+안방)', () => {
    const baths = (id: string) => byId[id].rooms.filter((r) => r.floor === 'bath');
    expect(baths('tpl-studio')).toHaveLength(1);
    expect(baths('tpl-59')).toHaveLength(2);
    expect(baths('tpl-84')).toHaveLength(2);
  });

  it('34평 욕실은 각각 3.5~5㎡', () => {
    for (const r of byId['tpl-84'].rooms.filter((r) => r.floor === 'bath')) {
      expect(r.areaSqm).toBeGreaterThanOrEqual(3.5);
      expect(r.areaSqm).toBeLessThanOrEqual(5.0);
    }
  });

  it('안방 부속욕실 문 존재 (25평·34평)', () => {
    for (const id of ['tpl-59', 'tpl-84']) {
      const door = byId[id].openings.find((o) => o.id === 'o-door-mbath');
      expect(door, id).toBeTruthy();
      expect(door!.kind).toBe('door');
    }
  });

  it('문 상호작용 데모용 기본 닫힘 문이 템플릿마다 1개 이상', () => {
    for (const tpl of TEMPLATES) {
      const closed = byId[tpl.id].openings.filter(
        (o) => o.kind === 'door' && o.open === false,
      );
      expect(closed.length, tpl.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('현관 분리 (25평·34평)', () => {
    for (const id of ['tpl-59', 'tpl-84']) {
      expect(byId[id].rooms.some((r) => r.name === '현관'), id).toBe(true);
    }
  });

  it('34평 팬트리 존재', () => {
    expect(byId['tpl-84'].rooms.some((r) => r.name === '팬트리')).toBe(true);
  });

  it('침실 크기 배분: 안방 > 침실2 > 침실3 (34평)', () => {
    const area = (name: string) =>
      byId['tpl-84'].rooms.find((r) => r.name === name)!.areaSqm;
    expect(area('안방')).toBeGreaterThan(area('침실 2'));
    expect(area('침실 2')).toBeGreaterThan(area('침실 3'));
  });

  it('룸 폴리곤이 안목치수(내벽면) 기준 — 벽 중심선보다 안쪽', () => {
    // 원룸 외곽 벽 중심선 (0,0)~(6.2,4.0) 대비 폴리곤 최소 좌표가 0.075 인셋
    const main = byId['tpl-studio'].rooms.find((r) => r.id === 'r-main')!;
    const minX = Math.min(...main.polygon.map((p) => p.x));
    const minY = Math.min(...main.polygon.map((p) => p.y));
    expect(minX).toBeCloseTo(0.075, 3);
    expect(minY).toBeCloseTo(0.075, 3);
  });
});
