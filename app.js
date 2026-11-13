/* =====================================================================
 * 상하이 가족여행 — 메인 스크립트 (바닐라 JS, ES Module, 빌드 불필요)
 *
 * 구조
 *  1. 유틸 (localStorage, 날짜, 문자열 이스케이프)
 *  2. 카테고리·폼 스키마 (어떤 섹션에 어떤 입력칸이 있는지)
 *  3. 저장소(백엔드) — Firebase Firestore / 체험 모드(localStorage)
 *  4. 화면 그리기 (항공·숙소·일정·체크리스트·예산·팁)
 *  5. 추가/수정 모달, 삭제 + 되돌리기
 *  6. 샘플 데이터
 *  7. 가족 코드·이름 입력 → 앱 시작
 * ===================================================================== */
import { firebaseConfig, TRIP_CONFIG as C } from "./firebase-config.js?v=9";

const FIREBASE_VERSION = "10.12.2"; // Firebase 웹 SDK (CDN) 버전

/* =====================================================================
 * 1. 유틸
 * ===================================================================== */

// localStorage는 사생활 보호 모드 등에서 에러가 날 수 있어 try/catch로 감쌈
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};
const LS_KEY = {
  code: `trip:${C.TRIP_ID}:familyCode`, // 맞게 입력한 가족 코드
  name: "trip:userName",                // 내 이름(작성자)
  day: `trip:${C.TRIP_ID}:selectedDay`, // 마지막으로 본 Day 탭
  tab: `trip:${C.TRIP_ID}:tab`,         // 마지막으로 본 화면 탭 (plan / places)
};

const $ = (sel, root = document) => root.querySelector(sel);

// 사용자가 입력한 글자를 HTML에 넣기 전에 반드시 이스케이프 (XSS 방지)
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const me = () => ls.get(LS_KEY.name) || "익명";
const fmtNum = (n) => Math.round(n).toLocaleString("ko-KR");

// --- 날짜 유틸: 'YYYY-MM-DD' 문자열을 "현지 날짜"로 다룸 (시간대 밀림 방지) ---
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const parseYMD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const pad = (n) => String(n).padStart(2, "0");
const toYMD = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const addDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate() + n); return toYMD(d); };
const daysBetween = (a, b) => Math.round((parseYMD(b) - parseYMD(a)) / 86400000);
const todayYMD = () => toYMD(new Date());
const fmtMD = (s) => { if (!s) return ""; const d = parseYMD(s); return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`; };
const fmtFull = (s) => { const d = parseYMD(s); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WEEK[d.getDay()]})`; };

// 여행 기간의 모든 날짜 목록 ['2026-12-24', '2026-12-25', ...]
function tripDays() {
  const n = Math.max(0, daysBetween(C.START_DATE, C.END_DATE));
  return Array.from({ length: n + 1 }, (_, i) => addDays(C.START_DATE, i));
}

// Firestore Timestamp / 숫자(체험 모드) 모두 밀리초로 변환 (정렬용)
const tsVal = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : 0);

/* =====================================================================
 * 2. 카테고리 · 폼 스키마
 * ===================================================================== */

// 일정 카테고리 (키는 보안 규칙에서도 검사하므로 바꾸면 rules도 같이 수정)
const CATEGORIES = {
  sight: { label: "관광", icon: "🏯", color: "#e0452f" },
  food:  { label: "식사", icon: "🍜", color: "#e08a00" },
  move:  { label: "이동", icon: "🚇", color: "#2f7fd8" },
  shop:  { label: "쇼핑", icon: "🛍️", color: "#c2409a" },
  rest:  { label: "휴식", icon: "☕", color: "#1f9d6b" },
  etc:   { label: "기타", icon: "📌", color: "#8a7f76" },
};

// --- 맛집·할거리(places) 분류 ---
// ※ 키는 firestore.rules 의 validPlace 에서도 검사하므로 바꾸면 rules도 같이 수정
const DISTRICTS = {
  wai:       { label: "와이탄·난징동루", icon: "🌃" },
  yuyuan:    { label: "예원·청황묘", icon: "🏮" },
  people:    { label: "인민광장", icon: "🏛️" },
  xintiandi: { label: "신천지·우캉루·푸시", icon: "🌳" },
  lujiazui:  { label: "루자쭈이·푸동", icon: "🏙️" },
  disney:    { label: "디즈니", icon: "🏰" },
  etc:       { label: "기타 지역", icon: "📍" },
};
const KINDS = {
  food:  { label: "식당", icon: "🍜" },
  cafe:  { label: "카페", icon: "☕" },
  sight: { label: "관광", icon: "🏯" },
  shop:  { label: "쇼핑", icon: "🛍️" },
  etc:   { label: "기타", icon: "📌" },
};
// rank: 같은 ♥ 수일 때 예약 급한 곳이 위로
const RESERVES = {
  must:        { label: "예약 필수", icon: "🔴", rank: 0 },
  recommended: { label: "예약 권장", icon: "🟠", rank: 1 },
  queue:       { label: "현장 대기", icon: "⏳", rank: 2 },
  none:        { label: "예약 불필요", icon: "🟢", rank: 3 },
};
// 맛집 종류 → 일정 카테고리 (📅 일정에 추가할 때 사용)
const KIND_TO_CAT = { food: "food", cafe: "food", sight: "sight", shop: "shop", etc: "etc" };
const MAX_VOTES = 20; // rules 의 votes.size() <= 20 과 같은 값

/*
 * 섹션별 입력 폼 정의
 *  k: 저장 필드명 / type: text·date·time·number·select·textarea·checkbox / half: 2칸 배치
 *  max: 최대 글자수 (보안 규칙의 길이 제한과 맞춰 둠)
 */
const SCHEMAS = {
  flights: {
    title: "항공편",
    fields: [
      { k: "direction", label: "구분", type: "select", required: true,
        options: [["out", "🛫 가는 편 (한국 → 상하이)"], ["back", "🛬 오는 편 (상하이 → 한국)"]] },
      { k: "airline", label: "항공사", max: 40, half: true, placeholder: "대한항공" },
      { k: "flightNo", label: "편명", max: 20, half: true, placeholder: "KE893" },
      { k: "depAirport", label: "출발 공항", max: 40, placeholder: "인천(ICN)" },
      { k: "depDate", label: "출발 날짜", type: "date", half: true },
      { k: "depTime", label: "출발 시각 (현지)", type: "time", half: true },
      { k: "arrAirport", label: "도착 공항", max: 40, placeholder: "푸동(PVG)" },
      { k: "arrDate", label: "도착 날짜", type: "date", half: true },
      { k: "arrTime", label: "도착 시각 (현지)", type: "time", half: true },
      { k: "bookingRef", label: "예약번호", max: 40, half: true },
      { k: "seat", label: "좌석", max: 40, half: true, placeholder: "32A, 32B" },
      { k: "memo", label: "메모", type: "textarea", max: 500 },
    ],
    hint: "비행시간은 출발·도착 시각으로 자동 계산돼요 (한국-중국 시차 1시간 반영).",
    defaults: () => {
      const back = state.flights.some((f) => f.direction === "out");
      const date = back ? C.END_DATE : C.START_DATE;
      return { direction: back ? "back" : "out", depDate: date, arrDate: date };
    },
  },
  hotels: {
    title: "숙소",
    fields: [
      { k: "name", label: "숙소명", max: 100, required: true, placeholder: "OO 호텔 와이탄점" },
      { k: "address", label: "주소", max: 200, placeholder: "중국어 주소를 넣으면 택시 기사님께 보여주기 좋아요" },
      { k: "checkInDate", label: "체크인 날짜", type: "date", half: true },
      { k: "checkInTime", label: "체크인 시각", type: "time", half: true },
      { k: "checkOutDate", label: "체크아웃 날짜", type: "date", half: true },
      { k: "checkOutTime", label: "체크아웃 시각", type: "time", half: true },
      { k: "bookingRef", label: "예약번호", max: 40, half: true },
      { k: "phone", label: "연락처", type: "tel", max: 40, half: true, placeholder: "+86-21-..." },
      { k: "memo", label: "메모", type: "textarea", max: 500 },
    ],
    defaults: () => ({ checkInDate: C.START_DATE, checkInTime: "15:00", checkOutDate: C.END_DATE, checkOutTime: "11:00" }),
  },
  events: {
    title: "일정",
    fields: [
      { k: "date", label: "날짜", type: "date", half: true, required: true },
      { k: "time", label: "시간", type: "time", half: true },
      { k: "title", label: "제목", max: 100, required: true, placeholder: "와이탄 야경 산책" },
      { k: "category", label: "카테고리", type: "select", required: true,
        options: Object.entries(CATEGORIES).map(([k, c]) => [k, `${c.icon} ${c.label}`]) },
      { k: "place", label: "장소", max: 100, placeholder: "外滩 (중국어 지명이 검색에 정확해요)" },
      { k: "cost", label: "예상 비용 (CNY)", type: "number", max: 10000000, half: true, placeholder: "0" },
      { k: "reserved", label: "예약 완료", type: "checkbox", half: true },
      { k: "memo", label: "메모", type: "textarea", max: 500 },
    ],
    defaults: () => ({ date: state.day || C.START_DATE, category: "sight" }),
  },
  checklist: {
    title: "준비물",
    fields: [{ k: "text", label: "준비물", max: 100, required: true, placeholder: "보조배터리" }],
  },
  tips: {
    title: "유용한 정보",
    fields: [
      { k: "title", label: "제목", max: 60, required: true, placeholder: "💳 알리페이 사용법" },
      { k: "body", label: "내용", type: "textarea", max: 3000, rows: 8 },
    ],
  },
  // ⚠️ 여기 필드 + votes + 공통 메타(author 등)가 firestore.rules validPlace 의 hasOnly 목록과 정확히 같아야 함
  places: {
    title: "맛집·할거리",
    fields: [
      { k: "name", label: "이름 (한글)", max: 100, required: true, placeholder: "예상하이 북경오리" },
      { k: "nameZh", label: "중국어 이름 (고덕지도 검색용)", max: 50, placeholder: "夜上海" },
      { k: "district", label: "지역", type: "select", half: true, required: true,
        options: Object.entries(DISTRICTS).map(([k, d]) => [k, `${d.icon} ${d.label}`]) },
      { k: "kind", label: "종류", type: "select", half: true, required: true,
        options: Object.entries(KINDS).map(([k, d]) => [k, `${d.icon} ${d.label}`]) },
      { k: "reserve", label: "예약", type: "select", required: true,
        options: Object.entries(RESERVES).map(([k, r]) => [k, `${r.icon} ${r.label}`]) },
      { k: "reserveHow", label: "예약 방법", max: 100, placeholder: "따종디엔핑 订座 / 공식 앱 / Trip.com 사전 예매" },
      { k: "priceNote", label: "가격대·예산 메모", max: 60, half: true, placeholder: "1인 150위안 안팎" },
      { k: "checkedAt", label: "정보 확인일", type: "date", half: true },
      { k: "memo", label: "메모", type: "textarea", max: 500, placeholder: "토·일 혼잡, 휴무일, 추천 메뉴 등" },
    ],
    hint: "중국어 이름을 넣으면 📍 지도 링크가 고덕지도에서 정확히 찾아요. ♥ 투표는 카드에서 눌러요.",
    defaults: () => ({ district: state.placeFilter.district !== "all" ? state.placeFilter.district : "wai",
      kind: "food", reserve: "none", checkedAt: todayYMD() }),
  },
};

