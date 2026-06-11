# dichroma

[English](README.md) | **한국어**

<img width="1280" height="800" alt="01-simulation-before-after" src="https://github.com/user-attachments/assets/f78e077e-0bf5-45fa-9e84-e6a9f1d46a27" />
<img width="1280" height="800" alt="03-audit-panel" src="https://github.com/user-attachments/assets/d5dfa3fc-1bc8-4efd-ba5d-f19e52d4626a" />
<img width="1280" height="800" alt="02-popup" src="https://github.com/user-attachments/assets/98a39dc3-77bf-429b-b2ee-9bceb8b52bee" />
<img width="1280" height="800" alt="04-preview-card" src="https://github.com/user-attachments/assets/dfe095d4-d65e-441d-a92b-5560ad3412b6" />

dichroma는 색각 이상(색맹·색약)을 시뮬레이션하고 대비를 검사하는 Chrome 확장
프로그램이자 순수 TypeScript 색과학 라이브러리입니다. 과학적으로 정확한 색각 이상
모델(Viénot 1999, Brettel 1997, Machado 2009)을 실제 페이지에 적용하고, **시뮬레이션된
색공간에서** WCAG 대비를 감사해, 디자이너와 개발자가 색각 이상 사용자의 눈으로 자신의
작업물을 볼 수 있게 돕습니다.

📖 [검증 과정 글 읽기](docs/validation-ko.md) — 시뮬레이션을 어떻게 만들고 픽셀 단위로 증명했는지.

## 모노레포 구성

```
.
├── packages/
│   └── core/        # @dichroma/core — 순수 TS 색과학 엔진
├── apps/
│   └── extension/   # WXT + React Chrome 확장
├── e2e/             # Playwright e2e 테스트 (M1/M2)
├── store-assets/    # Chrome Web Store 아이콘·스크린샷·등록 문구 (M5)
└── tools/           # gen-golden.py 골든 값 생성기 (M1)
```

## 설치

Chrome Web Store에서 설치: `<CHROME_WEB_STORE_URL>`
*(심사 통과 후 링크가 채워집니다 — `store-assets/SUBMISSION.md` 참고)*

또는 소스에서 직접 로드:

```sh
pnpm install
pnpm build
```

이후 `chrome://extensions`를 열고 **개발자 모드**를 켠 뒤 **압축해제된 확장
프로그램을 로드합니다**를 클릭해 `apps/extension/.output/chrome-mv3`를 선택하세요.
dichroma 아이콘을 고정하고 아무 페이지에서 팝업을 열어 색각 유형을 선택하면 됩니다.
HMR이 켜진 개발 모드는 정적 빌드 대신 `pnpm dev`를 사용하세요.

알려진 한계:

- top-layer 콘텐츠(`<dialog>`, 전체화면 요소)는 루트 CSS 필터를 벗어나므로
  시뮬레이션되지 않은 채 렌더링됩니다.
- `chrome://` 등 제한된 페이지에는 필터를 적용할 수 없습니다. 팝업에 "This page
  cannot be filtered"가 표시됩니다.
- "페이지 탐색 후에도 유지"를 켜지 않으면 페이지 이동 시 시뮬레이션이 해제됩니다
  (켜면 선택적 `<all_urls>` 호스트 권한을 요청합니다).
- 대비 감사는 최상위 프레임만 검사합니다. iframe 내부 콘텐츠는 감사되지 않습니다.

확장 아이콘은 `apps/extension/public/icon/{16,32,48,128}.png`에 있으며
`store-assets/icons/`의 SVG 원본에서 재생성합니다. 스토어 등록 문구·스크린샷·제출
런북은 `store-assets/`에 있고(`store-assets/README.md` 참고), 개인정보처리방침은
[PRIVACY.md](PRIVACY.md)입니다.

## 대비 감사의 동작 원리와 정확도

감사는 axe-core의 color-contrast 룰을 최상위 프레임에서 한 번 실행한 뒤, 각
텍스트/배경 색 쌍을 선택한 색각 모델로 변환하고 나서 WCAG 비율을 다시
계산합니다(`simulatedWcagRatio`). 시뮬레이션 공간의 비율은 색각 모델에서 유도한
**추정치**이며 WCAG 공식 판정값이 아닙니다 — 색맹 시뮬레이션 자체도 실제 지각의
근사입니다. 표시된 항목은 규정 준수 판정이 아니라 사람이 검토할 후보로 다뤄 주세요.
사이드패널 하단 각주에도 같은 고지가 표시됩니다.

## 서드파티 소프트웨어

대비 감사는 [axe-core](https://github.com/dequelabs/axe-core)(© Deque Systems,
Inc., [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/))를 무수정 상태로
`vendor/axe.min.js`로 동봉하며, 라이선스 사본을 `vendor/LICENSE`로 함께 제공합니다.
두 파일은 빌드 시점에 버전 고정된 npm 패키지에서 복사됩니다. dichroma의 코드는
axe-core에서 파생되지 않았으며 공개 API인 `axe.run`만 호출합니다. Chrome Web Store
등록 설명에도 같은 고지가 포함됩니다(`store-assets/listing-en.md` 참고).

## 개발

```sh
pnpm install   # 워크스페이스 전체 의존성 설치
pnpm build     # 코어 + 확장 빌드
pnpm test      # 단위 테스트 실행 (vitest)
pnpm dev       # 확장 개발 모드 실행 (wxt)
```
