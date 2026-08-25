/**
 * 워크스루 인게임 메뉴 가드 — Tab = 메뉴+커서 모드 (병합).
 *
 * 포인터 락 해제 상태(=메뉴 표시 중)에는 이동·핫키 입력을 전부 무시하고
 * 마우스로 메뉴/HUD 를 조작한다. 락 상태에서만 WASD 이동과 Space/E/P 핫키가
 * 동작한다. (키는 눌린 채 기록되어도 프레임 루프가 이 가드로 걸러낸다)
 */

/** WASD 이동 허용 여부 — 락 상태 + 편집 패널 닫힘일 때만 */
export function movementAllowed(pointerLocked: boolean, editOpen: boolean): boolean {
  return pointerLocked && !editOpen;
}

/** Space(시점)·E(편집)·P(스크린샷) 핫키 허용 여부 — 메뉴(커서 모드) 중에는 무시 */
export function hotkeyAllowed(pointerLocked: boolean): boolean {
  return pointerLocked;
}

/**
 * 워크스루 진입 가능 여부 — 방이 없어도 벽이 있으면 허용
 * (중립 바닥 + 벽 충돌로 걷기 성립). 벽도 방도 없는 진짜 빈 도면만 차단.
 */
export function walkthroughAllowed(roomCount: number, wallCount: number): boolean {
  return roomCount > 0 || wallCount > 0;
}