const COLS = ["flights", "hotels", "events", "checklist", "tips", "places"];
const CHECK_PER_PAGE = 6; // 준비물 슬라이드 한 페이지에 보여줄 개수

/* =====================================================================
 * 3. 저장소(백엔드)
 *    화면 코드는 아래 인터페이스만 사용합니다.
 *    subscribe(col, cb) / subscribeSettings(cb) / add / set / update / remove
 *    listToggle / addMany / removeMany / saveSettings / now()
 * ===================================================================== */

// 3-1. Firebase Firestore (실제 공유 모드)
async function createFirebaseBackend() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  // 동적 import: CDN이 막혀도(예: 중국 현지 와이파이) 화면은 뜨고 안내 문구를 보여줄 수 있음
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);

  // 오프라인 캐시(IndexedDB) 켜기: 한 번 열어 둔 데이터는 인터넷이 끊겨도 보임
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn("오프라인 캐시를 켤 수 없어 기본 모드로 동작합니다.", err);
    db = fs.getFirestore(app);
  }

  // 모든 데이터는 trips/{TRIP_ID}/{컬렉션}/{문서} 아래에만 저장
  const colRef = (col) => fs.collection(db, "trips", C.TRIP_ID, col);
  const docRef = (col, id) => fs.doc(db, "trips", C.TRIP_ID, col, id);
  const settingsRef = docRef("settings", "main");

  return {
    mode: "firebase",
    now: () => fs.serverTimestamp(),
    subscribe(col, cb, onErr) {
      // onSnapshot = 실시간 구독. 누가 수정하면 자동으로 cb가 다시 호출됨
      return fs.onSnapshot(colRef(col), { includeMetadataChanges: true }, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
        cb(items, { fromCache: snap.metadata.fromCache });
      }, onErr);
    },
    subscribeSettings(cb, onErr) {
      return fs.onSnapshot(settingsRef, (s) => cb(s.exists() ? s.data() : {}), onErr);
    },
    add: (col, data) => fs.addDoc(colRef(col), data),
    set: (col, id, data) => fs.setDoc(docRef(col, id), data),
    update: (col, id, patch) => fs.updateDoc(docRef(col, id), patch),
    remove: (col, id) => fs.deleteDoc(docRef(col, id)),
    // 배열 필드에 값 넣기/빼기 (♥ 투표). arrayUnion/arrayRemove 라서 두 사람이 동시에 눌러도 안 덮어씀
    listToggle: (col, id, field, value, on) =>
      fs.updateDoc(docRef(col, id), { [field]: on ? fs.arrayUnion(value) : fs.arrayRemove(value) }),
    async addMany(list) { // [[col, data], ...] 한 번에 쓰기
      const batch = fs.writeBatch(db);
      list.forEach(([col, data]) => batch.set(fs.doc(colRef(col)), data));
      await batch.commit();
    },
    async removeMany(list) { // [[col, id], ...]
      const batch = fs.writeBatch(db);
      list.forEach(([col, id]) => batch.delete(docRef(col, id)));
      await batch.commit();
    },
    saveSettings: (data) => fs.setDoc(settingsRef, data, { merge: true }),
  };
}

// 3-2. 체험 모드: firebase-config.js를 아직 안 채웠을 때. 이 브라우저에만 저장됨
function createLocalBackend() {
  const KEY = `trip:${C.TRIP_ID}:localdb`;
  let db = {};
  try { db = JSON.parse(ls.get(KEY)) || {}; } catch { db = {}; }
  const subs = {};
  const persist = () => ls.set(KEY, JSON.stringify(db));
  const list = (col) => Object.entries(db[col] || {}).map(([id, v]) => ({ id, ...v }));
  const emit = (col) => (subs[col] || []).forEach((cb) => cb(col === "settings" ? db.settings || {} : list(col), { fromCache: false }));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const write = (col, fn) => { db[col] = db[col] || {}; fn(db[col]); persist(); queueMicrotask(() => emit(col)); return Promise.resolve(); };

  const api = {
    mode: "local",
    now: () => Date.now(),
    subscribe(col, cb) { (subs[col] ||= []).push(cb); queueMicrotask(() => emit(col)); },
    subscribeSettings(cb) { api.subscribe("settings", cb); },
    add: (col, data) => write(col, (c) => { c[uid()] = data; }),
    set: (col, id, data) => write(col, (c) => { c[id] = data; }),
    update: (col, id, patch) => write(col, (c) => { c[id] = { ...c[id], ...patch }; }),
    remove: (col, id) => write(col, (c) => { delete c[id]; }),
    listToggle: (col, id, field, value, on) => write(col, (c) => {
      if (!c[id]) return;
      const cur = (Array.isArray(c[id][field]) ? c[id][field] : []).filter((x) => x !== value);
      c[id] = { ...c[id], [field]: on ? [...cur, value] : cur };
    }),
    async addMany(items) { for (const [col, d] of items) await api.add(col, d); },
    async removeMany(items) { for (const [col, id] of items) await api.remove(col, id); },
    saveSettings: (data) => { db.settings = { ...(db.settings || {}), ...data }; persist(); queueMicrotask(() => emit("settings")); return Promise.resolve(); },
  };
  return api;
}

async function createBackend() {
  const configured = firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR");
  return configured ? createFirebaseBackend() : createLocalBackend();
}

/* =====================================================================
 * 4. 상태 & 화면 그리기
 * ===================================================================== */
const state = {
  flights: [], hotels: [], events: [], checklist: [], tips: [], places: [],
  settings: {},
  tab: "plan",         // 화면 탭: plan(일정) / places(맛집·할거리)
  placeFilter: { district: "all", kind: "all", reserveOnly: false },
  loaded: {},          // 컬렉션별 첫 데이터 도착 여부 (스켈레톤 표시용)
  day: ls.get(LS_KEY.day),
  openTips: new Set(), // 펼쳐 둔 팁 (다시 그려도 유지)
  checkPage: 0,        // 준비물 슬라이드에서 보고 있는 페이지
};
let backend = null;
let booted = false;

const currentRate = () => Number(state.settings.exchangeRate) || C.DEFAULT_EXCHANGE_RATE;
const krw = (cny) => `₩${fmtNum(cny * currentRate())}`;

// ---------- 공통 조각 ----------
const skeleton = (n, cls = "") => Array.from({ length: n }, () => `<div class="skeleton ${cls}"></div>`).join("");

function emptyBox(icon, title, desc, extra = "") {
  return `<div class="empty"><div class="e-icon">${icon}</div><p><b>${title}</b></p><p class="small">${desc}</p>${extra}</div>`;
}
function actions(col, id) {
  return `<div class="item-actions">
    <button class="icon-btn" type="button" data-action="edit" data-col="${col}" data-id="${esc(id)}" aria-label="수정">✏️</button>
    <button class="icon-btn" type="button" data-action="delete" data-col="${col}" data-id="${esc(id)}" aria-label="삭제">🗑️</button>
  </div>`;
}
function byline(item) {
  const edited = item.updatedBy && item.updatedBy !== item.author ? ` · 수정 ${esc(item.updatedBy)}` : "";
  return `<div class="byline">✍️ ${esc(item.author || "익명")}${edited}</div>`;
}
const memo = (text) => (text ? `<p class="memo">${esc(text)}</p>` : "");
// 기본 지도(고덕) 링크 + 보조 지도(구글) 작은 링크
const mapLink = (q) => {
  if (!q) return "";
  const alt = C.altMapUrl
    ? ` <a class="map-alt" href="${esc(C.altMapUrl(q))}" target="_blank" rel="noopener" aria-label="구글 지도로 보기">구글</a>`
    : "";
  return `<div class="map-row"><a class="map-link" href="${esc(C.mapUrl(q))}" target="_blank" rel="noopener">📍 ${esc(q)}</a>${alt}</div>`;
};
const sampleBadge = (item) => (item.sample ? `<span class="badge badge-sample">샘플</span>` : "");

// 정의 목록(예약번호 등). 값이 빈 줄은 생략, copy=true면 복사 버튼
function metaList(rows) {
  const html = rows.filter(([, v]) => v).map(([label, v, copy]) =>
    `<dt>${label}</dt><dd>${esc(v)}${copy ? ` <button class="copy-btn" type="button" data-action="copy" data-text="${esc(v)}">복사</button>` : ""}</dd>`).join("");
  return html ? `<dl class="meta">${html}</dl>` : "";
}

// ---------- 헤더 (제목·기간·D-Day) ----------
function renderHeader() {
  document.querySelectorAll('[data-bind="title"]').forEach((el) => (el.textContent = C.TITLE));
  document.title = C.TITLE.replace(/^\S+\s/, ""); // 탭 제목은 이모지 제외
  const nights = daysBetween(C.START_DATE, C.END_DATE);
  const datesText = `${fmtFull(C.START_DATE)} ~ ${fmtFull(C.END_DATE)} · ${nights}박 ${nights + 1}일`;
  $("#tripDates").textContent = datesText;
  document.querySelectorAll('[data-bind="dates"]').forEach((el) => (el.textContent = datesText));

  const today = todayYMD();
  const toStart = daysBetween(today, C.START_DATE);
  const toEnd = daysBetween(today, C.END_DATE);
  let big, msg;
  if (toStart > 0) [big, msg] = [`D-${toStart}`, `출발까지 ${toStart}일 남았어요 ✈️`];
  else if (toStart === 0) [big, msg] = ["D-DAY", "오늘 출발! 여권 챙기셨죠? 🛂"];
  else if (toEnd >= 0) [big, msg] = [`Day ${-toStart + 1}`, `여행 ${-toStart + 1}일차 즐기는 중 🎉`];
  else [big, msg] = ["완료", "즐거운 추억 가득했길 바라요 📸"];
  $("#dday").innerHTML = `<strong>${big}</strong><span>${msg}</span>`;
  // 입장 화면의 작은 D-Day 배지
  document.querySelectorAll('[data-bind="dday"]').forEach((el) => (el.textContent = toStart > 0 ? `${big} · 출발까지 ${toStart}일` : msg));
  // 출발 전에는 '준비물 체크리스트'를 맨 위로 (style.css의 .pre-trip 참고)
  document.body.classList.toggle("pre-trip", toStart > 0);
  $("#whoami").textContent = `👤 ${me()}`;
}

