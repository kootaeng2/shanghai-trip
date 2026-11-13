# 🇨🇳 상하이 가족여행 일정 공유 사이트

가족 누구나 링크로 들어와 **로그인 없이** 항공편·숙소·일정·준비물을 보고 추가·수정·삭제할 수 있는 모바일용 웹페이지입니다.
한 사람이 고치면 다른 가족 화면에도 **바로** 반영됩니다(Firebase Firestore 실시간 동기화).

- 빌드 과정 없음: HTML + CSS + 바닐라 JS(ES Modules)
- GitHub Pages(`https://아이디.github.io/저장소이름/`)에 그대로 올리면 동작
- Firebase 설정 전에도 **체험 모드**(이 기기에만 저장)로 화면을 미리 볼 수 있음

## 📁 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 뼈대 (가족 코드 화면, 이름 입력, 각 섹션, 모달) |
| `style.css` | 디자인 (모바일 우선, 붉은색+골드, 다크모드 자동) |
| `app.js` | 동작 전체 (Firestore 연결, 화면 그리기, 추가/수정/삭제, 되돌리기, 샘플 데이터) |
| `firebase-config.js` | **⚙️ 바꿀 설정은 전부 여기** — Firebase 키, 여행 날짜, 가족 코드, 환율, 시차 |
| `firestore.rules` | Firestore 보안 규칙 (Firebase 콘솔에 붙여넣는 용도. 사이트 동작에는 안 쓰임) |

## ⚙️ 설정 바꾸기 (`firebase-config.js`)

```js
export const TRIP_CONFIG = {
  TRIP_ID: "shanghai-2026-family",   // Firestore 저장 경로. firestore.rules 와 같아야 함!
  TITLE: "🇨🇳 상하이 가족여행",
  START_DATE: "2026-12-24",          // 여행 시작일
  END_DATE: "2026-12-27",            // 여행 종료일 → Day 탭 수와 D-Day 자동 계산
  FAMILY_CODE: "1225",               // 가족 코드
  DEFAULT_EXCHANGE_RATE: 195,        // 1 CNY = 195원 (화면에서도 수정 가능)
  HOME_UTC_OFFSET: 9,                // 한국 UTC+9
  DEST_UTC_OFFSET: 8,                // 중국 UTC+8 → 비행시간 계산 시 시차 1시간 반영
  mapUrl: (q) => `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}&city=310000&callnative=1`, // 고덕지도
};
```

> 💡 `TRIP_ID`는 남이 추측하기 어려운 값(예: `shanghai-kim-7f3k9q`)으로 바꾸는 걸 추천해요. 바꿨다면 `firestore.rules`의 `tripId()`도 똑같이 바꿔야 합니다.

---

## 🔐 보안에 대해 솔직하게

이 사이트는 **로그인 없이** 쓰도록 만들었기 때문에, 보안 수준을 정확히 알고 쓰셔야 해요.

- **가족 코드는 진짜 보안이 아닙니다.** 코드가 `firebase-config.js`에 그대로 들어 있어서, 브라우저 개발자 도구로 소스를 열면 누구나 볼 수 있어요. 링크를 우연히 연 사람이나 검색 봇이 바로 들어오지 못하게 막는 **"실수·봇 방지용 문"** 정도로 생각해 주세요.
- **Firestore 보안 규칙**은 실제로 서버에서 막아 줍니다. 단, 막는 범위는 이렇습니다.
  - ✅ 지정한 `trips/{TRIP_ID}/…` 경로 밖에는 읽기·쓰기 불가
  - ✅ 정해진 필드·타입·길이만 허용 → 엉뚱한 대용량 데이터나 이상한 필드를 써 넣지 못함
  - ❌ 하지만 `TRIP_ID`와 Firebase 설정값(소스에 공개됨)을 아는 사람은 **규칙 범위 안에서는** 읽고 쓰고 지울 수 있어요.
