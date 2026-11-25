import { describe, expect, it } from 'vitest';
import { isFirstVisit } from '../src/features/dashboard/firstVisit';
import { createSamplePlan, createStudyPlan } from '../src/model/samplePlan';
import { TEMPLATES } from '../src/model/templates';

describe('첫 방문 시작 경로 노출 조건 (기획 D)', () => {
  const builtIn = [createSamplePlan().id, createStudyPlan().id];

  it('견본 문서만 있으면 첫 방문으로 보고 템플릿 바로 시작을 보여 준다', () => {
    expect(isFirstVisit(builtIn)).toBe(true);
    expect(isFirstVisit([builtIn[0]])).toBe(true); // 견본 하나를 지운 경우
  });

  it('내가 만든 문서가 하나라도 있으면 감춘다 — 기존 사용자 화면은 그대로', () => {
    const mine = TEMPLATES[1].build().id;
    expect(isFirstVisit([mine, ...builtIn])).toBe(false);
    expect(isFirstVisit(['plan-upload-123'])).toBe(false);
  });
});
