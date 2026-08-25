import { describe, expect, it } from 'vitest';
import { exportPlan, importPlan } from '../src/model/planIO';
import { createSamplePlan } from '../src/model/samplePlan';
import { DOOR_HEIGHT, wallBoxes } from '../src/features/three/wallGeometry';
import type { Opening, Wall } from '../src/model/types';

const wall = (height: number, thickness = 0.15): Wall => ({
  id: 'w1',
  a: { x: 0, y: 0 },
  b: { x: 4, y: 0 },
  thickness,
  height,
});

describe('벽 속성 커스텀 — 3D 파생(wallBoxes)', () => {
  it('벽 높이가 박스 top에 그대로 반영된다', () => {
    for (const h of [1.2, 2.4, 3.2]) {
      const boxes = wallBoxes(wall(h), []);
      expect(boxes).toHaveLength(1);
      expect(boxes[0].top).toBe(h);
    }
  });

  it('문 높이보다 낮은 벽: 문 위 인방 박스가 생기지 않는다 (음수 높이 박스 필터)', () => {
    const door: Opening = { id: 'o1', wallId: 'w1', kind: 'door', t: 0.5, width: 0.9 };
    const boxes = wallBoxes(wall(1.2), [door]);
    // 문 구간 위(2.0~1.2)는 무효 → 좌우 솔리드 2개만
    expect(boxes.filter((b) => b.bottom >= DOOR_HEIGHT)).toHaveLength(0);
    expect(boxes.every((b) => b.top - b.bottom > 0)).toBe(true);
  });
});

describe('벽 속성 커스텀 — 저장/불러오기', () => {
  it('벽별 두께·높이와 문서 기본 층고가 round-trip 보존된다', () => {
    let plan = createSamplePlan();
    plan = {
      ...plan,
      defaultWallHeight: 2.7,
      walls: plan.walls.map((w, i) =>
        i === 0 ? { ...w, thickness: 0.25, height: 1.1 } : w,
      ),
    };
    const result = importPlan(exportPlan(plan));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.defaultWallHeight).toBe(2.7);
    expect(result.plan.walls[0].thickness).toBe(0.25);
    expect(result.plan.walls[0].height).toBe(1.1);
  });

  it('잘못된 defaultWallHeight(문자열·0 이하)는 거부된다', () => {
    const base = JSON.parse(exportPlan(createSamplePlan()));
    for (const bad of ['high', 0, -1]) {
      const result = importPlan(JSON.stringify({ ...base, plan: { ...base.plan, defaultWallHeight: bad } }));
      expect(result.ok).toBe(false);
    }
  });
});