- `apiKey`가 깃허브에 공개되는 건 Firebase에서 정상입니다(식별용 값). 데이터 보호는 보안 규칙이 담당해요.
- 그러니 **여권번호, 카드번호 같은 민감한 정보는 넣지 마세요.** 예약번호 정도까지만 권장합니다.
- 더 강한 보안이 필요하면 Firebase Authentication(구글 로그인 등)을 붙이고 규칙에서 `request.auth != null` + 허용 이메일 목록을 검사하는 방식으로 바꿔야 합니다.
- 실수로 지운 항목은 5초 안에 토스트의 **되돌리기**로 복구할 수 있지만, 그 이후에는 복구되지 않아요(Firestore 무료 플랜엔 백업이 없음).

---

## 🔥 Firebase 설정 가이드 (초보자용)

### 1단계. Firebase 프로젝트 만들기
1. <https://console.firebase.google.com> 에 구글 계정으로 로그인
2. **프로젝트 추가(Create a project)** 클릭
3. 프로젝트 이름 입력 (예: `shanghai-trip`) → 계속
4. Google 애널리틱스는 **사용 안 함**으로 꺼도 됩니다 → **프로젝트 만들기**
5. 완료되면 **계속**을 눌러 프로젝트 대시보드로 이동

> 요금제는 무료(Spark)로 충분합니다. 가족 여행 규모면 무료 한도(하루 읽기 5만·쓰기 2만 건)를 넘을 일이 거의 없어요.

### 2단계. Firestore 데이터베이스 켜기
1. 왼쪽 메뉴 **빌드(Build) → Firestore Database**
2. **데이터베이스 만들기(Create database)**
3. 위치(Location): **`asia-northeast3 (Seoul)`** 추천 ※ 한 번 정하면 바꿀 수 없어요
4. 보안 규칙 시작 모드: **프로덕션 모드(production mode)** 선택 → 만들기
   (처음엔 모든 접근이 막힌 상태. 5단계에서 규칙을 붙여 넣습니다)

### 3단계. 웹앱 등록하기
1. 왼쪽 위 ⚙️ **프로젝트 설정(Project settings)** → **일반(General)** 탭
2. 아래쪽 **내 앱(Your apps)** 에서 **`</>` (웹)** 아이콘 클릭
3. 앱 닉네임 입력 (예: `trip-web`)
4. "Firebase 호스팅도 설정" 체크는 **하지 않음** (GitHub Pages를 쓸 거라서)
5. **앱 등록** → 화면에 아래와 같은 코드가 나옵니다

```js
const firebaseConfig = {
  apiKey: "AIzaSy....",
  authDomain: "shanghai-trip-xxxx.firebaseapp.com",
  projectId: "shanghai-trip-xxxx",
  storageBucket: "shanghai-trip-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```

> 나중에 다시 보려면: 프로젝트 설정 → 일반 → 내 앱 → **SDK 설정 및 구성 → 구성(Config)**

### 4단계. `firebase-config.js`에 값 넣기
`firebase-config.js`를 열고 `firebaseConfig` 안의 `"YOUR_..."` 값들을 3단계에서 복사한 값으로 바꿉니다.
(Firebase가 보여 준 `npm install`, `import { initializeApp } ...` 부분은 필요 없어요. **중괄호 안 값만** 복사하세요.)

```js
export const firebaseConfig = {
  apiKey: "AIzaSy....",           // ← 실제 값
  authDomain: "shanghai-trip-xxxx.firebaseapp.com",
  projectId: "shanghai-trip-xxxx",
  storageBucket: "shanghai-trip-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef...",
};
```

같은 파일의 `TRIP_CONFIG`에서 날짜, 가족 코드, `TRIP_ID`도 원하는 값으로 바꿔 주세요.

### 5단계. 보안 규칙 적용하기
1. Firebase 콘솔 → **Firestore Database → 규칙(Rules)** 탭
2. 기존 내용을 **전부 지우고** 이 저장소의 `firestore.rules` 내용을 통째로 붙여넣기
3. 맨 위쪽 `function tripId() { return 'shanghai-2026-family'; }` 의 값을
   `firebase-config.js`의 `TRIP_ID`와 **똑같이** 맞추기
4. **게시(Publish)** 클릭 (반영까지 최대 1분 정도 걸릴 수 있어요)
5. (선택) 규칙 편집기 오른쪽 위의 **Rules Playground** 에서 `trips/내TRIP_ID/events/test` 경로로 get을 시뮬레이션해 보면 "허용됨"이 나와야 정상

