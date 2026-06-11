# Chrome Web Store 제출 런북 (2026-06 기준)

dichroma 1.0.0을 스토어에 올리는 단계별 가이드입니다. 아래 절차·정책은
2026년 6월에 공식 문서로 재확인했습니다(맨 아래 출처). 폼이 또 바뀔 수
있으니 막히면 출처 링크를 먼저 확인하세요.

> 준비물 요약
> - 업로드할 zip: `apps/extension/.output/extension-1.0.0-chrome.zip`
>   (`pnpm zip`으로 재생성 — **절대 e2e 빌드(chrome-mv3-e2e)를 올리지 말 것**.
>   e2e 빌드는 host_permissions가 들어간 테스트 전용 빌드입니다)
> - 스크린샷 5장: `store-assets/screenshots/01…05.png` (전부 1280×800)
> - 스토어 아이콘 128×128: `apps/extension/public/icon/128.png`
> - 붙여넣을 문구: `store-assets/listing-en.md`, `store-assets/listing-ko.md`

---

## ① GitHub 저장소 공개 + 개인정보처리방침 URL 확보

1. GitHub 저장소를 **Public**으로 전환 (Settings → General → Danger Zone →
   Change visibility).
2. 루트의 `PRIVACY.md`와 `README.md`, `store-assets/listing-*.md`에 있는
   `<GITHUB_REPO_URL>` 플레이스홀더를 실제 URL로 바꿔 커밋.
3. 개인정보처리방침 URL 확정:
   `https://github.com/<계정>/<repo>/blob/main/PRIVACY.md`
   — ④에서 개발자 **계정 설정**에 입력합니다(항목별 설정이 아니라 계정 단위).

## ② 개발자 계정 등록

1. <https://chrome.google.com/webstore/devconsole> 접속 → 사용할 Google
   계정으로 로그인 → 개발자 약관 동의.
2. **등록비 US$5 결제** (1회성, 카드 필요).
3. **연락처 이메일(developer email) 입력 후 이메일 인증** — 인증을 끝내야
   제출이 가능합니다. 자주 확인하는 메일 주소를 쓰세요(심사 결과·정책 통지가
   이 주소로 옵니다).
