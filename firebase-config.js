/* =====================================================================
 * ⚙️ 설정 파일 — 바꿀 값은 전부 이 파일 한곳에 모아 두었습니다.
 *
 *  1) firebaseConfig : Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에서 복사한 값
 *  2) TRIP_CONFIG    : 여행 날짜, 가족 코드, 환율 기본값 등
 *
 *  ※ firebaseConfig 를 아직 채우지 않으면(= "YOUR_" 로 시작하면)
 *    사이트가 "체험 모드"로 동작합니다. 이 기기 브라우저에만 저장되고
 *    가족과 공유되지 않으니, 화면 확인용으로만 쓰세요.
 * ===================================================================== */

// ---------------------------------------------------------------------
// 1) Firebase 웹앱 설정값 (README의 "Firebase 설정 가이드" 참고)
//    apiKey 는 원래 공개되는 값이라 깃허브에 올려도 괜찮습니다.
//    (데이터 보호는 Firestore 보안 규칙이 담당합니다)
// ---------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "AIzaSyDMk--lIURDEsyzDPbZSHoB2Z5NaDN1Kxc",
  authDomain: "shanghai-trip-16f7d.firebaseapp.com",
  projectId: "shanghai-trip-16f7d",
  storageBucket: "shanghai-trip-16f7d.firebasestorage.app",
  messagingSenderId: "917430692069",
  appId: "1:917430692069:web:3c3fb4362e507c2de2cc0c",
};

// ---------------------------------------------------------------------
// 2) 여행 설정
// ---------------------------------------------------------------------
export const TRIP_CONFIG = {
  // Firestore 저장 경로: trips/{TRIP_ID}/...
  // ★ firestore.rules 파일의 tripId() 값과 반드시 똑같아야 합니다!
  //   (남들이 추측하기 어렵게 영문·숫자를 섞어 바꿔 두는 걸 추천)
  TRIP_ID: "shanghai-2026-family",

  // 화면 상단 제목
  TITLE: "🇨🇳 상하이 가족여행",

  // 여행 기간 (YYYY-MM-DD). Day 탭과 D-Day가 이 값으로 계산됩니다.
  START_DATE: "2026-11-19",
  END_DATE: "2026-11-23",

  // 가족 코드 (첫 접속 시 입력). 바꾸면 모든 가족이 새 코드를 다시 입력해야 합니다.
  // ⚠️ 프론트엔드 코드에 그대로 보이므로 "진짜 보안"이 아니라 실수·봇 방지용입니다.
  FAMILY_CODE: "1225",

  // 환율 기본값 (1 CNY = ? KRW). 예산 섹션 입력칸에서 바꾸면 가족 모두에게 동기화됩니다.
  DEFAULT_EXCHANGE_RATE: 195,

  // 시차 계산용 UTC 오프셋 (한국 +9, 중국 +8 → 시차 1시간)
  // 가는 편 = 한국 출발 → 상하이 도착, 오는 편 = 상하이 출발 → 한국 도착으로 계산
  HOME_UTC_OFFSET: 9,
  DEST_UTC_OFFSET: 8,

  // 장소·주소를 눌렀을 때 열 지도 링크 (기본: 고덕지도)
  // 중국에선 구글맵이 VPN 없이 안 되고 위치도 어긋나서 고덕지도(Amap)를 기본으로 씀.
  //  - city=310000 : 상하이 지역 코드 → 상하이 안에서 검색
  //  - callnative=1 : 폰에 고덕지도 앱이 있으면 앱으로 바로 열기
  //  ※ 고덕지도는 중국어 이름·주소(예: 外滩, 上海市黄浦区...)로 넣어야 정확히 찾아요.
  mapUrl: (query) =>
    `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}&city=310000&callnative=1&src=family-trip`,

  // 옆에 작게 붙는 보조 지도 링크 (한국에서 볼 때용). 필요 없으면 null 로 바꾸세요.
  altMapUrl: (query) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
};