### 6단계. 로컬에서 확인 (선택)
`index.html`을 더블클릭해서 열면 **동작하지 않아요**(ES Module은 `file://`에서 막힘). 간단한 로컬 서버로 여세요.

```bash
python -m http.server 8000
```

그리고 브라우저에서 `http://localhost:8000` 접속 → 가족 코드 입력 → 이름 입력 → 상단에 **🟢 실시간 동기화**가 보이면 성공!
"🧧 샘플 데이터 불러오기"를 눌러 Firestore 콘솔의 데이터 탭에 `trips/…` 문서들이 생기는지 확인해 보세요.

---

## 🚀 GitHub Pages 배포 가이드

### 1. 저장소 만들기
1. <https://github.com> 로그인 → 오른쪽 위 **＋ → New repository**
2. Repository name: 예) `shanghai-trip`
3. **Public** 선택 (무료 계정의 GitHub Pages는 공개 저장소에서 동작)
   → 소스(가족 코드 포함)가 공개된다는 뜻이에요. 위 "보안에 대해 솔직하게"를 꼭 읽어 주세요.
4. **Create repository**

### 2. 파일 올리기
**방법 A — 웹에서 드래그 (가장 쉬움)**
1. 새 저장소 화면의 **uploading an existing file** 링크 클릭
2. `index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`, `README.md` 를 끌어다 놓기
3. 아래 **Commit changes** 클릭

**방법 B — git 명령어**
```bash
git init
```
```bash
git add .
```
```bash
git commit -m "상하이 가족여행 사이트"
```
```bash
git branch -M main
```
```bash
git remote add origin https://github.com/내아이디/shanghai-trip.git
```
```bash
git push -u origin main
```

### 3. Pages 켜기
1. 저장소 → **Settings → Pages** (왼쪽 메뉴)
2. **Build and deployment → Source: `Deploy from a branch`**
3. **Branch: `main`**, 폴더: **`/ (root)`** → **Save**
4. 1~3분 기다린 뒤 새로고침하면 위쪽에
   `Your site is live at https://내아이디.github.io/shanghai-trip/` 가 표시됩니다
   (저장소 **Actions** 탭에서 `pages build and deployment`가 초록 체크면 배포 완료)

### 4. 접속 확인
1. 폰에서 `https://내아이디.github.io/shanghai-trip/` 접속
2. 가족 코드 → 이름 입력 → 🟢 실시간 동기화 확인
3. 다른 폰(또는 PC)에서도 열어 한쪽에서 일정을 추가 → 다른 쪽에 바로 뜨는지 확인
4. 가족 단톡방에 링크와 가족 코드를 공유 (폰에서 "홈 화면에 추가"하면 앱처럼 쓸 수 있어요)

> 수정할 때는 파일을 고쳐 다시 커밋/업로드하면 1~2분 후 자동 재배포됩니다.

---

## 🧯 자주 막히는 문제