// ---------- 항공편 ----------
// 출발/도착 시각(각각 현지 시각)을 UTC로 바꿔 실제 비행시간(분) 계산
function flightMinutes(f) {
  if (!f.depTime || !f.arrTime || !f.depDate) return null;
  const back = f.direction === "back";
  const depOff = back ? C.DEST_UTC_OFFSET : C.HOME_UTC_OFFSET; // 오는 편은 중국 출발
  const arrOff = back ? C.HOME_UTC_OFFSET : C.DEST_UTC_OFFSET;
  const toUTC = (date, time, off) => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return Date.UTC(y, m - 1, d, hh, mm) - off * 3600000;
  };
  let mins = (toUTC(f.arrDate || f.depDate, f.arrTime, arrOff) - toUTC(f.depDate, f.depTime, depOff)) / 60000;
  if (!f.arrDate && mins < 0) mins += 1440; // 도착 날짜 비워 두고 자정 넘긴 경우
  return mins > 0 && mins < 2880 ? mins : null;
}
const fmtDur = (m) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`;

function renderFlights() {
  const el = $("#list-flights");
  if (!state.loaded.flights) return (el.innerHTML = skeleton(2));
  if (!state.flights.length) {
    return (el.innerHTML = emptyBox("✈️", "아직 등록된 항공편이 없어요", "＋ 추가를 눌러 가는 편·오는 편을 등록해 주세요."));
  }
  const order = { out: 0, back: 1 };
  const list = [...state.flights].sort((a, b) =>
    (order[a.direction] ?? 2) - (order[b.direction] ?? 2) ||
    `${a.depDate}${a.depTime}`.localeCompare(`${b.depDate}${b.depTime}`));

  el.innerHTML = list.map((f) => {
    const mins = flightMinutes(f);
    const back = f.direction === "back";
    return `<article class="card">
      <div class="card-head">
        <span class="badge ${back ? "badge-gold" : "badge-red"}">${back ? "🛬 오는 편" : "🛫 가는 편"}</span>
        ${sampleBadge(f)}
        <span class="card-sub">${esc([f.airline, f.flightNo].filter(Boolean).join(" "))}</span>
        ${actions("flights", f.id)}
      </div>
      <div class="route">
        <div class="port"><strong>${esc(f.depAirport || "출발")}</strong><span class="time">${esc(f.depTime || "--:--")}</span><span class="date">${fmtMD(f.depDate)}</span></div>
        <div class="route-line"><div class="plane"><span>✈</span></div><span>${mins ? fmtDur(mins) : "비행시간"}</span></div>
        <div class="port right"><strong>${esc(f.arrAirport || "도착")}</strong><span class="time">${esc(f.arrTime || "--:--")}</span><span class="date">${fmtMD(f.arrDate || f.depDate)}</span></div>
      </div>
      ${metaList([["예약번호", f.bookingRef, true], ["좌석", f.seat]])}
      ${memo(f.memo)}
      ${byline(f)}
    </article>`;
  }).join("");
}

// ---------- 숙소 ----------
function renderHotels() {
  const el = $("#list-hotels");
  if (!state.loaded.hotels) return (el.innerHTML = skeleton(1));
  if (!state.hotels.length) {
    return (el.innerHTML = emptyBox("🏨", "아직 등록된 숙소가 없어요", "＋ 추가를 눌러 숙소 정보를 넣어 주세요."));
  }
  const list = [...state.hotels].sort((a, b) => (a.checkInDate || "").localeCompare(b.checkInDate || ""));
  el.innerHTML = list.map((h) => {
    const nights = h.checkInDate && h.checkOutDate ? daysBetween(h.checkInDate, h.checkOutDate) : 0;
    return `<article class="card">
      <div class="card-head">
        ${nights > 0 ? `<span class="badge badge-gold">🌙 ${nights}박</span>` : ""}
        ${sampleBadge(h)}
        ${actions("hotels", h.id)}
      </div>
      <h3 class="card-title">${esc(h.name)}</h3>
      ${mapLink(h.address || h.name)}
      <div class="stay">
        <div><small>체크인</small><b>${fmtMD(h.checkInDate) || "-"}</b> ${esc(h.checkInTime || "")}</div>
        <div><small>체크아웃</small><b>${fmtMD(h.checkOutDate) || "-"}</b> ${esc(h.checkOutTime || "")}</div>
      </div>
      ${metaList([["예약번호", h.bookingRef, true]])}
      ${h.phone ? `<dl class="meta"><dt>연락처</dt><dd><a href="tel:${esc(h.phone.replace(/[^\d+]/g, ""))}">📞 ${esc(h.phone)}</a></dd></dl>` : ""}
      ${memo(h.memo)}
      ${byline(h)}
    </article>`;
  }).join("");
}

// ---------- 일자별 일정 ----------
const byTime = (a, b) =>
  (a.time || "99:99").localeCompare(b.time || "99:99") || tsVal(a.createdAt) - tsVal(b.createdAt);

function renderSchedule(scrollTab = false) {
  const tabsEl = $("#dayTabs");
  const listEl = $("#list-events");
  const days = tripDays();
  // 여행 기간 밖 날짜에 들어간 일정도 놓치지 않도록 '기타' 탭으로 추가
  const extra = [...new Set(state.events.map((e) => e.date).filter((d) => d && !days.includes(d)))].sort();
  const all = [...days, ...extra];

  if (!all.includes(state.day)) {
    const t = todayYMD();
    state.day = days.includes(t) ? t : days[0];
  }

  const today = todayYMD();
  tabsEl.innerHTML = all.map((d, i) => {
    const n = state.events.filter((e) => e.date === d).length;
    const label = i < days.length ? `Day ${i + 1}` : "기타";
    const active = d === state.day;
    return `<button class="day-tab ${active ? "active" : ""} ${d === today ? "today" : ""}" type="button" role="tab"
      aria-selected="${active}" data-action="day" data-day="${d}">
      <span class="day-n">${label}</span><span class="day-d">${fmtMD(d)}</span>
      ${n ? `<span class="day-count">${n}</span>` : ""}</button>`;
  }).join("");

  // 선택된 탭이 보이도록 가로 스크롤만 이동 (세로 스크롤은 건드리지 않음)
  const activeTab = tabsEl.querySelector(".active");
  if (activeTab && (scrollTab || !tabsEl.dataset.scrolled)) {
    tabsEl.scrollLeft = activeTab.offsetLeft - tabsEl.clientWidth / 2 + activeTab.clientWidth / 2;
    tabsEl.dataset.scrolled = "1";
  }

  if (!state.loaded.events) {
    $("#daySummary").textContent = "";
    return (listEl.innerHTML = skeleton(3));
  }

  const items = state.events.filter((e) => e.date === state.day).sort(byTime);
  const dayCost = items.reduce((s, e) => s + (Number(e.cost) || 0), 0);
  $("#daySummary").innerHTML = items.length
    ? `${fmtFull(state.day)} · 일정 <b>${items.length}개</b> · 예상 <b>¥${fmtNum(dayCost)}</b> (${krw(dayCost)})`
    : fmtFull(state.day);

  if (!items.length) {
    const noData = !state.events.length;
    listEl.innerHTML = emptyBox("🗓️", "이 날은 아직 일정이 없어요",
      noData ? "＋ 추가로 직접 넣거나, 샘플 일정을 불러와 보세요." : "＋ 추가를 눌러 일정을 넣어 주세요.",
      noData ? `<button class="btn btn-gold" type="button" data-action="sample">🧧 샘플 데이터 불러오기</button>` : "");
    return;
  }

  listEl.innerHTML = `<ol class="timeline">${items.map((e) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.etc;
    const cost = Number(e.cost) || 0;
    return `<li class="tl-item" style="--cat:${cat.color}">
      <div class="tl-time ${e.time ? "" : "none"}">${esc(e.time || "미정")}</div>
      <div class="tl-dot" aria-hidden="true">${cat.icon}</div>
      <article class="card tl-card">
        <div class="card-head">
          <span class="cat-chip">${cat.icon} ${cat.label}</span>
          ${e.reserved ? `<span class="badge badge-ok">✔ 예약완료</span>` : ""}
          ${sampleBadge(e)}
          ${actions("events", e.id)}
        </div>
        <h3 class="tl-title">${esc(e.title)}</h3>
        ${mapLink(e.place)}
        ${cost ? `<div class="cost">¥${fmtNum(cost)} <small>≈ ${krw(cost)}</small></div>` : ""}
        ${memo(e.memo)}
        ${byline(e)}
      </article>
    </li>`;
  }).join("")}</ol>`;
}

// ---------- 준비물 체크리스트 ----------
function renderChecklist() {
  const el = $("#list-checklist");
  if (!state.loaded.checklist) return (el.innerHTML = skeleton(3, "sm"));
  if (!state.checklist.length) {
    return (el.innerHTML = emptyBox("🧳", "준비물 목록이 비어 있어요", "여권·환전·eSIM 같은 기본 준비물을 한 번에 넣을 수 있어요.",
      `<button class="btn btn-gold" type="button" data-action="seed" data-col="checklist">기본 준비물 넣기</button>`));
  }
  const list = [...state.checklist].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || tsVal(a.createdAt) - tsVal(b.createdAt));
  const done = list.filter((c) => c.done).length;
  const pct = Math.round((done / list.length) * 100);

  // CHECK_PER_PAGE개씩 잘라 좌우로 넘기는 페이지로 만듦
  const pages = [];
  for (let i = 0; i < list.length; i += CHECK_PER_PAGE) pages.push(list.slice(i, i + CHECK_PER_PAGE));
  state.checkPage = Math.min(state.checkPage, pages.length - 1);

  const itemHTML = (c) => `
      <li class="check-item ${c.done ? "done" : ""}">
        <label>
          <input type="checkbox" data-action="toggle" data-id="${esc(c.id)}" ${c.done ? "checked" : ""} />
          <span><span class="check-text">${esc(c.text)}</span>
          <span class="check-by">${c.done && c.updatedBy ? `✔ ${esc(c.updatedBy)}` : `✍️ ${esc(c.author || "익명")}`}</span></span>
        </label>
        ${actions("checklist", c.id)}
      </li>`;

  el.innerHTML = `
    <div class="progress"><span>${done}/${list.length} 완료</span><div class="progress-bar"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>
    <div class="check-track" id="checkTrack">
      ${pages.map((p, i) => `<ul class="card checklist check-page" aria-label="${i + 1}/${pages.length} 페이지">${p.map(itemHTML).join("")}</ul>`).join("")}
    </div>
    ${pages.length > 1 ? `
    <div class="check-pager">
      <button class="icon-btn" type="button" data-action="check-page" data-dir="-1" aria-label="이전">‹</button>
      <div class="check-dots">${pages.map((p, i) => {
        const left = p.filter((c) => !c.done).length; // 남은 항목이 없으면 금색 점
        return `<button type="button" class="dot ${left ? "" : "all-done"}" data-action="check-page" data-page="${i}" aria-label="${i + 1}페이지"></button>`;
      }).join("")}</div>
      <span class="check-count" id="checkCount"></span>
      <button class="icon-btn" type="button" data-action="check-page" data-dir="1" aria-label="다음">›</button>
    </div>` : ""}`;

  // 다시 그려도 보던 페이지 유지 (체크할 때마다 첫 페이지로 튀지 않게)
  const track = $("#checkTrack");
  track.scrollLeft = track.children[state.checkPage]?.offsetLeft ?? 0;
  updateCheckDots();
  track.addEventListener("scroll", () => {
    const w = track.clientWidth || 1;
    const page = Math.round(track.scrollLeft / (w + 12)); // 12 = 페이지 간격(gap)
    if (page !== state.checkPage) { state.checkPage = page; updateCheckDots(); }
  }, { passive: true });
}

function updateCheckDots() {
  const dots = document.querySelectorAll(".check-dots .dot");
  dots.forEach((d, i) => d.classList.toggle("active", i === state.checkPage));
  const count = $("#checkCount");
  if (count) count.textContent = `${state.checkPage + 1} / ${dots.length}`;
}

function goCheckPage(page) {
  const track = $("#checkTrack");
  if (!track) return;
  const max = track.children.length - 1;
  state.checkPage = Math.max(0, Math.min(max, page));
  track.scrollTo({ left: track.children[state.checkPage].offsetLeft, behavior: "smooth" });
  updateCheckDots();
}

// ---------- 예산 ----------
function renderBudget() {
  const rateInput = $("#rateInput");
  if (document.activeElement !== rateInput) rateInput.value = currentRate();

  const totalEl = $("#budgetTotal");
  const body = $("#budgetBody");
  if (!state.loaded.events) { totalEl.innerHTML = ""; body.innerHTML = skeleton(1, "sm"); return; }

  const costOf = (e) => Number(e.cost) || 0;
  const total = state.events.reduce((s, e) => s + costOf(e), 0);
  totalEl.innerHTML = `<div><small>총 예상 경비 (일정 비용 합계)</small><strong>¥${fmtNum(total)}</strong></div><div class="krw">≈ ${krw(total)}</div>`;

  if (!total) {
    body.innerHTML = `<p class="muted small" style="margin:0">일정에 '예상 비용'을 입력하면 여기에 자동으로 합산돼요.</p>`;
    return;
  }
  const row = (label, amount, color) => `<div class="brow" ${color ? `style="--cat:${color}"` : ""}>
      <span>${label}</span><div class="bar"><i style="width:${(amount / total) * 100}%"></i></div>
      <span class="amt">¥${fmtNum(amount)}<small>${krw(amount)}</small></span></div>`;

  const days = tripDays();
  const dates = [...new Set([...days, ...state.events.map((e) => e.date)])].filter(Boolean).sort();
  const byDay = dates.map((d) => {
    const amt = state.events.filter((e) => e.date === d).reduce((s, e) => s + costOf(e), 0);
    const i = days.indexOf(d);
    return amt ? row(i >= 0 ? `Day ${i + 1} <small class="muted">${fmtMD(d)}</small>` : fmtMD(d), amt) : "";
  }).join("");
  const byCat = Object.entries(CATEGORIES).map(([k, c]) => {
    const amt = state.events.filter((e) => (e.category || "etc") === k).reduce((s, e) => s + costOf(e), 0);
    return amt ? row(`${c.icon} ${c.label}`, amt, c.color) : "";
  }).join("");
  const missing = state.events.filter((e) => !costOf(e)).length;

  body.innerHTML = `<h4>날짜별</h4>${byDay}<h4>카테고리별</h4>${byCat}
    ${missing ? `<p class="muted small">비용이 입력되지 않은 일정 ${missing}개는 0원으로 계산했어요.</p>` : ""}`;
}

// ---------- 유용한 정보 ----------
function renderTips() {
  const el = $("#list-tips");
  if (!state.loaded.tips) return (el.innerHTML = skeleton(3, "sm"));
  if (!state.tips.length) {
    return (el.innerHTML = emptyBox("💡", "등록된 정보가 없어요", "환율, 알리페이, VPN, 공항 이동 방법 같은 기본 팁을 넣을 수 있어요.",
      `<button class="btn btn-gold" type="button" data-action="seed" data-col="tips">기본 팁 넣기</button>`));
  }
  const list = [...state.tips].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || tsVal(a.createdAt) - tsVal(b.createdAt));
  el.innerHTML = list.map((t) => `
    <details class="card tip" data-tip="${esc(t.id)}" ${state.openTips.has(t.id) ? "open" : ""}>
      <summary>${esc(t.title)}</summary>
      <div class="tip-body">${esc(t.body)}</div>
      <div class="tip-foot">${byline(t)}${actions("tips", t.id)}</div>
    </details>`).join("");
}

// ---------- 맛집·할거리 ----------
const votesOf = (p) => (Array.isArray(p.votes) ? p.votes : []);
// 여행 기간 중 토·일 날짜 (혼잡 안내용)
const weekendDays = () => tripDays().filter((d) => [0, 6].includes(parseYMD(d).getDay()));
// 이 장소가 이미 일정에 들어가 있는지 (제목이 같은 일정)
const scheduledOf = (p) => state.events.filter((e) => e.title === p.name).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

function placeChip(f, v, label, count) {
  const active = state.placeFilter[f] === v;
  return `<button class="fchip ${active ? "active" : ""}" type="button" aria-pressed="${active}"
    data-action="place-filter" data-f="${f}" data-v="${v}">${label}${count !== undefined ? ` <span>${count}</span>` : ""}</button>`;
}

function renderPlaces() {
  const el = $("#list-places");
  const filtersEl = $("#placeFilters");
  const alertEl = $("#placeAlert");
  if (!state.loaded.places) { filtersEl.innerHTML = ""; alertEl.innerHTML = ""; return (el.innerHTML = skeleton(3)); }
  if (state.placesDenied) { // 새 보안 규칙(places)을 아직 게시하지 않은 경우
    filtersEl.innerHTML = ""; alertEl.innerHTML = "";
    return (el.innerHTML = emptyBox("🔒", "맛집 탭 저장 권한이 아직 없어요",
      "Firebase 콘솔 → Firestore → 규칙에 최신 firestore.rules 전체를 붙여넣고 '게시'한 뒤 새로고침해 주세요."));
  }
  if (!state.places.length) {
    filtersEl.innerHTML = ""; alertEl.innerHTML = "";
    return (el.innerHTML = emptyBox("🍜", "아직 후보가 없어요",
      "와이탄·예원·신천지·디즈니 등 가족여행 인기 맛집·명소를 예약 정보와 함께 한 번에 넣을 수 있어요.",
      `<button class="btn btn-gold" type="button" data-action="seed" data-col="places">기본 맛집·할거리 넣기</button>`));
  }

  // 주말 혼잡 + 예약 필요 요약 (누르면 '예약 필요한 곳만' 켜짐)
  const must = state.places.filter((p) => p.reserve === "must").length;
  const rec = state.places.filter((p) => p.reserve === "recommended").length;
  const wk = weekendDays();
  alertEl.innerHTML = must + rec ? `<button class="place-alert" type="button" data-action="place-filter" data-f="reserveOnly" data-v="1">
      <b>🔴 예약 필수 ${must}곳 · 🟠 권장 ${rec}곳</b>
      <span>${wk.length ? `${wk.map(fmtMD).join("·")}은 인기 식당·명소가 붐벼요. 미리 예약해 두세요!` : "인기 장소는 미리 예약해 두세요!"}</span>
    </button>` : "";

  // 필터 칩: 지역(개수 표시) / 종류 / 예약 필요한 곳만
  const f = state.placeFilter;
  const countBy = (k, v) => state.places.filter((p) => (p[k] || "etc") === v).length;
  filtersEl.innerHTML = `
    <div class="fchips" role="group" aria-label="지역">${placeChip("district", "all", "전체", state.places.length)}${
      Object.entries(DISTRICTS).filter(([k]) => countBy("district", k) || f.district === k)
        .map(([k, d]) => placeChip("district", k, `${d.icon} ${d.label}`, countBy("district", k))).join("")}</div>
    <div class="fchips" role="group" aria-label="종류">${placeChip("kind", "all", "모든 종류")}${
      Object.entries(KINDS).map(([k, d]) => placeChip("kind", k, `${d.icon} ${d.label}`)).join("")}
      <button class="fchip fchip-toggle ${f.reserveOnly ? "active" : ""}" type="button" aria-pressed="${f.reserveOnly}"
        data-action="place-filter" data-f="reserveOnly" data-v="${f.reserveOnly ? "0" : "1"}">🔴 예약 필요한 곳만</button>
    </div>`;

  const list = state.places.filter((p) =>
    (f.district === "all" || (p.district || "etc") === f.district) &&
    (f.kind === "all" || (p.kind || "etc") === f.kind) &&
    (!f.reserveOnly || p.reserve === "must" || p.reserve === "recommended"));

  if (!list.length) {
    return (el.innerHTML = emptyBox("🔍", "조건에 맞는 곳이 없어요", "필터를 바꾸거나 ＋ 추가로 새 후보를 넣어 주세요.",
      `<button class="btn btn-ghost" type="button" data-action="place-filter" data-f="reset">필터 초기화</button>`));
  }

  // 정렬: ♥ 많은 순 → 예약 급한 순 → 먼저 등록한 순
  const sorted = [...list].sort((a, b) =>
    votesOf(b).length - votesOf(a).length ||
    (RESERVES[a.reserve]?.rank ?? 9) - (RESERVES[b.reserve]?.rank ?? 9) ||
    tsVal(a.createdAt) - tsVal(b.createdAt));

  // 지역별로 묶어서 표시 (DISTRICTS 순서)
  el.innerHTML = Object.entries(DISTRICTS).map(([dk, d]) => {
    const group = sorted.filter((p) => (DISTRICTS[p.district] ? p.district : "etc") === dk);
    if (!group.length) return "";
    return `<section class="place-group">
      <h3 class="place-group-title">${d.icon} ${d.label} <span>${group.length}</span></h3>
      <div class="stack">${group.map(placeCard).join("")}</div>
    </section>`;
  }).join("");
}

function placeCard(p) {
  const kind = KINDS[p.kind] || KINDS.etc;
  const rsv = RESERVES[p.reserve] || RESERVES.none;
  const votes = votesOf(p);
  const mine = votes.includes(me());
  const sched = scheduledOf(p);
  return `<article class="card place-card rsv-${esc(p.reserve || "none")}">
    <div class="card-head">
      <span class="cat-chip">${kind.icon} ${kind.label}</span>
      <span class="badge rsv-badge rsv-${esc(p.reserve || "none")}">${rsv.icon} ${rsv.label}</span>
      ${sched.length ? `<span class="badge badge-ok">📅 ${sched.map((e) => fmtMD(e.date)).join(", ")}</span>` : ""}
      ${sampleBadge(p)}
      ${actions("places", p.id)}
    </div>
    <h3 class="card-title">${esc(p.name)}</h3>
    ${p.nameZh ? `<p class="name-zh" lang="zh-CN">${esc(p.nameZh)}</p>` : ""}
    ${mapLink(p.nameZh || p.name)}
    ${metaList([["예약 방법", p.reserveHow], ["가격", p.priceNote], ["정보 확인", p.checkedAt ? fmtFull(p.checkedAt) : ""]])}
    ${memo(p.memo)}
    <div class="place-foot">
      <button class="vote-btn ${mine ? "on" : ""}" type="button" data-action="vote" data-id="${esc(p.id)}" aria-pressed="${mine}"
        aria-label="가고 싶어요 ${votes.length}명">${mine ? "♥" : "♡"} <b>${votes.length}</b></button>
      <span class="voters">${votes.length ? esc(votes.join(", ")) : "가고 싶으면 ♥"}</span>
      <button class="btn btn-sched" type="button" data-action="to-schedule" data-id="${esc(p.id)}">📅 일정에 추가</button>
    </div>
    ${byline(p)}
  </article>`;
}

function renderSampleButton() {
  const hasSample = COLS.some((c) => state[c].some((x) => x.sample));
  $("#clearSampleBtn").hidden = !hasSample;
}

const RENDER = {
  flights: renderFlights,
  hotels: renderHotels,
  events: () => { renderSchedule(); renderBudget(); renderPlaces(); }, // 맛집 카드의 '📅 일정에 있음' 표시도 갱신
  checklist: renderChecklist,
  tips: renderTips,
  places: renderPlaces,
};
function renderAll() {
  renderHeader();
  COLS.forEach((c) => RENDER[c]());
  renderSampleButton();
}

// ---------- 상단 상태 표시 / 배너 ----------
function setSync(text) { $("#syncChip").textContent = text; }
function showBanner(type, html) {
  const b = $("#banner");
  b.className = `banner ${type}`;
  b.innerHTML = html;
  b.hidden = false;
}

/* =====================================================================
 * 5. 추가 / 수정 / 삭제
 * ===================================================================== */
let formCtx = null; // { col, id }

function fieldHTML(f, v) {
  const id = `f_${f.k}`;
  const attrs = [
    `id="${id}"`, `name="${f.k}"`,
    f.required ? "required" : "",
    f.max && f.type !== "number" ? `maxlength="${f.max}"` : "",
    f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "",
  ].join(" ");
  const cls = `field ${f.half ? "half" : ""}`;

  if (f.type === "checkbox") {
    return `<label class="${cls} field-check"><input type="checkbox" ${attrs} ${v ? "checked" : ""} /><span>${esc(f.label)}</span></label>`;
  }
  let input;
  if (f.type === "select") {
    input = `<select ${attrs}>${f.options.map(([val, lab]) => `<option value="${val}" ${val === v ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") {
    input = `<textarea ${attrs} rows="${f.rows || 3}">${esc(v ?? "")}</textarea>`;
  } else if (f.type === "number") {
    input = `<input type="number" inputmode="decimal" min="0" max="${f.max}" step="any" ${attrs} value="${esc(v ?? "")}" />`;
  } else {
    input = `<input type="${f.type || "text"}" ${attrs} value="${esc(v ?? "")}" />`;
  }
  return `<div class="${cls}"><label for="${id}">${esc(f.label)}${f.required ? " <em>*</em>" : ""}</label>${input}</div>`;
}

function openForm(col, id = null) {
  const schema = SCHEMAS[col];
  const item = id ? state[col].find((x) => x.id === id) : null;
  if (id && !item) return toast("항목을 찾을 수 없어요 (다른 가족이 삭제했을 수 있어요)");
  const values = item || (schema.defaults ? schema.defaults() : {});
  $("#formTitle").textContent = `${schema.title} ${id ? "수정" : "추가"}`;
  $("#formFields").innerHTML = schema.fields.map((f) => fieldHTML(f, values[f.k])).join("") +
    (schema.hint ? `<p class="field muted small" style="margin:0">${schema.hint}</p>` : "");
  formCtx = { col, id };
  $("#entryForm [type=submit]").textContent = "저장";
  $("#formDialog").showModal();
  $("#formFields").scrollTop = 0;
}

// 폼 값 읽기 + 간단한 검증 (필수값 누락 시 null)
function collectForm(col, fields = SCHEMAS[col].fields) {
  const form = $("#entryForm");
  const out = {};
  let firstInvalid = null;
  for (const f of fields) {
    const el = form.elements.namedItem(f.k);
    el.classList.remove("invalid");
    if (f.type === "checkbox") { out[f.k] = el.checked; continue; }
    if (f.type === "number") {
      const n = parseFloat(el.value);
      if (Number.isFinite(n)) out[f.k] = Math.min(Math.max(n, 0), f.max);
      continue;
    }
    const val = el.value.trim().slice(0, f.max || 1000);
    if (f.required && !val) { el.classList.add("invalid"); firstInvalid ||= el; }
    out[f.k] = val;
  }
  if (firstInvalid) { firstInvalid.focus(); toast("필수 항목(*)을 입력해 주세요"); return null; }
  return out;
}

// 저장: 새 항목은 작성자 기록, 수정은 원래 작성자 유지 + 수정자 기록
function saveEntry(col, id, data) {
  const now = backend.now();
  let job;
  if (id) {
    const old = state[col].find((x) => x.id === id) || {};
    const keep = {};
    if (old.order !== undefined) keep.order = old.order;           // 체크리스트·팁 순서 유지
    if (old.done !== undefined && col === "checklist") keep.done = old.done;
    if (col === "places") keep.votes = votesOf(old);                 // ♥ 투표 유지
    // sample 플래그는 일부러 빼서, 수정한 샘플은 "진짜 일정"이 되게 함
    job = backend.set(col, id, {
      ...keep, ...data,
      author: old.author || me(),
      createdAt: old.createdAt || now,
      updatedBy: me(), updatedAt: now,
    });
  } else {
    const extra = {};
    if (col === "checklist" || col === "tips") {
      extra.order = Math.max(0, ...state[col].map((x) => x.order ?? 0)) + 1;
    }
    if (col === "checklist") extra.done = false;
    if (col === "places") extra.votes = [];
    job = backend.add(col, { ...data, ...extra, author: me(), updatedBy: me(), createdAt: now, updatedAt: now });
  }
  // 오프라인이면 서버 응답을 기다리지 않음 (로컬 캐시에 먼저 반영되고 나중에 자동 전송)
  job.catch(onWriteError);
}

/* ---------- 맛집·할거리 → 📅 일정에 추가 ----------
 *  1) 카드의 '📅 일정에 추가' → 날짜·시간만 고르는 작은 모달 (#formDialog 재사용)
 *  2) 확인 → events 컬렉션에 새 일정 1개 생성 (saveEntry 그대로 사용 → 작성자·시각 자동 기록)
 *  3) 토스트의 '일정 보기'로 해당 날짜 탭으로 바로 이동 */
function scheduleFields() {
  const days = tripDays();
  return [
    { k: "date", label: "날짜", type: "select", required: true,
      options: days.map((d, i) => [d, `Day ${i + 1} · ${fmtMD(d)}`]) },
    { k: "time", label: "시간 (몰라도 비워 둬도 돼요)", type: "time" },
  ];
}

function openScheduleForm(placeId) {
  const p = state.places.find((x) => x.id === placeId);
  if (!p) return toast("항목을 찾을 수 없어요 (다른 가족이 삭제했을 수 있어요)");
  const days = tripDays();
  // 기본 날짜 = 일정 탭에서 보고 있던 Day (여행 기간 밖이면 첫날)
  const def = days.includes(state.day) ? state.day : days[0];
  const fields = scheduleFields();
  const kind = KINDS[p.kind] || KINDS.etc;
  const rsv = RESERVES[p.reserve] || RESERVES.none;
  const already = scheduledOf(p);

  $("#formTitle").textContent = "📅 일정에 추가";
  $("#formFields").innerHTML = `
    <div class="field sched-target">
      <b>${kind.icon} ${esc(p.name)}</b>
      <span class="muted small">${esc(p.nameZh || "")}${p.nameZh ? " · " : ""}${rsv.icon} ${rsv.label}${p.reserveHow ? ` · ${esc(p.reserveHow)}` : ""}</span>
    </div>
    ${fieldHTML(fields[0], def)}
    ${fieldHTML(fields[1], "")}
    <p id="schedHint" class="field sched-hint" hidden></p>
    ${already.length ? `<p class="field muted small" style="margin:0">ℹ️ 이미 일정에 있어요: ${already.map((e) => `${fmtMD(e.date)}${e.time ? ` ${esc(e.time)}` : ""}`).join(", ")}</p>` : ""}
    <p class="field muted small" style="margin:0">일정 탭에 '${esc(CATEGORIES[KIND_TO_CAT[p.kind] || "etc"].label)}' 카테고리로 들어가고, 메모에 예약 방법이 적혀요.</p>`;
  formCtx = { col: "events", id: null, placeId, fields };
  $("#entryForm [type=submit]").textContent = "📅 일정에 넣기";
  updateScheduleHint();
  $("#formDialog").showModal();
  $("#formFields").scrollTop = 0;
}

// 고른 날짜에 맞춘 주의 문구 (주말 혼잡 / 출발·귀국일 / 메모에 적힌 휴무 요일)
function updateScheduleHint() {
  const hint = $("#schedHint");
  const p = state.places.find((x) => x.id === formCtx?.placeId);
  const date = $("#f_date")?.value;
  if (!hint || !p || !date) return;
  const dow = parseYMD(date).getDay();
  const msgs = [];
  if (date === C.START_DATE) msgs.push("🛫 출발일이에요. 현지 도착 전이라 실제로 갈 수 있는지 확인해 주세요.");
  if (date === C.END_DATE) msgs.push("🛬 귀국일이에요. 비행기 시간 전 오전에만 가능해요.");
  if ((dow === 0 || dow === 6) && (p.reserve === "must" || p.reserve === "recommended")) {
    msgs.push("⚠️ 주말이라 붐벼요. 일정에 넣은 뒤 예약을 꼭 해 두세요!");
  } else if (p.reserve === "must") {
    msgs.push("🔴 예약 필수 장소예요. 일정에 넣은 뒤 예약을 꼭 해 두세요!");
  }
  if ((p.memo || "").includes(`${WEEK[dow]}요일 휴무`)) msgs.push(`🚫 메모에 '${WEEK[dow]}요일 휴무'라고 적혀 있어요. 다른 날을 골라 주세요.`);
  hint.innerHTML = msgs.map(esc).join("<br>");
  hint.hidden = !msgs.length;
}

function addPlaceToSchedule(placeId, { date, time }) {
  const p = state.places.find((x) => x.id === placeId);
  if (!p) return toast("항목을 찾을 수 없어요 (다른 가족이 삭제했을 수 있어요)");
  // events 규칙(validEvent) 필드만 사용: date, time, title, place, category, reserved, memo
  const data = {
    date,
    time: time || "",
    title: String(p.name).slice(0, 100),
    place: String(p.nameZh || p.name).slice(0, 100),
    category: KIND_TO_CAT[p.kind] || "etc",
    reserved: false,
    memo: p.reserveHow ? `예약: ${p.reserveHow}`.slice(0, 500) : "",
  };
  saveEntry("events", null, data);
  state.day = date;
  ls.set(LS_KEY.day, date);
  toast(`📅 ${fmtMD(date)} 일정에 넣었어요`, {
    action: "일정 보기",
    duration: 5000,
    onAction: () => {
      setTab("plan");
      renderSchedule(true);
      $("#sec-schedule").scrollIntoView({ block: "start" });
    },
  });
}

function onWriteError(err) {
  console.error(err);
  const msg = err?.code === "permission-denied"
    ? "저장 거부됨: 입력값이 너무 길거나 보안 규칙 설정을 확인해 주세요"
    : `저장 실패: ${err?.message || err}`;
  toast(msg, { duration: 5000 });
}

const labelOf = (item) => item.title || item.name || item.text || [item.airline, item.flightNo].filter(Boolean).join(" ") || "항목";

async function removeEntry(col, id) {
  const item = state[col].find((x) => x.id === id);
  if (!item) return;
  const ok = await confirmBox(`"${labelOf(item)}"\n이 항목을 삭제할까요?`);
  if (!ok) return;
  backend.remove(col, id).catch(onWriteError);
  // 5초 동안 되돌리기 가능: 같은 ID로 원래 데이터를 다시 써 넣음
  const { id: _omit, ...data } = item;
  toast("삭제했어요", {
    action: "되돌리기",
    duration: 5000,
    onAction: () => { backend.set(col, id, data).then(() => toast("되돌렸어요 👍")).catch(onWriteError); },
  });
}

// 확인창 (Promise로 true/false 반환)
function confirmBox(message, okLabel = "삭제") {
  return new Promise((resolve) => {
    const d = $("#confirmDialog");
    $("#confirmMsg").textContent = message;
    $("#confirmOk").textContent = okLabel;
    d.returnValue = "";
    d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
    d.showModal();
  });
}

// 토스트 (옵션: 액션 버튼 + 남은 시간 막대)
let toastTimer = null;
function toast(message, { action, onAction, duration = 2200 } = {}) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(message)}</span>` +
    (action ? `<button class="toast-btn" type="button">${esc(action)}</button><i class="toast-bar"></i>` : "");
  t.style.setProperty("--dur", `${duration}ms`);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), duration);
  if (action) {
    t.querySelector(".toast-btn").addEventListener("click", () => {
      clearTimeout(toastTimer);
      t.classList.remove("show");
      onAction?.();
    }, { once: true });
  }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("복사했어요 📋"); }
  catch { toast(text, { duration: 4000 }); } // 복사가 안 되는 환경이면 크게 보여주기
}

