# Roomcast Architecture

React 18 + TypeScript + Vite. 2D는 SVG, 3D는 three.js + @react-three/fiber + drei.
상태는 zustand 단일 스토어. 백엔드 없음 — 도면 CRUD는 localStorage.

## 핵심 원칙 (핸드오프 README 준수)

**평면도 모델 하나(`Plan`)가 SSOT.** 2D 에디터·3D 워크스루·조감도·견적·미니맵은 전부
`Plan`에서 파생 렌더링하며, 어느 뷰에서 변경해도 같은 모델을 수정한다.
파생 값(룸 면적 합, 견적 합계, 충돌 목록, 미니맵 지오메트리)은 상태에 저장하지 않고
셀렉터/컴포넌트에서 계산한다.

## 상태 모델

`src/state/store.ts` — zustand 스토어 하나에 3개 영역:

| 영역 | 필드 | 설명 |
|---|---|---|
| 라우팅 | `screen` (`dashboard`/`editor`/`upload`), `view` (`2d`/`walkthrough`/`birdseye`) | 라우터 없이 상태 기반 화면 전환 |
| SSOT | `plans` (id→Plan), `planOrder`, `currentPlanId`, `savedAt`, `history {past, future}` | `updatePlan(mutate, {commit})`으로만 변경. commit 시 스냅샷 push → 명령 단위 undo/redo. 변경 2초 디바운스 후 localStorage(`roomcast.plans.v1`) 저장 |
| 2D 에디터 | `tool`, `selection`, `placingCatalogId`, `drag`, `camera2d {pan, zoom}`, `snapping` | 일시적 상태 — undo 대상 아님 |
| 3D 뷰어 | `viewer` (eyeHeight, lighting preset/intensity/fov, display 토글, birdseyeMode) | 2D/3D 간 공유. 시점 좌표는 Walkthrough 내부 ref로만 유지 |

`Plan` 타입은 핸드오프 README의 것을 따르되 한 가지 실용적 추가:
`Room.polygon: Vec2[]` — 벽 폐곡선 추적 대신 룸 폐곡선을 직접 보관(면적은 shoelace로 계산).

좌표계: **meter**, 좌상단 원점, x→우 / y→하. 3D 변환은 `(x, 높이, y)` 매핑.

## 모듈 구조

```
src/
  model/
    types.ts        Plan·Wall·Opening·Room·PlacedItem + 에디터/뷰어 상태 타입
    catalog.ts      가구 카탈로그 데이터 (카테고리·치수·가격·스와치·shape 힌트)
    samplePlan.ts   샘플 도면 2개 (1a 도면의 meter 변환본, 서재)
    geometry.ts     shoelace 면적, point-in-polygon, SAT 충돌, 벽 투영, 스냅
  state/store.ts    zustand 스토어 (위 표)
  components/       TopBar, ViewTabs (라이트/다크 변형)
  features/
    editor2d/       1a: SVG 캔버스·툴독·카탈로그·인스펙터·상태바·배치 인터랙션(1c)
    walkthrough/    1d: r3f 씬 + PointerLockControls + HUD 오버레이
    birdseye/       1f: OrbitControls 조감 + 조명 시뮬레이션 패널
    dashboard/      1h: 도면 카드 그리드 + 견적/공유 패널
    upload/         1g: 업로드 → 스케일 → 벽 확인 (수동 트레이싱)
  styles/
    tokens.css      디자인 토큰 전부 CSS 변수화
    app.css         공용 프리미티브 (topbar·tabs·btn·panel·pill·keycap·toggle·slider)
```

## 3D 파생 규칙

- 벽: `Wall` 선분 → BoxGeometry 압출. `Opening`이 있는 벽은 구간 분할해
  문(전체 높이 개구부) / 창(하단 0.9m + 상단 lintel만 벽) 처리.
- 가구: `CatalogItem.shape` 힌트별 프리미티브 조합(소파=시트+등받이, 램프=폴+셰이드 등).
  색은 `variant.color`.
- 충돌(1인칭): 반경 0.25m 캡슐 vs 벽 세그먼트(개구부 구간 제외) + 가구 AABB.
- 조명 프리셋: 태양 방향·색온도·앰비언트 3종 보간(0.4s), 실내등 슬라이더 실시간.

## 빌드

`npm run build` = `tsc -b && vite build`. 항상 통과 상태 유지 (STATUS.md 참조).