### 1) 화면이 하얗거나 콘솔에 CORS 에러
- `Access to script at 'file:///...' ... blocked by CORS policy` → `index.html`을 **더블클릭(file://)으로 연 경우**입니다. ES Module은 웹 서버로 열어야 해요. 위 6단계의 `python -m http.server`나 VS Code의 **Live Server** 확장을 쓰세요. GitHub Pages에선 문제없습니다.
- `404 ... firebase-config.js` → GitHub Pages는 **대소문자를 구분**합니다. 파일명이 정확히 소문자 `firebase-config.js`인지, 하위 폴더가 아니라 저장소 **최상위**에 있는지 확인하세요.

### 2) "Firestore 권한 오류" / `Missing or insufficient permissions`
- 5단계 규칙을 **게시**했는지 확인
- `firestore.rules`의 `tripId()` 값과 `firebase-config.js`의 `TRIP_ID`가 **글자 하나까지 같은지** 확인
- 저장할 때만 거부된다면 글자 수 제한(제목 100자, 메모 500자 등)을 넘었는지 확인

### 3) 도메인 허용 목록에 github.io 추가?
- **Firebase Authentication(승인된 도메인)** 설정은 로그인 기능을 쓸 때만 필요해요. 이 사이트는 로그인이 없으니 **안 해도 됩니다.**
- 다만 보안을 조금 더 높이고 싶다면 API 키에 **웹사이트 제한**을 거는 걸 추천해요:
  1. <https://console.cloud.google.com/apis/credentials> → 해당 프로젝트 선택
  2. `Browser key (auto created by Firebase)` 클릭
  3. **애플리케이션 제한사항 → 웹사이트** 선택 후 아래 주소 추가
     - `https://내아이디.github.io/*`
     - `http://localhost:8000/*` (로컬 테스트용)
  4. 저장 (반영까지 몇 분 소요)
  - 이렇게 하면 다른 웹사이트에서 이 키를 가져다 쓰는 걸 막을 수 있어요(단, 스크립트로 직접 요청하는 것까지 완전히 막지는 못함).
  - 제한을 건 뒤 사이트가 안 되면 주소 오타(`https://`, 끝의 `/*`)를 확인하세요.

### 4) 고쳤는데 예전 화면이 계속 보임 (캐시 문제)
- GitHub Pages는 파일을 약 **10분간 캐시**합니다. 배포 후 몇 분 기다리기
- PC: `Ctrl + Shift + R`(맥은 `Cmd + Shift + R`)로 강력 새로고침
- 폰: 브라우저 탭을 닫았다 다시 열기, 안 되면 사이트 데이터 삭제
- 확실하게 하려면 `index.html`의 `style.css?v=1`, `app.js?v=1`과 `app.js` 첫 줄의 `firebase-config.js?v=1` 숫자를 **함께 올려서**(`v=2`) 다시 배포하세요. 브라우저가 새 파일로 인식합니다.

### 5) 중국 현지에서 사이트가 안 열려요
- Firebase(구글) 서버는 중국 본토 일반 와이파이/현지 유심에서 막혀 있어요.
- **한국 통신사 로밍 또는 해외 eSIM**은 대부분 그대로 접속됩니다. 그래도 안 되면 VPN을 켜세요.
- 이 사이트는 **오프라인 캐시**를 켜 두었어요. **출국 전 한국에서 한 번 열어 두면** 마지막 데이터가 폰에 저장돼서 연결이 끊겨도 내용을 볼 수 있습니다(상단 표시: 🟡 오프라인). 오프라인에서 수정한 내용은 다시 연결되면 자동으로 전송돼요.
- 장소·주소를 누르면 **고덕지도(Amap)**가 열려요(앱이 있으면 앱으로). 옆의 작은 "구글" 버튼은 한국에서 볼 때용이에요. 고덕지도는 중국어 이름·주소로 넣어야 정확히 찾아요.

### 6) 가족 코드를 바꿨는데 가족이 계속 들어와요 / 이름을 바꾸고 싶어요
- 코드를 바꿔 배포하면 다음 접속 때 새 코드를 다시 물어봅니다(캐시 때문에 몇 분 걸릴 수 있음).
- 이름은 화면 오른쪽 위 **👤 이름** 버튼을 눌러 바꿀 수 있어요.

### 7) 체험 모드 배너가 계속 보여요
- `firebase-config.js`의 `apiKey`가 아직 `"YOUR_API_KEY"`이면 체험 모드입니다. 4단계를 확인하세요.
- 체험 모드에서 넣은 데이터는 그 브라우저에만 있고 Firestore로 옮겨지지 않아요.

---

## ✨ 기능 요약
- 가족 코드 → 이름 입력(한 번만, localStorage 저장) → 새 항목에 작성자 자동 기록
- 항공편: 가는 편/오는 편, 비행시간 자동 계산(시차 반영), 예약번호 복사
- 숙소: 주소 누르면 지도, 박 수 자동 계산, 전화 바로 걸기
- 일정: Day 탭 + 세로 타임라인, 시간순 자동 정렬, 카테고리 색·아이콘, 비용(CNY→KRW)
- 준비물: 체크 즉시 모두에게 동기화, 진행률 표시
- 예산: 일정 비용 합산, 날짜별·카테고리별 막대, 환율 수정 시 가족 모두 동기화
- 유용한 정보: 접이식, 추가·수정·삭제 가능
- 삭제 확인창 + 5초 되돌리기, 스켈레톤 로딩, 빈 상태 안내, 다크모드, 오프라인 캐시
- 샘플 데이터 불러오기 / 샘플만 지우기
