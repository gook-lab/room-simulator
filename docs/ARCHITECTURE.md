# Room Simulator Architecture

React 18 + TypeScript + Vite로 만들었습니다. 2D는 SVG를 직접 렌더하고, 3D는
three.js + @react-three/fiber를 사용합니다. 상태는 zustand 단일 스토어이고,
백엔드 없이 도면을 localStorage에 저장합니다.

## 핵심 원칙 — 평면도 SSOT에서 2D/3D 파생

**평면도 모델 하나(`Plan`)가 단일 진실 원장(SSOT)입니다.** 2D 에디터·3D
워크스루·조감도·견적·미니맵은 전부 `Plan`에서 파생 렌더링되며, 어느 뷰에서
변경해도 같은 모델을 수정합니다. 워크스루에서 문을 열면 2D 심볼이 스윙 호로
바뀌고 충돌 콜라이더가 다시 계산되는 식입니다.

파생 값(룸 면적 합, 견적 합계, 충돌 목록, 문 클리어런스 존, 미니맵
지오메트리, 3D 씬 그래프)은 상태에 저장하지 않고 셀렉터와 컴포넌트에서
계산합니다. 변경은 `updatePlan(mutate, {commit})` 한 경로로만 흐르고, commit
시 스냅샷을 쌓아 명령 단위 undo/redo를 만들었습니다. 드래그처럼 프레임마다
갱신되는 제스처는 비커밋으로 반영하다가 제스처 종료 시 시작 스냅샷 하나만
히스토리에 넣습니다(`pushHistory`).

좌표계는 **meter**, 좌상단 원점, x→우 / y→하입니다. 3D 변환은 `(x, 높이, y)`
매핑입니다.

## 상태 모델

`src/state/store.ts` — zustand 스토어 하나를 세 영역으로 나눴습니다.

| 영역 | 필드 | 요약 |
|---|---|---|
| 라우팅 | `screen`, `view` | 라우터 없는 상태 기반 화면 전환 (dashboard/editor/upload × 2d/walkthrough/birdseye) |
| SSOT | `plans`, `planOrder`, `currentPlanId`, `history`, `savedAt`, `pendingFitView` | `updatePlan` 단일 변경 경로 · 2초 디바운스 localStorage 저장 · 오픈 시 fit-to-view 1회 |
| 2D 에디터 | `tool`, `selection`, `placingCatalogId`, `drag`, `camera2d`, `snapping` | 일시적 상태 — undo 대상 아님 |
| 3D 뷰어 | `viewer` (조명 프리셋·시점 높이·표시 토글·조감 카메라 모드) | 뷰 설정 — plan에 저장하지 않음 |

`Plan` 타입은 핸드오프 README의 정의를 따르되, 구현하며 필요해진 필드를
추가했습니다. 전부 optional이라 기존 저장본과 호환됩니다.

| 추가 필드 | 용도 |
|---|---|
| `Room.polygon` | 룸 폐곡선 직접 보관 (렌더·포함 판정용, 면적은 shoelace 계산) |
| `Room.floorFinish` / `wallFinish` | 방 단위 바닥재·벽지 (`finishes.ts` 팔레트) |
| `Opening.doorType` / `open` | 여닫이·미닫이 구분과 개폐 상태 (충돌·문짝 애니메이션 연동) |
| `PlacedItem.powered` | 조명·TV 전원 (3D 광원·화면 발광 연동) |
| `Plan.wallItems` | 벽 부착 소품 — 벽 세그먼트 좌표계 (wallId + t + 높이 + 면) |
| `Plan.dimensions` | 영속 치수 주석 |

## 모듈 구조

```
src/
  model/            순수 로직 (React 무관 — 테스트 대상의 중심)
    types.ts          Plan·Wall·Opening·Room·PlacedItem·WallItem 등 전체 타입
    catalog.ts        가구 카탈로그 · 실상품 연동(products.json 머지)
    templates.ts      평형 템플릿 3종 (안목치수 기준)
    geometry.ts       shoelace 면적·point-in-polygon·SAT 충돌·견적 셀렉터
    doorZones.ts      문 앞 가구 배치 금지 존 (스윙 존 + 통행 스트립)
    wallItems.ts      벽 부착 배치 판정·이동
    finishes.ts       바닥재·벽지 팔레트와 2D/3D 색 해석
    interactions3d.ts 조명·TV 전원, 문 개폐 토글
    planIO.ts         JSON 내보내기/가져오기 (버전·스키마 검증)
  state/store.ts    zustand 스토어 (위 표)
  features/
    editor2d/         1a: SVG 캔버스·패널·제스처 (스냅·마퀴·그룹 이동)
    walkthrough/      1d: 1인칭 워크스루 + HUD
    birdseye/         1f: 조감도 + 조명 시뮬레이션
    three/            공유 3D — PlanScene(벽 분할·가구 프리미티브)·충돌·조명 프리셋
    dashboard/        1h: 도면 목록·가구 라이브러리·JSON 백업
    upload/           1g: 업로드 즉시 로드 — 벽·방·문 자동 인식(wallDetect)
```

## 3D 파생 규칙

- 벽은 `Wall` 선분을 박스로 압출하되, 개구부가 있으면 구간을 분할합니다 —
  문은 상인방(2.0m 위)만 남기고, 창은 하단(0.9m)·상단(2.1m) 솔리드와 유리를
  만듭니다. 문짝은 별도 메시로 두고 여닫이는 회전, 미닫이는 레일 슬라이드로
  애니메이션합니다.
- 가구는 `CatalogItem.shape` 힌트별 프리미티브 조합입니다(소파 = 시트 + 등받이
  + 팔걸이 등). 색은 `variant.color`에서 옵니다.