/* =====================================================================
 * 6. 샘플 데이터 (3박 4일, START_DATE 기준으로 날짜 자동 배치)
 *    ※ 항공편명·가격은 예시입니다. 실제 예약 정보로 바꿔 주세요.
 * ===================================================================== */
function sampleData() {
  const d = (n) => addDays(C.START_DATE, n);
  const ev = (day, time, category, title, place, cost, reserved, memoText = "") =>
    ["events", { date: d(day), time, category, title, place, ...(cost ? { cost } : {}), reserved, memo: memoText }];

  return [
    ["flights", { direction: "out", airline: "대한항공", flightNo: "KE893", depAirport: "인천(ICN)", depDate: d(0), depTime: "08:30",
      arrAirport: "상하이 푸동(PVG)", arrDate: d(0), arrTime: "09:35", bookingRef: "ABC123", seat: "32A~D", memo: "(예시) 출발 2시간 30분 전 공항 도착. 온라인 체크인 미리 하기" }],
    ["flights", { direction: "back", airline: "대한항공", flightNo: "KE894", depAirport: "상하이 푸동(PVG)", depDate: d(3), depTime: "15:40",
      arrAirport: "인천(ICN)", arrDate: d(3), arrTime: "18:35", bookingRef: "ABC123", seat: "35A~D", memo: "(예시) 면세 쇼핑은 출국 심사 후" }],

    ["hotels", { name: "(예시) 와이탄 인근 호텔", address: "上海市黄浦区南京东路", checkInDate: d(0), checkInTime: "15:00",
      checkOutDate: d(3), checkOutTime: "12:00", bookingRef: "HTL-778899", phone: "+86-21-0000-0000", memo: "4인 패밀리룸 · 조식 포함\n택시 탈 때 중국어 주소 보여주기" }],

    // Day 1 — 도착 · 와이탄
    ev(0, "09:35", "move", "푸동공항 도착 · 입국심사", "上海浦东国际机场", 0, false, "입국심사 후 유심/eSIM 연결 확인"),
    ev(0, "11:00", "move", "자기부상열차 → 지하철로 호텔 이동", "龙阳路站", 200, false, "짐 많으면 디디(DiDi) 택시"),
    ev(0, "12:30", "food", "샤오롱바오 점심", "南翔馒头店", 260, false),
    ev(0, "15:00", "rest", "호텔 체크인 · 휴식", "上海市黄浦区南京东路", 0, true),
    ev(0, "17:00", "shop", "난징동루 보행가 구경", "南京东路步行街", 300, false),
    ev(0, "19:00", "sight", "와이탄 야경 산책", "外滩", 0, false, "강 건너 푸동 스카이라인 사진 포인트"),
    ev(0, "20:30", "food", "상하이 가정식 저녁", "外滩", 450, false),

    // Day 2 — 예원 · 신톈디 · 푸동 야경
    ev(1, "09:30", "sight", "예원(위위안) 정원", "豫园", 160, false, "오전에 가야 덜 붐벼요"),
    ev(1, "11:30", "shop", "예원 상가 · 기념품", "豫园商城", 300, false),
    ev(1, "12:30", "food", "딤섬 점심", "豫园", 320, false),
    ev(1, "15:00", "sight", "신톈디 카페 거리", "新天地", 200, false),
    ev(1, "18:00", "sight", "상하이타워 전망대", "上海中心大厦", 720, true, "해 질 무렵 입장 추천"),
    ev(1, "19:30", "sight", "황푸강 유람선 · 푸동 야경", "黄浦江游船", 480, true),
    ev(1, "21:00", "food", "야식 · 훠궈", "陆家嘴", 500, false),

    // Day 3 — 디즈니랜드
    ev(2, "08:00", "move", "지하철 11호선으로 디즈니 이동", "上海迪士尼站", 40, false),
    ev(2, "09:00", "sight", "상하이 디즈니랜드", "上海迪士尼乐园", 2800, true, "공식 앱으로 대기시간 확인 · 프리미어 액세스 고려"),
    ev(2, "13:00", "food", "파크 내 점심", "上海迪士尼乐园", 400, false),
    ev(2, "20:30", "sight", "성 불꽃놀이 쇼", "上海迪士尼乐园", 0, false, "30분 전부터 자리 잡기"),
    ev(2, "22:00", "move", "호텔 복귀 (택시)", "上海市黄浦区南京东路", 150, false),

    // Day 4 — 마지막 쇼핑 · 귀국
    ev(3, "08:30", "food", "호텔 조식", "", 0, true),
    ev(3, "10:00", "rest", "체크아웃 · 짐 맡기기", "上海市黄浦区南京东路", 0, false),
    ev(3, "10:30", "shop", "톈쯔팡 골목 구경", "田子坊", 250, false),
    ev(3, "12:30", "move", "푸동공항으로 이동", "上海浦东国际机场", 200, false, "출발 3시간 전 도착 목표"),

    ...DEFAULT_CHECKLIST.map((text, i) => ["checklist", { text, done: false, order: i + 1 }]),
    ...DEFAULT_TIPS.map(([title, body], i) => ["tips", { title, body, order: i + 1 }]),
  ];
}

