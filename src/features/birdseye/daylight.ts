/**
 * 조감도 조명 패널 수치 — 창 방향(방위각)에서 계산하는 가벼운 데코 값.
 * 방이 하나도 없으면 "거실 기준" 값이 거짓이 되므로 값을 내지 않는다.
 */
export function daylightLabel(azimuthDeg: number, roomCount: number): string | null {
  if (roomCount === 0) return null;
  const southness = Math.cos(((azimuthDeg - 180) * Math.PI) / 180);
  const totalMin = Math.round(200 + southness * 140); // 3h20m ~ 5h40m
  return `${Math.floor(totalMin / 60)}시간 ${totalMin % 60}분`;
}

export function azimuthLabel(azimuthDeg: number): string {
  const a = ((azimuthDeg % 360) + 360) % 360;
  if (a >= 135 && a < 225) return '남향';
  if (a >= 225 && a < 315) return '서향';
  if (a >= 45 && a < 135) return '동향';
  return '북향';
}
