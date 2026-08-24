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