const DEFAULT_CHECKLIST = [
  "여권 (유효기간 6개월 이상 남았는지)",
  "비자/입국 서류 확인 (무비자 조건·입국카드)",
  "환전 (소액 현금 위안화)",
  "알리페이/위챗페이 + 해외결제 카드 연결",
  "eSIM / 로밍 신청",
  "멀티 어댑터 (중국 220V)",
  "보조배터리 (기내 반입만 가능)",
  "상비약 (소화제·해열제·밴드)",
  "여행자 보험",
  "디디(DiDi)·고덕지도 앱 설치",
  "따종디엔핑 앱 설치·가입(식당 예약)",
  "상하이 디즈니 공식 앱 · 티켓",
];

// 고정 팁 (수정 가능). 정책·요금은 바뀔 수 있으니 출발 전 꼭 다시 확인!
const DEFAULT_TIPS = [
  ["💱 환율 & 환전",
    "1위안(CNY) ≈ 190~200원 안팎 (수시로 변동).\n예산 섹션의 환율 입력칸을 고치면 가족 모두의 화면에 반영돼요.\n\n현지는 대부분 모바일 결제라 현금은 소액만 준비해도 충분해요. 작은 가게·택시 비상용으로 몇백 위안 정도."],
  ["📱 알리페이 / 위챗페이",
    "• 알리페이 앱 설치 → 해외 발급 비자/마스터 카드 등록 → 여권으로 본인 인증\n• 위챗페이도 해외 카드 연결 가능\n• 일정 금액 이상 결제 시 수수료가 붙을 수 있어요\n• 한국 출발 전에 설치·인증까지 끝내 두기 (현지에서 인증 문자 받기 어려울 수 있음)\n• 지하철은 알리페이 안의 교통 QR코드로 탈 수 있어요"],
  ["🌐 와이파이 / VPN",
    "중국에서는 구글·유튜브·인스타그램 등이 차단되고, 카카오톡도 불안정할 수 있어요.\n\n• 한국 통신사 로밍이나 해외 eSIM은 대부분 차단 없이 접속돼요 (추천)\n• 호텔·카페 와이파이에서는 VPN이 필요할 수 있어요\n• ⚠️ 이 일정 사이트도 구글(Firebase) 서버를 써요. 출국 전 한 번 열어 두면 마지막 내용이 휴대폰에 저장돼 오프라인에서도 보여요"],
  ["✈️ 푸동공항(PVG) → 시내",
    "① 자기부상열차(Maglev): 룽양루역까지 약 8분 → 지하철 2·7호선 환승\n② 지하철 2호선: 환승 없이 시내까지, 저렴하지만 1시간 이상\n③ 택시/디디: 와이탄까지 약 1시간, 요금은 교통 상황 따라 다름\n\n아이·짐이 많으면 택시가 제일 편해요. 공항 공식 택시 승강장 이용!"],
  ["🚄 훙차오공항(SHA) → 시내",
    "지하철 2·10호선이 공항과 바로 연결돼요. 인민광장·난징동루까지 30~40분.\n택시도 푸동공항보다 훨씬 가깝고 저렴해요."],
  ["🚕 교통 앱 · 지도",
    "• 디디(DiDi): 한국어/영어 지원, 해외 카드·알리페이 결제 가능\n• 지도: 고덕지도(Amap)가 가장 정확. 구글맵은 VPN이 필요하고 위치가 어긋날 수 있어요\n• 장소는 중국어 지명(예: 外滩, 豫园)으로 검색하면 정확해요"],
  ["🍽️ 식당 예약·웨이팅 요령",
    "• 따종디엔핑(大众点评) 앱에서 식당 페이지에 '订座(예약)' 버튼이 있는 곳만 예약할 수 있어요\n• 예약(订座)과 웨이팅(排队·원격 줄서기)은 달라요. 예약이 안 되는 곳은 현장 번호표나 앱 원격 대기를 써야 해요\n• 관광객이 많은 와이탄·난징동루·신천지 지점이 특히 붐벼요 (토·일 점심·저녁 피크)\n• 같은 체인이라도 교외·2선 상권 지점은 비교적 한산해요\n• 식사 시간을 30분~1시간 앞당기거나 늦추면 대기가 확 줄어요"],
  ["🆘 긴급 연락처",
    "• 중국 경찰 110 / 구급 120 / 화재 119\n• 외교부 영사콜센터(24시간): +82-2-3210-0404\n• 주상하이 대한민국 총영사관 연락처는 영사콜센터나 외교부 홈페이지에서 확인"],
];

