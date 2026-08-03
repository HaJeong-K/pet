// scripts/import-foodsafety-places.mjs
//
// 식품안전나라 "반려동물 동반출입 음식점" CSV(엑셀에서 CSV로 저장한 파일)를 가공해서
// Supabase foodsafety_restaurants 테이블에 upsert하는 1회성(재실행 가능) 스크립트입니다.
//
// ── 원본 CSV 특징 ──
// - 컬럼: 연번,업소명,업종,지역,업소주소 — 총 2,417행(헤더 제외), 좌표가 없습니다.
// - 이 스크립트가 각 주소를 카카오 로컬 API(주소 검색)로 지오코딩해서 좌표를 채웁니다.
//   주소 검색으로 못 찾으면 "지역 + 업소명" 키워드 검색으로 한 번 더 시도합니다.
// - 이미 culture_facilities에 올라간 장소와 이름+주소가 같으면(정규화 기준) 건너뜁니다 —
//   같은 장소가 여러 정부 데이터셋에 중복으로 실리는 경우를 한 번만 반영하기 위함입니다.
//
// ── 사용 전 준비 ──
// 1. Supabase SQL 편집기에서 아래 테이블을 새로 만드세요(기존 테이블이 있다면
//    먼저 지워야 합니다 — "테이블 초기화 SQL" 섹션 참고):
//      create table foodsafety_restaurants (
//        id bigint generated always as identity primary key,
//        source_key text unique,
//        name text not null,
//        category text,
//        region text,
//        address text,
//        lat text,
//        lng text,
//        memo text,
//        created_at timestamptz default now()
//      );
// 2. .env.local에 아래 값이 채워져 있어야 합니다:
//      NEXT_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
//      SUPABASE_SERVICE_ROLE_KEY=<Supabase 서비스 롤 키>
//      KAKAO_REST_API_KEY=<카카오 디벨로퍼스 REST API 키>
//        (기존 NEXT_PUBLIC_KAKAO_MAP_KEY는 JS SDK용 키라 이 지오코딩 API에는 못 씁니다.
//         kakao developers.com > 내 애플리케이션 > 앱 키 > REST API 키를 새로 추가하세요.
//         같은 앱 안의 다른 키 종류라 앱을 새로 만들 필요는 없습니다.)
// 3. culture_facilities를 먼저(또는 함께) import해두면 중복 방지가 더 정확해집니다.
// 4. 아래 CSV_PATH가 실제 파일 위치와 다르면 경로를 맞게 수정하세요.
//
// ── 실행 (반드시 프로젝트 루트에서, Node 20.6+ 권장) ──
//   node --env-file=.env.local scripts/import-foodsafety-places.mjs
//
// 2,400여 건을 카카오 API로 순차 지오코딩하기 때문에 완료까지 대략 8~10분 정도
// 걸립니다. 중간에 실패한 주소는 콘솔에 목록으로 출력되니, 필요하면 나중에 수동으로
// 보정해서 재실행해도 source_key 기준 upsert라 중복 없이 갱신됩니다.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

const CSV_PATH =
  "C:/Users/infok/OneDrive/바탕 화면/경북대/95. 개인프로젝트/데이터셋/반려동물_동반가능_업소현황.csv";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !KAKAO_REST_API_KEY) {
  console.error(
    "환경변수가 부족합니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / KAKAO_REST_API_KEY 를 .env.local에 채워주세요."
  );
  process.exit(1);
}

if (!existsSync(CSV_PATH)) {
  console.error("CSV 파일을 찾을 수 없습니다:", CSV_PATH);
  console.error("스크립트 상단의 CSV_PATH 상수를 실제 파일 위치로 수정해주세요.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── 최소 RFC4180 CSV 파서 (import-culture-places.mjs와 동일) ──
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\r") {
        // skip
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const normalize = (s) =>
  (s || "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^가-힣0-9a-zA-Z]/g, "")
    .toLowerCase();

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function geocodeAddress(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const doc = data?.documents?.[0];
  if (!doc) return null;
  return { lat: doc.y, lng: doc.x };
}

async function geocodeKeyword(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const doc = data?.documents?.[0];
  if (!doc) return null;
  return { lat: doc.y, lng: doc.x };
}

async function main() {
  console.log("culture_facilities에서 기존 등록 장소 조회 중(중복 방지용)...");
  const existingKeys = new Set();
  {
    const { data } = await supabase.from("culture_facilities").select("name, address");
    (data || []).forEach((r) => existingKeys.add(`${normalize(r.name)}|${normalize(r.address)}`));
  }
  console.log(`기존 culture_facilities ${existingKeys.size}건 확인됨.`);

  console.log("CSV 읽는 중...");
  const text = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(text);
  const header = rows[0];
  const iName = header.indexOf("업소명");
  const iCategory = header.indexOf("업종");
  const iRegion = header.indexOf("지역");
  const iAddress = header.indexOf("업소주소");
  console.log(`총 ${rows.length - 1}행 (헤더 제외).`);

  const seen = new Set();
  const candidates = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    const name = row[iName]?.trim();
    const address = row[iAddress]?.trim();
    if (!name || !address) continue;

    const key = `${normalize(name)}|${normalize(address)}`;
    if (seen.has(key)) continue; // CSV 자체 내 중복 제거
    seen.add(key);
    if (existingKeys.has(key)) continue; // culture_facilities와 겹치는 곳은 한 번만

    candidates.push({ name, category: row[iCategory] || "카페/식당", region: row[iRegion] || "", address, key });
  }

  console.log(`지오코딩 대상: ${candidates.length}건 (CSV 내부 중복 및 culture_facilities와 겹치는 곳 제외)`);

  const out = [];
  const failed = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let coord = await geocodeAddress(c.address);
    if (!coord) coord = await geocodeKeyword(`${c.region} ${c.name}`);
    if (!coord) {
      failed.push(c);
    } else {
      out.push({
        source_key: `foodsafety-${c.key}`,
        name: c.name,
        category: c.category,
        region: c.region,
        address: c.address,
        lat: coord.lat,
        lng: coord.lng,
        memo: "식품안전나라 반려동물 동반출입 음식점 제공 정보",
      });
    }
    if ((i + 1) % 50 === 0) console.log(`지오코딩 진행: ${i + 1} / ${candidates.length}`);
    await sleep(120); // 카카오 API 레이트리밋 여유
  }

  console.log(`지오코딩 완료: 성공 ${out.length}건, 실패 ${failed.length}건`);
  if (failed.length > 0) {
    console.log("지오코딩 실패 목록 (주소 확인 필요):");
    failed.forEach((f) => console.log(`  - ${f.name} / ${f.address}`));
  }

  console.log("Supabase로 업로드 중...");
  const BATCH_SIZE = 500;
  let uploaded = 0;
  for (let i = 0; i < out.length; i += BATCH_SIZE) {
    const batch = out.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("foodsafety_restaurants")
      .upsert(batch, { onConflict: "source_key" });
    if (error) {
      console.error(`배치 ${i / BATCH_SIZE + 1} 저장 실패:`, error.message);
      continue;
    }
    uploaded += batch.length;
  }

  console.log("완료:", uploaded, "건 업로드됨.");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
