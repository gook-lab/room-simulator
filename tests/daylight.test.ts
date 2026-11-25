import { describe, expect, it } from 'vitest';
import { azimuthLabel, daylightLabel } from '../src/features/birdseye/daylight';

describe('조감도 일조 시간', () => {
  it('방이 없는 도면에는 가짜 값을 내지 않는다', () => {
    expect(daylightLabel(180, 0)).toBeNull();
  });

  it('방이 있으면 창 방향으로 값을 낸다 — 남향이 가장 길다', () => {
    expect(daylightLabel(180, 3)).toBe('5시간 40분');
    expect(daylightLabel(90, 3)).toBe('3시간 20분');
  });

  it('창 방향 슬라이더 값 읽기 — 화면 낭독기용 방위 이름', () => {
    expect(azimuthLabel(180)).toBe('남향');
    expect(azimuthLabel(90)).toBe('동향');
    expect(azimuthLabel(260)).toBe('서향');
  });
});