async function loadSample() {
  const ok = await confirmBox("3박 4일 샘플 일정(항공·숙소·일정·준비물·팁)을 추가할까요?\n기존 데이터는 그대로 유지돼요.", "불러오기");
  if (!ok) return;
  const now = backend.now();
  const items = sampleData()
    // 준비물·팁이 이미 있으면 중복으로 넣지 않음
    .filter(([col]) => !((col === "checklist" || col === "tips") && state[col].length))
    .map(([col, data]) => [col, { ...data, sample: true, author: me(), updatedBy: me(), createdAt: now, updatedAt: now }]);
  backend.addMany(items).catch(onWriteError);
  toast("샘플 데이터를 불러왔어요 🧧");
  state.day = C.START_DATE;
  ls.set(LS_KEY.day, state.day);
}

async function clearSample() {
  const items = COLS.flatMap((col) => state[col].filter((x) => x.sample).map((x) => [col, x.id]));
  if (!items.length) return;
  const ok = await confirmBox(`샘플 항목 ${items.length}개를 삭제할까요?\n직접 추가·수정한 항목은 지워지지 않아요.`);
  if (!ok) return;
  backend.removeMany(items).catch(onWriteError);
  toast("샘플을 지웠어요");
}

/*
 * 기본 맛집·할거리 (빈 '맛집·할거리' 탭의 시드 버튼용)
 *  - 2026-11 웹 검색으로 재확인했지만, 영업시간·가격·예약 방식은 자주 바뀌니 출발 전 재확인 필요
 *  - 확실하지 않은 정보는 비워 두거나 "확인 필요"로 표시 (지어내지 않음)
 *  - 여행 일정: 11/20(금) 오후 ~ 11/23(월) 오전이 현지 일정. 토·일(11/21~22)이 가장 붐빔
 *  형식: [district, kind, reserve, name, nameZh, reserveHow, priceNote, memo]
 */
