// scripts/import-parks.mjs
//
// 행정안전부(국토교통부 소관) "전국도시공원정보표준데이터" 오픈API를 호출해서
// Supabase parks 테이블에 upsert하는 1회성(재실행 가능) 스크립트입니다.
//
// ⚠ 예전엔 CSV 수동 다운로드 방식이었는데, 정식 오픈API 활용신청이 승인되어
// 실시간 API 호출로 전환했습니다 — 사용자가 매번 CSV를 새로 받을 필요가 없습니다.
//
// ── API 정보 (2026.08.11 실제 호출 응답으로 재확인 — 아래 필드명이 실제 응답 기준입니다) ──
// 요청주소: https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api
// 응답 envelope: { header: { resultCode, resultMsg }, body: { items: { item: [...] }, totalCount } }
//   ※ 흔한 { response: { header, body } } 형태가 아니라 response 래핑 없이 최상위에 바로
//   header/body가 옵니다 — 예전 코드가 response.header/response.body를 읽어서 매번 빈
//   응답으로 취급되던 원인이었습니다(픽스 완료, pick() 헬퍼로 두 형태 다 대응).
// 응답 필드(camelCase — 문서상 표기와 달리 실제로는 이렇게 옵니다): manageNo(관리번호),
//   parkNm(공원명), parkSe(공원구분), rdnmadr(소재지도로명주소), lnmadr(소재지지번주소),
//   latitude(위도), longitude(경도), parkAr(공원면적), mvmFclty(운동시설),
//   amsmtFclty(유희시설), cnvnncFclty(편익시설), cltrFclty(교양시설), etcFclty(기타시설),
//   appnNtfcDate(지정고시일), institutionNm(관리기관명), phoneNumber(전화번호),
//   referenceDate(데이터기준일자), insttCode(제공기관코드), insttNm(제공기관기관명)
// ※ 화장실/개수대 여부 같은 정형 필드는 원본에 없습니다 — 5개 시설 필드는 지자체마다
//   입력 형태가 들쭉날쭉한 자유 텍스트라, facility_note 하나로 합쳐서 "메모"로만 저장합니다.
//
// ── 사용 전 준비 ──
// 1. Supabase SQL 편집기에서 scripts/sql/create-parks-table.sql을 먼저 실행하세요
//    (이미 실행했었더라도 facility_note 컬럼이 새로 추가됐으니 다시 한번 실행해주세요).
// 2. .env.local에 다음 값들이 채워져 있어야 합니다:
//    - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//    - PARK_OPEN_API_KEY  (data.go.kr에서 "전국도시공원정보표준데이터" 활용신청 승인 후
//      발급된 서비스키. Encoding/Decoding 어느 쪽을 붙여넣어도 자동으로 판별해서 처리합니다.)
//
// ── 실행 (반드시 프로젝트 루트에서, Node 20.6+ 권장) ──
//   node --env-file=.env.local scripts/import-parks.mjs
//
// source_key(관리번호 기준) upsert라서 여러 번 실행해도 중복 생성되지 않고, 최신 값으로
// 갱신됩니다 — 데이터가 매년 갱신되니 가끔 재실행하면 됩니다.

