<!--
  이미지는 raw.githubusercontent.com 절대 경로를 사용하므로, 이 문서가
  https://github.com/yeonjin1357/dichroma 의 main 브랜치에 push된 뒤에 렌더링됩니다.
  (velog 등에 그대로 붙여넣어도 push 이후라면 정상 표시됩니다.)

  English version: validation-en.md
-->

# 색맹 시뮬레이터는 대부분 틀렸다 — 4,913색 전수 검증으로 증명하며 만들기

색각 이상(색맹·색약) 시뮬레이터는 수십 개가 있습니다. 문제는 상당수가 미묘하게, 검증 불가능한 방식으로 틀렸다는 것입니다. 이 글은 Chrome 확장 [dichroma](https://github.com/yeonjin1357/dichroma)를 만들며 "올바른 모델을 골랐다"에서 멈추지 않고, 브라우저가 실제로 그리는 픽셀까지 수치로 증명한 과정의 기록입니다.

![시뮬레이션 전/후 비교 — dichroma가 실제 페이지에 protanopia 필터를 적용한 모습](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/01-simulation-before-after.png)

## 시뮬레이터는 많다, 맞는 시뮬레이터가 드물 뿐

DaltonLens의 [오픈소스 색맹 시뮬레이션 리뷰](https://daltonlens.org/opensource-cvd-simulation/) — 경도 protan 당사자인 저자가 직접 비교·검증한 글 — 는 널리 쓰이는 구현 다수가 부정확하다고 결론 냅니다. 흔한 오류는 두 가지입니다.

**① 감마 위에서의 행렬 곱.** 시뮬레이션 행렬은 선형(linear) RGB에서 정의되는데, 많은 구현이 감마 인코딩된 sRGB 값에 그대로 곱합니다. 선형화 한 단계를 빼먹으면 결과가 완전히 달라집니다(아래 그림).

**② 출처 불명의 행렬.** 라이브러리마다 복붙되어 돌아다니는 colorjack ColorMatrix가 대표적입니다. 원작자가 "하룻밤 해킹이고 정확하지 않으니 쓰지 말라"고 직접 밝혔는데도 여전히 여기저기서 발견됩니다.

레퍼런스 구현조차 함정이 있었습니다. 골든 값을 만들려고 [daltonlens-python](https://github.com/DaltonLens/DaltonLens-Python)을 받았더니, [PyPI 최신 릴리스(0.1.5)](https://pypi.org/project/daltonlens/)는 Judd-Vos 앵커 파장 수정 이전 버전이라 git master와 채널당 최대 **18/255**까지 차이가 났습니다(`tools/gen-golden.py` 헤더에 기록). 결국 git 커밋 핀으로 고정했습니다 — "검증된 라이브러리"도 어느 커밋이냐까지 따져야 합니다.

## 올바른 과학: 모델 3종과 라우팅

엔진 [@dichroma/core](https://www.npmjs.com/package/@dichroma/core)는 유형·심각도에 따라 모델을 라우팅합니다.

- **Viénot 1999** — protan/deutan 완전 이색형(심각도 1). 단일 3×3 행렬 투영.
- **Brettel 1997** — tritan 전용. 이색형의 색공간은 무채색 축을 경첩으로 한 두 반평면이라 행렬 하나로는 부족하고, 분리 평면의 어느 쪽인지에 따라 투영 행렬을 골라야 합니다. (Machado의 tritan 테이블은 부정확하다고 알려져 있어 쓰지 않습니다.)
- **Machado 2009** — protan/deutan 색약(심각도 0–1). 0.1 단위로 발표된 행렬을 보간.
- 완전 색맹(achromatopsia)은 Rec.709 휘도 블렌드로 처리합니다.

행렬 상수는 public domain인 [libDaltonLens](https://github.com/DaltonLens/libDaltonLens)에서 가져와 소스 주석에 출처를 남겼습니다. 그리고 **모든 행렬은 linear RGB에서 동작합니다.** 같은 Viénot protan 행렬을 선형화 후 적용한 것과 sRGB에 직접 곱한 것의 차이:

![위: 원본, 가운데: linear RGB에서 올바르게 적용한 protanopia, 아래: 같은 행렬을 감마 sRGB에 직접 곱한 잘못된 결과](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/linear-vs-srgb.png)

순빨강 `rgb(255,0,0)`이 올바른 구현에선 `[94,94,13]`, 잘못된 구현에선 `[29,29,1]` — 거의 검정입니다. 잘못된 쪽 수치도 실제로 계산해 그렸습니다(`docs/img/make-figures.mjs`).

## 구현: SVG 필터로 페이지 전체를 GPU에서

페이지 전체를 실시간 변환해야 하므로 GPU에서 도는 SVG 필터(`feColorMatrix`)를 씁니다. 여기에도 색공간 함정이 있습니다. CSS 단축 필터 함수(`grayscale()` 등)는 스펙상 sRGB에서 동작하고, SVG 필터 프리미티브의 기본값은 linearRGB입니다([Filter Effects 스펙](https://www.w3.org/TR/filter-effects-1/)). 브라우저 기본값에 맡기는 대신 `color-interpolation-filters="linearRGB"`를 항상 명시하고, 실제 결과는 뒤에서 픽셀로 검증합니다.

protan/deutan은 행렬 하나면 되지만, Brettel tritan의 "반평면 선택"은 분기 없는 필터 그래프로 풀어야 합니다. `packages/core/src/svgFilter.ts`가 만드는 7-프리미티브 그래프:

```xml
<filter id="${id}" color-interpolation-filters="linearRGB">
  <feColorMatrix in="SourceGraphic" type="matrix" result="projA" values="${matrixValues(model.m1)}"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="projB" values="${matrixValues(model.m2)}"/>
  <feColorMatrix in="SourceGraphic" type="matrix" result="sep" values="${sepValues(model.sep)}"/>
  <feComponentTransfer in="sep" result="mask"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>
  <feComposite in="projA" in2="mask" operator="in" result="maskedA"/>
  <feComposite in="projB" in2="mask" operator="out" result="maskedB"/>
  <feComposite in="maskedA" in2="maskedB" operator="over"/>
</filter>
```

두 투영을 모두 계산하고, 분리 평면 내적을 알파에 실어 discrete 임계로 0/1 마스크를 만든 뒤 픽셀별로 합성합니다.

필터는 `<html>` 루트에만 겁니다. `filter`는 적용 요소를 fixed/absolute 자손의 containing block으로 만들어 `<body>`에 걸면 `position: fixed` 레이아웃이 깨지는데, [스펙](https://www.w3.org/TR/filter-effects-1/)은 문서 루트 요소만 예외로 둡니다.

## 검증 체인: "맞다"를 어떻게 증명하나

이 프로젝트의 심장입니다. 아래 수치는 전부 리포지토리에서 재실행해 확인한 값입니다.

![4단계 검증 체인](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/validation-chain.png)

**① 수학 모델 검증.** 7-프리미티브 그래프의 의미론(선형화 → 투영 2 → discrete 마스크 → 합성)을 Node에서 에뮬레이션해 순수 함수 `simulateColor`와 비교 — 17³ = 4,913색 전수, tritan 세 심각도 모두 **채널 델타 0**. 그래프와 함수는 수학적으로 같은 모델입니다.

**② 골든 테스트.** 순수 함수 vs git 핀 고정 daltonlens-python — 17³ 그리드 × 9 콤보(유형×심각도) 전부 **델타 ≤ 1/255**(실측 최대 1, 반올림 오차). `packages/core/test/simulate.golden.test.ts`.

**③ 실브라우저 픽셀 검증.** 헤드리스 Chrome이 SVG 필터로 실제 렌더링한 픽셀 vs 순수 함수 출력 — 4콤보 × 인라인/data-URL 2방식, 임계 3/255. 최신 실행: tritan **3**, deutan **0**, protan@0.5 **0**, achromatopsia **1**. `e2e/chrome-filter.test.mjs`.

**④ 영구 회귀.** 위 전부를 **191개 단위 테스트** + Playwright e2e로 박제해 변경 때마다 돌립니다.

## 응용: 시뮬레이션된 색공간에서의 대비 감사

WCAG 대비는 휘도만 보며, [Understanding 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)은 "특정 색을 구분 못 하는 것이 명암 대비에는 부정적 영향을 주지 않는다"고 말합니다. 그러나 protan은 L-원추가 없어 빨간 빛의 휘도 기여를 크게 잃습니다. 반례: 검정 배경의 순빨강 텍스트는 **5.25:1**로 AA 통과지만, protan 시뮬레이션 후엔 **3.09:1**로 미달입니다.

기존 도구는 이 영역을 못 잡습니다 — 시뮬레이터엔 분석이 없고, 검사기는 원본 색만 잽니다. dichroma는 axe-core가 찾은 텍스트/배경 쌍을 CVD 모델로 변환해 WCAG 비율을 다시 재고, "지금은 통과, 색각 사용자에게는 미달" 항목을 따로 분류합니다. 이 수치는 검증된 심리물리 지표가 아닌 모델 유래 휴리스틱 추정치이며, UI에도 같은 고지가 붙습니다.

![대비 감사 패널 — 시뮬레이션 색공간에서 재계산된 WCAG 비율](https://raw.githubusercontent.com/yeonjin1357/dichroma/main/docs/img/03-audit-panel.png)

## 마무리

시뮬레이션은 모델 선택이 절반, 색공간이 나머지 절반입니다 — 그리고 둘 다 맞췄다는 건 실제 렌더링된 픽셀을 재봐야만 알 수 있습니다.

- Chrome 확장: `<CHROME_WEB_STORE_URL>` (현재 심사 중)
- 엔진(npm): [@dichroma/core](https://www.npmjs.com/package/@dichroma/core)
- 웹 데모: <https://yeonjin1357.github.io/dichroma/>
- 소스·테스트 전체: [github.com/yeonjin1357/dichroma](https://github.com/yeonjin1357/dichroma)

### 참고 문헌

- Brettel, Viénot & Mollon, 1997, *Computerized simulation of color appearance for dichromats*, J. Opt. Soc. Am. A 14(10) — [DOI](https://doi.org/10.1364/JOSAA.14.002647), [PDF](https://vision.psychol.cam.ac.uk/jdmollon/papers/Dichromatsimulation.pdf)
- Viénot, Brettel & Mollon, 1999, *Digital video colourmaps for checking the legibility of displays by dichromats*, Color Research & Application 24(4) — [PDF](https://vision.psychol.cam.ac.uk/jdmollon/papers/colourmaps.pdf)
- Machado, Oliveira & Fernandes, 2009, *A Physiologically-based Model for Simulation of Color Vision Deficiency*, IEEE TVCG 15(6) — [프로젝트 페이지·PDF](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
- DaltonLens, *Review of Open Source Color Blindness Simulations* — <https://daltonlens.org/opensource-cvd-simulation/>
