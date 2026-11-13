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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
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
  START_DATE: "2026-12-24",
  END_DATE: "2026-12-27",

  // 가족 코드 (첫 접속 시 입력). 바꾸면 모든 가족이 새 코드를 다시 입력해야 합니다.
  // ⚠️ 프론트엔드 코드에 그대로 보이므로 "진짜 보안"이 아니라 실수·봇 방지용입니다.
  FAMILY_CODE: "1225",

  // 환율 기본값 (1 CNY = ? KRW). 예산 섹션 입력칸에서 바꾸면 가족 모두에게 동기화됩니다.
  DEFAULT_EXCHANGE_RATE: 195,

  // 시차 계산용 UTC 오프셋 (한국 +9, 중국 +8 → 시차 1시간)
  // 가는 편 = 한국 출발 → 상하이 도착, 오는 편 = 상하이 출발 → 한국 도착으로 계산
  HOME_UTC_OFFSET: 9,
  DEST_UTC_OFFSET: 8,

  // 장소·주소를 눌렀을 때 열 지도 링크.
  // 중국 현지에선 구글맵이 VPN 없이 안 될 수 있어요. 바이두/고덕으로 바꾸려면 아래 주석 참고.
  mapUrl: (query) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  // 고덕지도(Amap) 예시:
  // mapUrl: (query) => `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}`,
};