import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PARK_API_KEY = process.env.PARK_OPEN_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "환경변수가 부족합니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 .env.local에 채워주세요."
  );
  process.exit(1);
}
if (!PARK_API_KEY) {
  console.error(
    "PARK_OPEN_API_KEY 환경변수가 없습니다. data.go.kr에서 발급받은 서비스키를 .env.local에 추가해주세요."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// data.go.kr 인증키는 "Encoding"(이미 %인코딩된 값)과 "Decoding"(원문) 두 형태로 발급되는데,
// 어떤 걸 붙여넣었는지 자동 판별해서 항상 딱 한 번만 인코딩되도록 합니다
// (shelterNotices.ts의 encodeServiceKey와 동일한 로직).
function encodeServiceKey(key) {
  const looksAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(key);
  return looksAlreadyEncoded ? key : encodeURIComponent(key);
}

// 정부 OpenAPI 공통 응답 포맷: 결과가 1건이면 item이 배열이 아니라 객체 하나로 오는
// 경우가 흔해서(XML→JSON 변환 특성), 항상 배열로 정규화합니다.
function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

// ⚠ 실제로 호출해보니(2026.08.11) 이 API는 필드명을 camelCase(예: parkNm, latitude)로
// 내려줍니다 — 처음엔 문서를 보고 UPPER_SNAKE_CASE(PARK_NM, LATITUDE)로 짐작해서 썼는데,
// 실제 응답과 안 맞아서 매번 모든 필드가 undefined → 0건으로 필터링되는 문제가 있었습니다
// (API 자체는 정상 동작 중이었는데 필드명 불일치 때문에 조용히 다 걸러진 것). data.go.kr은
// API마다 필드명 표기가 제각각이라(camelCase/UPPER_SNAKE_CASE 혼재), 앞으로 또 바뀌어도
// 바로 죽지 않도록 두 표기를 모두 시도하는 헬퍼로 읽습니다.
function pick(item, ...keys) {
  for (const k of keys) {
    const v = item?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

const FACILITY_FIELDS = [
  ["mvmFclty", "MVM_FCLTY", "운동시설"],
  ["amsmtFclty", "AMSMT_FCLTY", "유희시설"],
  ["cnvnncFclty", "CNVNNC_FCLTY", "편익시설"],
  ["cltrFclty", "CLTR_FCLTY", "교양시설"],
  ["etcFclty", "ETC_FCLTY", "기타시설"],
];

function buildFacilityNote(item) {
  const parts = [];
  for (const [camelKey, upperKey, label] of FACILITY_FIELDS) {
    const value = pick(item, camelKey, upperKey).toString().trim();
    if (value) parts.push(`${label}: ${value}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(pageNo, numOfRows) {
  const qs = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    type: "json",
  });
  const url = `${API_BASE}?serviceKey=${encodeServiceKey(PARK_API_KEY)}&${qs.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    // ⚠ Node의 fetch(undici)는 네트워크 단계 오류(DNS 실패, 연결 거부, TLS 오류 등)를
    // 전부 "fetch failed"라는 같은 메시지로 뭉뚱그리고, 실제 원인은 e.cause에 담아둡니다.
    // e.cause를 안 찍으면 "fetch failed"만 보여서 DNS 문제인지/방화벽 차단인지/서버가
    // 아예 죽은 건지 구분이 안 됩니다 — 진짜 원인 코드(예: ENOTFOUND, ECONNREFUSED,
    // CERT_HAS_EXPIRED 등)를 반드시 함께 출력합니다.
    const cause = e?.cause;
    const causeCode = cause?.code || cause?.errno || "UNKNOWN";
    const causeMsg = cause?.message || String(cause || "");
    const err = new Error(`네트워크 오류 [${causeCode}] ${causeMsg || e.message}`);
    err.cause = cause;
    throw err;
  }
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 이 API는 게이트웨이 단계 오류(서비스 연결실패 등)일 때 HTTP 상태코드가 정상(200)이어도
    // JSON이 아닌 응답을 줄 때가 있어, 상태코드 체크보다 먼저 파싱 자체를 시도합니다.
    throw new Error(`HTTP ${res.status} / JSON 파싱 실패: ${text.slice(0, 300)}`);
  }

  // ⚠ data.go.kr은 오류 형태가 두 가지입니다.
  // 1) 요청이 실제 서비스까지는 도달한 정상 오류: { response: { header: { resultCode, resultMsg } } }
  // 2) 게이트웨이가 아예 서비스에 연결하지 못한 오류(SERVICETIMEOUT_ERROR 등):
  //    { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg, returnAuthMsg, returnReasonCode } } }
  // 2번을 안 걸러내면 body가 없어서 조용히 0건으로 넘어가버리므로 반드시 둘 다 체크합니다.
  const gatewayError = json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gatewayError) {
    throw new Error(`게이트웨이 오류 [${gatewayError.returnReasonCode}] ${gatewayError.errMsg} - ${gatewayError.returnAuthMsg}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  // ⚠ 실제로 확인해보니(2026.08.11) 이 표준데이터 API는 흔한 "{ response: { header, body } }"
  // 형태가 아니라 "response" 래핑 없이 "{ header, body }"를 최상위에 바로 내려줍니다. 예전
  // 코드가 json.response.header/json.response.body를 읽었는데 response 자체가 없으니 header가
  // 항상 undefined였고, "header && ..." 조건이 그냥 통과되면서 body도 못 읽어 매번 0건으로
  // 조용히 끝났습니다(실제로는 정상 응답에 데이터가 들어있었는데도). json.header/json.body를
  // 우선 읽고, 혹시 다른 배포 버전이 response로 감싸서 줄 수도 있으니 그 경우도 대비해둡니다.
  const header = json?.header ?? json?.response?.header;
  if (header && header.resultCode !== "00") {
    throw new Error(`API 오류 [${header.resultCode}] ${header.resultMsg}`);
  }

  const body = json?.body ?? json?.response?.body;
  const items = toArray(body?.items?.item);
  const totalCount = Number(body?.totalCount ?? 0);
  return { items, totalCount };
}

// ⚠ 이 데이터셋은 234개 지자체 백엔드를 취합하는 구조라 SERVICETIMEOUT_ERROR 같은 일시적
// 게이트웨이 오류가 종종 납니다(재현 확인됨) — 한 번 실패했다고 바로 포기하지 않고,
// 점점 더 오래 기다리면서 몇 번 더 시도합니다.
async function fetchPageWithRetry(pageNo, numOfRows, maxAttempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPage(pageNo, numOfRows);
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const waitMs = attempt * 4000; // 4s, 8s, 12s, 16s...
        console.warn(`  ⚠ 페이지 ${pageNo} 시도 ${attempt}/${maxAttempts} 실패: ${e.message} — ${waitMs / 1000}초 후 재시도`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function main() {
  console.log("전국도시공원정보표준데이터 API 호출 시작...");

  const NUM_OF_ROWS = 1000;
  let pageNo = 1;
  let totalCount = Infinity;
  const allItems = [];

  while ((pageNo - 1) * NUM_OF_ROWS < totalCount) {
    const { items, totalCount: total } = await fetchPageWithRetry(pageNo, NUM_OF_ROWS);
    totalCount = total;
    if (items.length === 0) break;
    allItems.push(...items);
    console.log(`페이지 ${pageNo}: ${items.length}건 수신 (누적 ${allItems.length} / 전체 ${totalCount})`);
    pageNo++;
    // 게이트웨이에 연속 요청 부담을 줄여 SERVICETIMEOUT_ERROR 재현 빈도를 낮춥니다.
    await sleep(300);
  }

  console.log(`총 ${allItems.length}건 수신 완료. 가공 중...`);

  const seen = new Set();
  const out = [];

  for (const item of allItems) {
    const name = pick(item, "parkNm", "PARK_NM").toString().trim();
    const lat = pick(item, "latitude", "LATITUDE").toString().trim();
    const lng = pick(item, "longitude", "LONGITUDE").toString().trim();
    if (!name || !lat || !lng) continue;

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) continue;
    if (latNum === 0 && lngNum === 0) continue;

    const manageNo = pick(item, "manageNo", "MANAGE_NO").toString().trim();
    const address = pick(item, "rdnmadr", "RDNMADR", "lnmadr", "LNMADR").toString().trim();
    const key = manageNo || `${name}|${address}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const parkAr = pick(item, "parkAr", "PARK_AR");

    out.push({
      source_key: `park-${key}`,
      name,
      category: pick(item, "parkSe", "PARK_SE").toString().trim() || "공원",
      address,
      lat,
      lng,
      area: parkAr ? String(parkAr) : null,
      management_agency: pick(item, "institutionNm", "INSTITUTION_NM").toString().trim() || null,
      phone: pick(item, "phoneNumber", "PHONE_NUMBER").toString().trim() || null,
      facility_note: buildFacilityNote(item),
    });
  }

  console.log(`중복 제거 후: ${out.length}건. Supabase로 업로드 중...`);

  const BATCH_SIZE = 500;
  let uploaded = 0;
  for (let i = 0; i < out.length; i += BATCH_SIZE) {
    const batch = out.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("parks")
      .upsert(batch, { onConflict: "source_key" });
    if (error) {
      console.error(`배치 ${i / BATCH_SIZE + 1} 저장 실패:`, error.message);
      continue;
    }
    uploaded += batch.length;
    console.log(`진행: ${uploaded} / ${out.length}`);
  }

  console.log("완료:", uploaded, "건 업로드됨.");
}

main().catch((e) => {
  console.error("실패:", e.message || e);
  if (e?.cause) console.error("원인(cause):", e.cause);
  // ⚠ 여기서 process.exit(1)을 바로 부르면, 아직 정리 중인 fetch(undici) 소켓 핸들이
  // 남아있는 상태에서 Node가 강제 종료되면서 Windows에서 "Assertion failed:
  // !(handle->flags & UV_HANDLE_CLOSING)" libuv 크래시가 나는 걸 재현 확인했습니다.
  // exitCode만 설정하면 이벤트 루프가 자연스럽게 비워진 뒤 그 코드로 종료되어 안전합니다.
  process.exitCode = 1;
});