const PLACE_SEED = [
  // 와이탄·난징동루
  ["wai", "sight", "none", "와이탄 야경", "外滩", "", "무료",
    "해 진 뒤 푸동 스카이라인 야경이 하이라이트. 토·일 저녁엔 인파가 많아 소지품·아이 손 주의."],
  ["wai", "shop", "none", "난징동루 보행가", "南京东路步行街", "", "구경 무료",
    "와이탄과 걸어서 이어져요. 주말 저녁엔 매우 붐비니 와이탄 야경과 한 동선으로 묶기."],
  ["wai", "food", "queue", "라오라오 가정식 (동파육·홍사오로우)", "上海姥姥家常饭馆", "현장 대기", "확인 필요",
    "상하이 가정식. 지점 위치·영업시간은 따종디엔핑에서 확인 필요. 토·일 식사 피크엔 대기가 길 수 있어요."],
  ["wai", "food", "recommended", "하이디라오 와이탄점", "海底捞火锅(外滩店)", "따종디엔핑 예약·원격 대기", "확인 필요",
    "관광객 많은 지점이라 토·일 저녁 대기가 길어요. 미리 예약하거나 앱으로 원격 번호표 받기."],
  ["wai", "food", "queue", "대호춘 생지엔 (군만두)", "大壶春", "현장 대기 (좌석 적음)", "확인 필요",
    "바닥이 바삭한 생지엔(生煎). 미쉐린 가이드 기준 四川中路136号·08:00~21:00 (재확인 필요). 아침·간식으로 좋아요."],

  // 예원·청황묘
  ["yuyuan", "sight", "recommended", "예원", "豫园", "예약 필요 여부는 공식 안내 확인 필요", "9~11월 성인 40위안 (확인 필요)",
    "09:00~16:30 (마지막 입장 16:00), 월요일 휴무(공휴일 제외). ⚠️ 11/23(월) 귀국일은 휴무라 못 가요 → 토·일 오전 일찍 추천."],
  ["yuyuan", "food", "queue", "남상만두점 (탕바오)", "南翔馒头店", "현장 대기", "확인 필요",
    "샤오롱바오·탕바오 원조로 유명. 예원 안이라 토·일은 줄이 길어요. 예원 관람 전 이른 시간 추천."],
  ["yuyuan", "shop", "none", "예원 상가", "豫园商城", "", "",
    "기념품·간식 거리. 토·일엔 매우 붐벼요. 예원 정원 월요일 휴무와 별개로 상가 영업 여부는 확인 필요."],

  // 신천지·우캉루·푸시
  ["xintiandi", "food", "must", "예상하이 (북경오리)", "夜上海", "따종디엔핑 订座 (당일 예약 가능 사례 있음)", "확인 필요",
    "주말 저녁엔 예약 없이 가면 대기가 길어요. 매장 이전 정보가 있어(湖滨路 쪽) 주소를 따종디엔핑에서 꼭 확인."],
  ["xintiandi", "sight", "none", "우캉맨션·우캉루·안푸루 산책", "武康大楼", "", "무료",
    "토·일 오후엔 사진 찍는 인파로 혼잡 → 오전 추천. 우캉루~안푸루(安福路) 따라 카페 구경."],
  ["xintiandi", "cafe", "none", "신천지 카페 거리", "新天地", "", "",
    "카페·레스토랑 밀집 지역. 주말 저녁엔 붐벼요. 예상하이와 묶어서 동선 짜기 좋아요."],

  // 루자쭈이·푸동
  ["lujiazui", "sight", "recommended", "상하이타워 전망대", "上海中心大厦", "공식 채널·Trip.com 사전 예매", "성인 약 180위안 (확인 필요)",
    "118층 전망대. 해 질 무렵이 인기라 토·일엔 사전 예매 권장. 운영 시간은 출처마다 달라 공식 안내 확인 필요."],
  ["lujiazui", "sight", "recommended", "황푸강 유람선", "黄浦江游船", "Trip.com 등 사전 예약 (취소 가능 상품 확인)", "상품·시간대별로 다름 (확인 필요)",
    "야간 운항이 인기. 상품마다 탑승 부두(十六铺 등)가 다르고 여권이 필요한 경우가 많아요. 토·일 저녁 표가 먼저 매진돼요."],

  // 디즈니
  ["disney", "sight", "must", "상하이 디즈니랜드", "上海迪士尼乐园", "공식 앱·공식 웹사이트에서 티켓 사전 구매", "날짜별 변동가 (확인 필요)",
    "하루 통째로 필요해요. 토·일은 가격·인파 모두 높아요. 날짜 지정 티켓이라 일정 확정 후 구매, 공식 앱으로 대기시간 확인."],
];

// 빈 섹션에서 "기본 준비물/팁/맛집 넣기"
function seedSection(col) {
  if (state[col].length) return toast("이미 항목이 있어서 넣지 않았어요"); // 두 번 눌러 중복되는 것 방지
  const now = backend.now();
  const today = todayYMD(); // 맛집 정보 확인일 = 넣은 날
  const src = col === "checklist"
    ? DEFAULT_CHECKLIST.map((text, i) => ({ text, done: false, order: i + 1 }))
    : col === "places"
      ? PLACE_SEED.map(([district, kind, reserve, name, nameZh, reserveHow, priceNote, memoText]) =>
        ({ name, nameZh, district, kind, reserve, reserveHow, priceNote, memo: memoText, votes: [], checkedAt: today }))
      : DEFAULT_TIPS.map(([title, body], i) => ({ title, body, order: i + 1 }));
  backend.addMany(src.map((d) => [col, { ...d, author: me(), updatedBy: me(), createdAt: now, updatedAt: now }])).catch(onWriteError);
  toast("기본 항목을 넣었어요");
}

/* =====================================================================
 * 7. 이벤트 연결 & 시작
 * ===================================================================== */

// 클릭은 문서 전체에서 한 번에 처리 (data-action 속성 기준)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, col, id } = btn.dataset;
  const needsBackend = ["add", "edit", "delete", "sample", "clear-sample", "seed", "vote", "to-schedule"];
  if (needsBackend.includes(action) && !backend) return toast("연결 중이에요. 잠시만요…");

  switch (action) {
    case "add": openForm(col); break;
    case "edit": openForm(col, id); break;
    case "delete": removeEntry(col, id); break;
    case "day":
      state.day = btn.dataset.day;
      ls.set(LS_KEY.day, state.day);
      renderSchedule(true);
      break;
    case "sample": loadSample(); break;
    case "clear-sample": clearSample(); break;
    case "seed": seedSection(col); break;
    case "copy": copyText(btn.dataset.text); break;
    case "check-page":
      goCheckPage(btn.dataset.page !== undefined ? Number(btn.dataset.page) : state.checkPage + Number(btn.dataset.dir));
      break;
    case "rename": askName(true); break;
    case "theme": cycleTheme(); break;
    case "close-form": $("#formDialog").close(); break;
    case "tab": setTab(btn.dataset.tab); break;
    case "vote": toggleVote(id); break;
    case "to-schedule": openScheduleForm(id); break;
    case "place-filter": {
      const { f, v } = btn.dataset;
      if (f === "reset") state.placeFilter = { district: "all", kind: "all", reserveOnly: false };
      else if (f === "reserveOnly") state.placeFilter.reserveOnly = v === "1";
      else state.placeFilter[f] = v;
      renderPlaces();
      break;
    }
  }
});

