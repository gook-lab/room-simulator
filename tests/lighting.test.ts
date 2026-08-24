import { describe, expect, it } from 'vitest';
import { LIGHT_PRESETS, toggleDayNight } from '../src/features/three/lighting';

describe('toggleDayNight', () => {
  it('야간 ↔ 주간(오후) 토글', () => {
    expect(toggleDayNight('afternoon')).toBe('night');
    expect(toggleDayNight('night')).toBe('afternoon');
    // 다른 프리셋에서도 야간으로
    expect(toggleDayNight('sunset')).toBe('night');
    expect(toggleDayNight('overcast')).toBe('night');
  });
});

describe('야간 프리셋 설계 가드', () => {
  it('야간은 태양·앰비언트가 주간보다 낮고, 실내등 배율은 높다', () => {
    const day = LIGHT_PRESETS.afternoon;
    const night = LIGHT_PRESETS.night;
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity * 0.2);
    expect(night.ambientIntensity).toBeLessThan(day.ambientIntensity * 0.5);
    expect(night.lampBase).toBeGreaterThan(day.lampBase * 3);
  });
});