- 1인칭 충돌은 반경 0.25m 캡슐입니다. 벽 세그먼트(열린 문 구간 제외)와 가구
  OBB 에지를 콜라이더로 쓰고, 이동 벡터를 접촉 법선에 대해 접선 투영하는
  슬라이딩 응답을 적용했습니다. 높이 0.4m 이하 오브젝트는 통과합니다.
- 조명 프리셋(오후·해질녘·흐림·밤)은 태양 방향·색·앰비언트를 0.4초로
  보간하고, 실내등·TV는 `powered` 상태에 따라 광원이 켜지고 꺼집니다.

## 입력 라우팅 규칙 (wheel / 제스처)

원칙은 **포인터가 떠 있는 표면이 이벤트의 주인**이라는 것입니다
(`src/features/editor2d/inputRouting.ts`).

1. 캔버스 줌/팬은 포인터가 캔버스 위에 있을 때만 동작합니다. 오버레이(카탈로그
   ·인스펙터·툴독·상태바·뷰 탭 등) 위의 wheel은 그 패널의 스크롤로만
   소비됩니다 — wheel 핸들러가 `wheelTargetsCanvas(e.target)` 가드로 오버레이
   서브트리를 거릅니다.
2. 패널 스크롤이 끝에 닿아도 캔버스로 체이닝하지 않습니다 — 스크롤 컨테이너
   공용 클래스 `.scroll-y`에 `overscroll-behavior: contain`을 걸었습니다.
3. 캔버스 위 휠은 커서 기준 줌입니다(트랙패드 핀치 포함). 팬은 Space 또는
   휠클릭 드래그입니다.
4. 3D 뷰는 구조상 안전합니다 — 워크스루는 wheel을 쓰지 않고, 조감도
   OrbitControls는 gl canvas 요소에만 리스너를 붙입니다. window 단위 wheel
   리스너는 두지 않습니다.
   워크스루의 **Tab은 메뉴+커서 모드**로 병합했습니다(2026-08-25) — Tab을
   누르면 포인터 락이 풀리며 인게임 메뉴가 뜨고, 그동안 WASD 이동과
   Space/E/P 핫키는 가드(`walkthrough/menu.ts`)로 전부 무시되어 마우스로
   메뉴·HUD만 조작합니다. 메뉴는 캔버스 위 DOM 오버레이라 클릭이 카메라로
   새지 않습니다. Tab/클릭/Esc로 닫으면 재락되어 이동 모드로 복귀합니다
   (Esc는 브라우저 락 쿨다운 중이면 무시될 수 있어 Tab이 확실한 경로).
   조감도에도 같은 Tab 키로 대칭 미니 메뉴(워크스루 전환·2D·주야간·조작법)를
   둡니다.
5. 새 오버레이 패널을 추가할 때는 `OVERLAY_SELECTOR`에 클래스를 등록하고
   스크롤 영역에 `.scroll-y`를 쓰는 것이 규칙입니다.

## 미리보기=커밋 계약 (드래그 편집)

배치된 요소를 드래그로 옮기거나 회전·리사이즈·벽 편집할 때, **화면에 보이는
프리뷰와 커밋 결과는 항상 같아야 합니다** — 놓는 순간 위치가 튀는 일이 없어야
한다는 계약입니다 (2026-08-25 도입).

구현 원리는 "프리뷰를 별도로 만들지 않는 것"입니다. 드래그 중 매 프레임
스냅·클램프·거부 판정을 적용한 결과를 plan 라이브 상태에 비커밋(`commit:
false`)으로 반영하므로, 화면의 요소가 곧 프리뷰이고 드롭 시 그 상태가 그대로
히스토리에 커밋됩니다(`pushHistory(제스처 시작 스냅샷)`). 프리뷰 경로와 커밋
경로가 하나이므로 어긋날 여지가 구조적으로 없습니다.

그 위에 다음을 보조로 그립니다 (`dragPreview.ts`, `DragOriginGhost`).

1. **원본 잔상** — 제스처 시작 스냅샷 포즈를 반투명 심볼+점선 외곽으로 원위치에
   남깁니다. 부모 이동·회전은 표면 적층 자식도 잔상에 포함하고, 벽 드래그는
   원래 벽 선을 점선으로 남깁니다.
2. **유효/무효 표시** — 정상 위치는 accent 점선, 충돌·문 존 침범은 경고색 채움과
   안내 칩(기존 DragOverlay), 표면 적층은 대상 상판 하이라이트를 씁니다.
3. **회전 HUD** — 회전 핸들 드래그 중 스냅이 적용된 라이브 각도를 칩으로
   표시합니다.
4. **취소 경로** — Esc는 진행 중 제스처를 시작 스냅샷으로 원위치 복원합니다.
   거부 드롭(표면 이탈·형제 겹침, 벽 부착 무효 위치)도 같은 방식으로
   복원됩니다.

벽 끝점·몸통 드래그의 룸 면적 라이브 갱신은 표시하지 않습니다 — 드래그 중에는
경량 판정만 유지하고 파생 재계산(룸·콜라이더)은 커밋 시 1회 수행한다는 성능
원칙을 따랐습니다.

## 빌드와 테스트

`npm run build`는 `tsc -b && vite build`입니다. 테스트는 Vitest로 순수 로직만
검증합니다 — 지오메트리·스냅·충돌·문 존·템플릿 무결성·JSON round-trip이
대상이고, three/r3f 렌더 컴포넌트는 모듈 분리로 테스트 범위에서 제외했습니다.
진행 원장은 [STATUS.md](STATUS.md)에 있습니다.
