import type { LightPreset } from '../../model/types';

export type LightingSpec = {
  /** 태양 방향 (정규화 전) — three 좌표 (x, y, z) */
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  /** 배경(clear) 색 */
  background: string;
  /** 실내등 배율에 곱해지는 기본 강도 */
  lampBase: number;
};

export const LIGHT_PRESETS: Record<LightPreset, LightingSpec> = {
  afternoon: {
    sunDir: [-4, 7, 3],
    sunColor: '#fff2dc',
    sunIntensity: 1.6,
    ambientColor: '#f2ead9',
    ambientIntensity: 0.85,
    background: '#2a2521',
    lampBase: 0.4,
  },
  sunset: {
    sunDir: [-7, 2.2, 1.5],
    sunColor: '#ffb37a',
    sunIntensity: 1.25,
    ambientColor: '#e8c9a8',
    ambientIntensity: 0.5,
    background: '#241f1c',
    lampBase: 0.8,
  },
  overcast: {
    sunDir: [-2, 8, 2],
    sunColor: '#dfe3e0',
    sunIntensity: 0.5,
    ambientColor: '#dfe3e2',
    ambientIntensity: 1.0,
    background: '#2a2724',
    lampBase: 0.5,
  },
  night: {
    sunDir: [3, 6, -2],
    sunColor: '#7d8fb0',
    sunIntensity: 0.12,
    ambientColor: '#5a6478',
    ambientIntensity: 0.22,
    background: '#15130f',
    lampBase: 2.2,
  },
};

export const PRESET_LABELS: Record<LightPreset, string> = {
  afternoon: '오후 3시',
  sunset: '해질녘',
  overcast: '흐린 날',
  night: '밤',
};
