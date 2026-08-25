# Room Simulator

**한국어** | [English](README.en.md)

> **About (EN)** — A browser-based 3D interior planner. Draw or trace a floor
> plan, furnish it from a 49-item catalog, then inspect the result in a
> first-person WASD walkthrough or a dollhouse bird's-eye view. One plan model
> drives the 2D editor, both 3D views and the cost estimate. Built with
> React 18, Three.js / React Three Fiber and Zustand.

평면도를 그리거나 이미지 위에 트레이싱해서 가구를 배치하고, 1인칭 워크스루와
조감도로 결과를 확인하는 웹 인테리어 플래너입니다.

평면도 모델 하나(SSOT)에서 2D 에디터·3D 워크스루·조감도·견적을 전부
파생시키는 것이 핵심 설계입니다. 어느 뷰에서 바꿔도(가구 이동, 문 여닫기,
조명 켜고 끄기, 마감재 변경) 같은 모델이 수정되고, 명령 단위 undo와
localStorage 자동 저장이 함께 동작합니다. 디자인 핸드오프 문서(8개 화면
스펙)를 받아 그대로 구현한 프로젝트입니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | React 18 + TypeScript (strict) |
| 빌드 | Vite |
| 2D 에디터 | SVG 직접 렌더 (라이브러리 없음) |
| 3D | Three.js 0.170 · React Three Fiber 8 · Drei 9 |
| 상태 | Zustand 5 (단일 스토어 + 명령 단위 undo) |
| 테스트 | Vitest — 순수 로직 168개 (2026-08-24 기준) |
| 저장 | localStorage + JSON 내보내기/가져오기 |

## 주요 기능

| 화면 | 내용 |
|---|---|
| 2D 평면도 에디터 | 벽·문·창 드로잉, 가구 배치(그리드·벽면 스냅, 15° 회전), 다중 선택, 충돌·문 앞 공간 경고, 치수 주석, 방 단위 바닥재·벽지 |
| 3D 워크스루 | 1인칭 WASD 이동(캡슐 충돌·슬라이딩), 응시 상호작용 — 조명·TV 켜고 끄기, 문(여닫이·미닫이) 열고 닫기, 소재 편집 |
| 조감도 | 돌하우스·단면·평행 투상 카메라, 조명 시뮬레이션(시간대 프리셋·창 방향), 원하는 시점에서 워크스루 진입 |
| 업로드 트레이싱 | 도면 이미지 업로드 → 기준선으로 스케일 확정 → 수동 트레이싱으로 편집 가능한 도면 생성 |
| 평형 템플릿 | 원룸(전용 23㎡)·25평(59㎡)·34평(84㎡) — 안목치수 기준, 기본 가구 배치 포함 |
| 대시보드 | 도면 목록, 룸별 견적 합계, JSON 백업 |

가구 카탈로그는 49종입니다(2026-08-24 기준). 소파·테이블·수납·조명·러그·소품
6개 카테고리이고, 액자·벽시계·벽거울은 벽 세그먼트 좌표계로 벽면에 부착됩니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # tsc + vite build
npm test         # vitest (순수 로직 테스트)
```

데스크톱 1440×900 기준으로 설계했고 반응형은 범위에 없습니다. 백엔드 없이
동작하며 도면은 브라우저 localStorage에 저장됩니다. 3D 뷰는 WebGL이 필요합니다.

## 설계 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 평면도 SSOT에서 2D/3D를
  파생시키는 구조, 상태 모델, 입력 라우팅 규칙
- [docs/STATUS.md](docs/STATUS.md) — 구현 진행 원장 (멀티 세션 협업 기록)

## 라이선스

Source-available (all rights reserved) — 코드 열람과 학습 참고 목적으로
공개했습니다. 자세한 내용은 [LICENSE](LICENSE)([한국어 안내](LICENSE.ko.md))를
참고해 주세요.