// ♥ 투표: 내 이름을 votes 배열에 넣었다 뺐다
function toggleVote(id) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  const on = !votesOf(p).includes(me());
  if (on && votesOf(p).length >= MAX_VOTES) return toast(`투표는 ${MAX_VOTES}명까지만 돼요`);
  backend.listToggle("places", id, "votes", me(), on).catch(onWriteError);
  if (on) toast("♥ 가고 싶어요!");
}

// 일정에 추가 모달: 날짜 바꾸면 주의 문구 갱신
document.addEventListener("change", (e) => {
  if (e.target.id === "f_date" && formCtx?.placeId) updateScheduleHint();
});

/* ---------- 화면 탭 (일정 / 맛집·할거리) ----------
 *  - 같은 페이지에서 보이기/숨기기만 바꿈 (헤더·모달·토스트는 공유)
 *  - 고른 탭은 localStorage에 기억, 주소 끝 #places 로도 바로 열 수 있음 */
const TABS = ["plan", "places"];
function setTab(tab, { keepHash = false } = {}) {
  if (!TABS.includes(tab)) tab = "plan";
  const changed = state.tab !== tab;
  state.tab = tab;
  ls.set(LS_KEY.tab, tab);
  $("#tab-plan").hidden = tab !== "plan";
  $("#tab-places").hidden = tab !== "places";
  $(".quicknav").hidden = tab !== "plan"; // 섹션 바로가기는 일정 탭에서만
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  // 주소창 해시: 맛집 탭이면 #places, 일정 탭이면 지움 (기록은 쌓지 않음)
  if (!keepHash) {
    const url = location.pathname + location.search + (tab === "places" ? "#places" : "");
    if (location.href.replace(location.origin, "") !== url) history.replaceState(null, "", url);
  }
  // 아래로 내려가 있었다면 탭 막대 바로 아래(새 탭의 맨 위)로 올려 줌
  if (changed) {
    const top = $(".hero").offsetHeight;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "auto" });
  }
}
const initialTab = () => (location.hash === "#places" ? "places" : location.hash.startsWith("#sec-") ? "plan" : ls.get(LS_KEY.tab) || "plan");
window.addEventListener("hashchange", () => {
  if (location.hash === "#places") setTab("places");
  else if (location.hash.startsWith("#sec-") && state.tab !== "plan") {
    setTab("plan", { keepHash: true });
    $(location.hash)?.scrollIntoView();
  }
});

// 체크리스트 체크 → 즉시 동기화
document.addEventListener("change", (e) => {
  const cb = e.target.closest('input[data-action="toggle"]');
  if (!cb || !backend) return;
  backend.update("checklist", cb.dataset.id, { done: cb.checked, updatedBy: me(), updatedAt: backend.now() }).catch(onWriteError);
});

// 펼친 팁 기억 (toggle 이벤트는 버블링이 안 돼서 capture 단계에서 받음)
document.addEventListener("toggle", (e) => {
  const id = e.target?.dataset?.tip;
  if (!id) return;
  e.target.open ? state.openTips.add(id) : state.openTips.delete(id);
}, true);

// 모달: 저장
$("#entryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!formCtx) return;
  // 맛집 → 일정에 추가 모달
  if (formCtx.placeId) {
    const picked = collectForm(formCtx.col, formCtx.fields);
    if (!picked) return;
    $("#formDialog").close();
    addPlaceToSchedule(formCtx.placeId, picked);
    formCtx = null;
    return;
  }
  const data = collectForm(formCtx.col);
  if (!data) return;
  saveEntry(formCtx.col, formCtx.id, data);
  $("#formDialog").close();
  toast(formCtx.id ? "수정했어요 ✏️" : "추가했어요 ✨");
  // 일정 추가 후 해당 날짜 탭으로 이동
  if (formCtx.col === "events" && data.date) { state.day = data.date; ls.set(LS_KEY.day, data.date); renderSchedule(true); }
});
// 모달 바깥(어두운 부분) 누르면 닫기
for (const d of [$("#formDialog"), $("#confirmDialog")]) {
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
}

// 환율 입력: 바로 화면 반영, 0.6초 뒤 저장(가족에게 동기화)
let rateTimer = null;
$("#rateInput").addEventListener("input", (e) => {
  const v = parseFloat(e.target.value);
  if (!Number.isFinite(v) || v <= 0 || v > 100000) return;
  state.settings.exchangeRate = v;
  renderBudget(); renderSchedule();
  clearTimeout(rateTimer);
  rateTimer = setTimeout(() => {
    backend?.saveSettings({ exchangeRate: v, updatedBy: me(), updatedAt: backend.now() }).catch(onWriteError);
  }, 600);
});

// 다른 앱 갔다 돌아오면 D-Day 갱신 (자정 넘김 대응)
document.addEventListener("visibilitychange", () => { if (!document.hidden && booted) renderHeader(); });
window.addEventListener("online", () => booted && backend?.mode === "firebase" && setSync("🟢 실시간 동기화"));
window.addEventListener("offline", () => booted && setSync("🟡 오프라인 · 저장된 내용 표시 중"));

// ---------- 화면 전환 ----------
function showScreen(name) {
  ["gate", "nameGate", "app"].forEach((id) => ($("#" + id).hidden = id !== name));
  window.scrollTo(0, 0);
}

// 폰(터치)에서는 자동 포커스를 하지 않음 → 화면이 열리자마자 키보드가 올라와 제목을 가리는 걸 방지
const focusIfDesktop = (el) => { if (matchMedia("(pointer: fine)").matches) el.focus(); };

// 가족 코드가 숫자로만 되어 있으면 폰에서 숫자 키패드가 뜨게
if (/^\d+$/.test(String(C.FAMILY_CODE))) $("#gateInput").setAttribute("inputmode", "numeric");

function askName(isRename = false) {
  $("#nameInput").value = isRename ? me() : "";
  $("#nameCancel").hidden = !isRename;
  showScreen("nameGate");
  focusIfDesktop($("#nameInput"));
}

$("#gateForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#gateInput");
  if (input.value.trim() === String(C.FAMILY_CODE)) {
    ls.set(LS_KEY.code, String(C.FAMILY_CODE));
    start();
  } else {
    $("#gateError").hidden = false;
    const card = $("#gateForm");
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    input.select();
  }
});

$("#nameForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#nameInput").value.trim().slice(0, 20);
  if (!name) return;
  ls.set(LS_KEY.name, name);
  start();
});
$("#nameCancel").addEventListener("click", () => showScreen("app"));

function onListenError(err) {
  console.error(err);
  COLS.forEach((c) => (state.loaded[c] = true));
  renderAll();
  setSync("🔴 연결 오류");
  if (err?.code === "permission-denied") {
    showBanner("error", "🔒 <b>Firestore 권한 오류</b><br>보안 규칙이 게시되었는지, firestore.rules의 tripId와 firebase-config.js의 TRIP_ID가 같은지 확인해 주세요.");
  } else {
    showBanner("error", `⚠️ 데이터를 불러오지 못했어요: ${esc(err?.message || err)}`);
  }
}

// 맛집 탭만 권한 오류 = 새 규칙(places)을 아직 게시 안 한 경우 → 나머지 화면은 그대로 두고 맛집 탭에만 안내
function onPlacesError(err) {
  if (err?.code !== "permission-denied") return onListenError(err);
  console.error(err);
  state.loaded.places = true;
  state.placesDenied = true;
  renderPlaces();
}

/* ---------- 화면 테마: 자동(폰 설정 따라감) → 라이트 → 다크 순서로 바뀜 ---------- */
const THEME_KEY = "trip.theme"; // index.html 머리의 작은 스크립트와 같은 키
const THEMES = { auto: "🌓 자동", light: "☀️ 라이트", dark: "🌙 다크" };
const THEME_COLOR = { light: "#c8102e", dark: "#1a1214" };
function applyTheme(t) {
  const root = document.documentElement;
  if (t === "light" || t === "dark") root.dataset.theme = t;
  else { delete root.dataset.theme; t = "auto"; }
  // 폰 상단 상태바 색도 맞춰 줌 (자동이면 원래대로)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const own = (m.media || "").includes("dark") ? THEME_COLOR.dark : THEME_COLOR.light;
    m.content = t === "auto" ? own : THEME_COLOR[t];
  });
  const btn = $("#themeBtn");
  if (btn) { btn.textContent = THEMES[t]; btn.setAttribute("aria-label", `화면 테마: ${THEMES[t].slice(2).trim()} (눌러서 바꾸기)`); }
  return t;
}
function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const cur = document.documentElement.dataset.theme || "auto";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  applyTheme(next);
  ls.set(THEME_KEY, next);
  toast(`화면 테마: ${THEMES[next]}`);
}
applyTheme(ls.get(THEME_KEY));

async function boot() {
  showScreen("app");
  setTab(initialTab());
  renderAll();
  if (booted) return;
  booted = true;

  try {
    backend = await createBackend();
  } catch (err) {
    console.error(err);
    COLS.forEach((c) => (state.loaded[c] = true));
    renderAll();
    setSync("🔴 연결 실패");
    showBanner("error", "⚠️ <b>서버에 연결할 수 없어요.</b><br>인터넷 연결을 확인해 주세요. 중국 현지 와이파이라면 로밍/eSIM 데이터나 VPN을 켜고 새로고침해 주세요.");
    return;
  }

  if (backend.mode === "local") {
    setSync("🧪 체험 모드");
    showBanner("info", "🧪 <b>체험 모드</b> — firebase-config.js가 아직 설정되지 않아 <b>이 기기에만</b> 저장돼요. 가족과 공유하려면 README의 Firebase 설정을 따라 주세요.");
  } else {
    setSync("⏳ 동기화 중…");
  }

  for (const col of COLS) {
    backend.subscribe(col, (items, meta) => {
      state[col] = items;
      state.loaded[col] = true;
      RENDER[col]();
      renderSampleButton();
      if (col === "events" && backend.mode === "firebase") {
        setSync(meta.fromCache ? "🟡 오프라인 · 저장된 내용 표시 중" : "🟢 실시간 동기화");
      }
    }, col === "places" ? onPlacesError : onListenError);
  }
  backend.subscribeSettings((s) => {
    state.settings = s || {};
    renderBudget();
    renderSchedule();
  }, onListenError);
}

function start() {
  if (ls.get(LS_KEY.code) !== String(C.FAMILY_CODE)) {
    showScreen("gate");
    focusIfDesktop($("#gateInput"));
    return;
  }
  if (!ls.get(LS_KEY.name)) return askName(false);
  boot();
}

renderHeader();
start();