4. **2단계 인증(2-Step Verification) 활성화** — Google 계정에 2SV가 켜져
   있어야 게시/업데이트가 가능합니다 (<https://myaccount.google.com/security>).
5. **Trader(사업자) / Non-trader(비사업자) 신고** (EU DSA 의무, 계정 설정에
   있음): 수익 없는 개인 무료 확장이면 **Non-trader** 선택이 맞습니다.
   Trader를 선택하면 전화번호 SMS 인증 등 신원 확인 절차가 추가됩니다.

## ③ 새 항목 만들기 + zip 업로드

1. (선택) 스토어 제목을 전체 이름 `dichroma — color vision simulator &
   audit`로 쓰려면 zip을 만들기 **전에**
   `apps/extension/wxt.config.ts`의 `name: 'dichroma'` 한 줄을 그 문자열로
   바꾸세요 — 제목은 매니페스트 `name`에서만 결정되고 대시보드에서 수정할
   수 없습니다 (`listing-en.md`의 Name 섹션 참고). 그대로 두면 제목은
   `dichroma`입니다.
2. 루트에서 `pnpm build && pnpm zip` 실행 →
   `apps/extension/.output/extension-1.0.0-chrome.zip` 생성 확인.
3. 대시보드 → **+ New item** → 위 zip 업로드 (계정당 확장 20개, zip 2GB
   제한 — 우리는 ~250KB라 무관).
4. 업로드되면 자동으로 초안(draft)이 생기고 Package 탭에서 매니페스트
   내용(이름, 버전 1.0.0, 권한 4종 + optional host)을 확인할 수
   있습니다.

## ④ 폼 필드 ↔ 준비된 문구 매핑

### Store listing(스토어 등록정보) 탭

| 대시보드 필드 | 채울 내용 |
|---|---|
| Title / Summary | 패키지에서 자동 (수정 불가) — `listing-en.md` 상단에서 확인만 |
| Description (영어) | `listing-en.md` → **Detailed description** 코드블록 전체 |
| 언어 추가: 한국어 → Description | `listing-ko.md` → **자세한 설명** 코드블록 전체 |
| Category | **Developer Tools** (Productivity 그룹) — 근거는 `listing-en.md`의 Category 섹션 |
| Language | 기본 English, 한국어 설명 추가 |
| Store icon (128×128) | `apps/extension/public/icon/128.png` |
| Screenshots (최대 5장, 1280×800) | ⑤ 참고 |
| Small promo tile 440×280 (선택) | 생략 가능 — 비워 두면 됨 |
| Homepage URL / Support URL (선택) | GitHub 저장소 URL / `<repo>/issues` |
| Mature content | 체크 안 함 |

### Privacy practices(개인정보 보호) 탭

| 대시보드 필드 | 채울 내용 (`listing-en.md`에서 복사) |
|---|---|
| Single purpose description | **Single-purpose statement** 코드블록 |
| Permission justification: activeTab | **activeTab** 코드블록 |
| Permission justification: scripting | **scripting** 코드블록 |
| Permission justification: storage | **storage** 코드블록 |
| Permission justification: sidePanel | **sidePanel** 코드블록 |
| Host permission justification (`<all_urls>`) | **Optional host permission** 코드블록 |
| Remote code | **No** (axe-core는 패키지에 동봉, 원격 로드 없음) |
| Data usage | ⑥ 참고 |

추가로 **계정 설정(Account) 페이지의 Privacy policy URL 필드**에 ①의
PRIVACY.md URL을 입력하세요. 데이터 공개 답변과 개인정보처리방침이
일치해야 합니다(우리는 "수집 없음"으로 일치).

### Distribution(배포) 탭

- Payments: **Free**
- Visibility: **Public**
- Distribution regions: 전체 선택(기본값)

## ⑤ 스크린샷 업로드 순서

스토어에 보이는 순서 그대로 업로드하세요 (첫 장이 대표 이미지):

1. `01-simulation-before-after.png` — 원본 vs 녹색맹 시뮬레이션 비교
2. `02-popup.png` — 팝업 UI
3. `03-audit-panel.png` — 대비 검사(페이지 오버레이 + 사이드 패널)
4. `04-preview-card.png` — 페이지 내 미리보기 카드 + 패널 항목 확대
5. `05-korean-ui.png` — 한국어 UI

다시 만들 일이 있으면: `node store-assets/make-screenshots.mjs`
(`store-assets/README.md` 참고).

## ⑥ 데이터 공개 폼 체크 항목

"What user data do you plan to collect…" 섹션:

- 데이터 카테고리 체크박스(개인 식별 정보 / 건강 / 금융·결제 / 인증 정보 /
  개인 커뮤니케이션 / 위치 / 웹 기록 / 사용자 활동 / 웹사이트 콘텐츠):
  **전부 체크하지 않음** — dichroma는 아무것도 수집하지 않습니다.
- 인증(certification) 체크박스 3개: **모두 체크**
  1. 승인된 사용 사례 외 제3자에게 사용자 데이터를 판매·이전하지 않음
  2. 단일 목적과 무관한 용도로 사용자 데이터를 사용·이전하지 않음
  3. 신용도 평가·대출 목적으로 사용자 데이터를 사용·이전하지 않음

  (수집하는 데이터가 없으므로 셋 다 자명하게 참)

## ⑦ 제출 → 심사

1. 모든 탭의 빨간 경고가 사라졌는지 확인 → **Submit for review**.
   (원하면 "승인 후 자동 게시" 대신 deferred publish — 승인 후 30일 내 수동
   게시 — 를 선택할 수 있습니다.)
2. 심사 기간: 대부분 **며칠 내** 완료되며(통계적으로 90%가 3일 이내),
   길면 몇 주까지 갈 수 있습니다. 2026년 4월부터 제출 급증으로 평소보다
   지연된다는 공지가 있으니 여유를 두세요. **3주 넘게** pending이면 개발자
   지원(One Stop Support)에 문의하세요.
3. 신규 계정 + `<all_urls>`(optional이지만) 조합은 심층 심사 트리거가 될 수
   있습니다 — 권한 정당화 문구가 그 대비책입니다.

## ⑧ 흔한 거부 사유 체크리스트 (우리 상태)

- [x] **원격 호스팅 코드(RHC)** — 없음. 모든 코드 패키지 동봉, MV3 준수 ✓
- [x] **난독화 코드** — 난독화 없음. `vendor/axe.min.js`는 *minified*(허용)
      이며 난독화가 아니고, MPL-2.0 라이선스 전문을 `vendor/LICENSE`로 동봉 ✓
- [x] **권한 과다 요청** — `activeTab, scripting, storage, sidePanel`만 필수
      선언, host 권한은 optional + 옵트인 시 요청. 권한별 정당화 문구 준비 ✓
- [x] **단일 목적 불명확** — 단일 목적 설명 준비, 모든 기능이 CVD
      시뮬레이션/검사 한 가지로 수렴 ✓
- [x] **메타데이터 품질/키워드 스팸** — 설명은 기능 서술 위주, 반복 키워드
      없음 ✓
- [ ] **개인정보처리방침 URL 누락** — ①·④에서 계정 설정에 입력해야 함
      (제출 전 직접 확인)
- [ ] **데이터 공개 미작성** — ⑥대로 직접 체크해야 함
- [x] **스크린샷/아이콘 규격** — 1280×800 × 5장, 128px 아이콘 준비 ✓

## 심사 통과 후

1. README의 `<CHROME_WEB_STORE_URL>` 플레이스홀더를 실제 스토어 URL
   (`https://chromewebstore.google.com/detail/<항목ID>`)로 교체.
2. 원하면 스토어 배지/사용자 수 배지 추가 (예: shields.io
   `chrome-web-store/v/<항목ID>`), 저장소 About에도 스토어 링크 등록.
3. `git tag v1.0.0` + GitHub Release를 남겨 두면 이후 업데이트 심사 때
   diff 추적이 편합니다.
4. 이후 버전 업데이트: `apps/extension/package.json` 버전 올리기 →
   `pnpm zip` → 대시보드 Package 탭에 새 zip 업로드 → 재심사 (같은 심사
   절차를 다시 거칩니다).

---

### 출처 (2026-06-11 확인)

- 게시 절차·탭 구성·20개/2GB 제한: <https://developer.chrome.com/docs/webstore/publish>
- 등록·$5 수수료·이메일: <https://developer.chrome.com/docs/webstore/register>
- 개인정보 보호 탭(단일 목적·권한 정당화·원격 코드·데이터 공개): <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- 등록정보 탭(스크린샷 1280×800, 아이콘 128, 프로모 타일): <https://developer.chrome.com/docs/webstore/cws-dashboard-listing>
- 심사 절차·기간·심층 심사 트리거: <https://developer.chrome.com/docs/webstore/review-process>
- 2단계 인증 의무: Chrome Web Store 계정 보안 공지(developer.chrome.com)
- Trader/Non-trader(EU DSA): <https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure>
