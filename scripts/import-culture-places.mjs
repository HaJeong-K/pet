// scripts/import-culture-places.mjs
//
// 한국문화정보원 "전국 반려동물 동반 가능 문화시설 위치 데이터" CSV를 가공해서
// Supabase culture_facilities 테이블에 upsert하는 1회성(재실행 가능) 스크립트입니다.
//
// ── 원본 CSV 특징 ──
// - 총 70,650행(헤더 제외), 위도/경도가 이미 포함돼 있어 지오코딩이 필요 없습니다.
// - "반려동물 동반 가능정보" 컬럼이 Y/N으로 나뉘어 있는데, 이 데이터셋은 반려동물 관련
//   업종(동물약국·미용실 등)까지 폭넓게 포함해서 그중 실제로 반려동물 "동반"이 안 되는
//   행(N)도 섞여 있습니다. 이 스크립트는 Y인 행만 남깁니다.
// - 같은 장소가 여러 번 중복 등록된 행이 많아(예: "100세약국"이 동일 주소로 3번),
//   정규화한 이름+주소 기준으로 중복 제거합니다.
//
// ── 사용 전 준비 ──
// 1. Supabase SQL 편집기에서 아래 테이블을 새로 만드세요(기존 테이블이 있다면
//    먼저 지워야 합니다 — 아래 "테이블 초기화 SQL" 섹션 참고):
//      create table culture_facilities (
//        id bigint generated always as identity primary key,
//        source_key text unique,
//        name text not null,
//        category text,
//        address text,
//        lat text,
//        lng text,
//        phone text,
//        website text,
//        hours text,
//        closed_days text,
//        parking text,
//        entry_fee text,
//        pet_zone text,
//        large_dog boolean,
//        memo text,
//        created_at timestamptz default now()
//      );
// 2. .env.local에 아래 값이 채워져 있어야 합니다:
//      NEXT_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
//      SUPABASE_SERVICE_ROLE_KEY=<Supabase 서비스 롤 키 — anon 키 아님, RLS 우회 필요>
//        (Supabase 대시보드 > Project Settings > API > service_role key)
// 3. 아래 CSV_PATH가 실제 파일 위치와 다르면 경로를 맞게 수정하세요.
//
// ── 실행 (반드시 프로젝트 루트에서, Node 20.6+ 권장) ──
//   node --env-file=.env.local scripts/import-culture-places.mjs
//
// Node 버전이 낮아 --env-file을 못 쓰면 `npm install dotenv -D` 후 파일 맨 위에
// `import "dotenv/config";` 한 줄만 추가해도 됩니다.
//
// source_key 기준 upsert라서 여러 번 실행해도 중복 생성되지 않습니다.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

const CSV_PATH =
  "C:/Users/infok/OneDrive/바탕 화면/경북대/95. 개인프로젝트/데이터셋/한국문화정보원_전국 반려동물 동반 가능 문화시설 위치 데이터.csv";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "환경변수가 부족합니다. NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 .env.local에 채워주세요."
  );
  process.exit(1);
}

if (!existsSync(CSV_PATH)) {
  console.error("CSV 파일을 찾을 수 없습니다:", CSV_PATH);
  console.error("스크립트 상단의 CSV_PATH 상수를 실제 파일 위치로 수정해주세요.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── 최소 RFC4180 CSV 파서 — 따옴표로 감싼 필드 안의 쉼표/줄바꿈/이스케이프된 "" 를 처리합니다 ──
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
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\r") {
        // no-op, \n에서 줄을 끊음
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
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

function toPetZone(indoorYN, outdoorYN) {
  const indoor = indoorYN === "Y";
  const outdoor = outdoorYN === "Y";
  if (indoor && outdoor) return "both";
  if (outdoor) return "terrace";
  return "indoor";
}

async function main() {
  console.log("CSV 읽는 중...");
  // ⚠ 원본 CSV가 UTF-8 BOM(맨 앞 보이지 않는 EF BB BF 마커)으로 시작합니다.
  // readFileSync(..., "utf-8")는 BOM을 자동으로 제거해주지 않아서, 그대로 두면 첫 번째
  // 헤더 컬럼("시설명")에 BOM이 들러붙어 "﻿시설명"이 되고 header.indexOf("시설명")가
  // 못 찾습니다(-1). 그 결과 모든 행의 name이 undefined가 되어 조용히 0건으로 끝났습니다.
  let text = readFileSync(CSV_PATH, "utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = parseCSV(text);
  const header = rows[0];
  console.log(`총 ${rows.length - 1}행 (헤더 제외). 컬럼 수: ${header.length}`);

  const idx = (name) => header.indexOf(name);
  const iName = idx("시설명");
  const iCat2 = idx("카테고리2");
  const iCat3 = idx("카테고리3");
  const iRoadAddr = idx("도로명주소");
  const iLotAddr = idx("지번주소");
  const iLat = idx("위도");
  const iLng = idx("경도");
  const iPhone = idx("전화번호");
  const iWebsite = idx("홈페이지");
  const iClosed = idx("휴무일");
  const iHours = idx("운영시간");
  const iParking = idx("주차 가능여부");
  const iFee = idx("입장(이용료)가격 정보");
  const iAccompany = idx("반려동물 동반 가능정보");
  const iSize = idx("입장 가능 동물 크기");
  const iRestriction = idx("반려동물 제한사항");
  const iIndoor = idx("장소(실내) 여부");
  const iOutdoor = idx("장소(실외)여부");
  const iDesc = idx("기본 정보_장소설명");
  const iExtraFee = idx("애견 동반 추가 요금");

  const seen = new Set();
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    if (row[iAccompany] !== "Y") continue; // 실제로 반려동물 동반 가능한 곳만

    const name = row[iName]?.trim();
    const address = (row[iRoadAddr]?.trim() || row[iLotAddr]?.trim() || "");
    const lat = row[iLat]?.trim();
    const lng = row[iLng]?.trim();
    if (!name || !address || !lat || !lng) continue;

    const key = `${normalize(name)}|${normalize(address)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 카테고리는 카테고리3(소분류)만 사용합니다(카테고리2와 합치지 않음). 카테고리3이 빈 값인
    // 행만 "문화시설"로 대체합니다.
    const category = row[iCat3]?.trim() || "문화시설";
    // 메모 항목이 여러 개면 " / "로 이어붙이는 대신 항목마다 줄바꿈해서 보여줍니다.
    // place/[id]/page.tsx의 메모 영역이 이미 white-space:pre-wrap이라 \n이 그대로 줄바꿈으로 렌더링됩니다.
    const memoParts = [row[iDesc], row[iRestriction] && row[iRestriction] !== "제한사항 없음" ? `제한사항: ${row[iRestriction]}` : "", row[iExtraFee] && row[iExtraFee] !== "없음" ? `추가요금: ${row[iExtraFee]}` : ""].filter(Boolean);

    out.push({
      source_key: `culture-${key}`,
      name,
      category,
      address,
      lat,
      lng,
      phone: row[iPhone] && row[iPhone] !== "정보없음" ? row[iPhone] : null,
      website: row[iWebsite] && row[iWebsite] !== "정보없음" ? row[iWebsite] : null,
      hours: row[iHours] || null,
      closed_days: row[iClosed] || null,
      parking: row[iParking] || null,
      entry_fee: row[iFee] || null,
      pet_zone: toPetZone(row[iIndoor], row[iOutdoor]),
      large_dog: row[iSize] === "모두 가능" || row[iSize]?.includes("대형"),
      memo: memoParts.join("\n") || null,
    });
  }

  console.log(`동반 가능(Y) + 중복 제거 후: ${out.length}건. Supabase로 업로드 중...`);

  const BATCH_SIZE = 500;
  let uploaded = 0;
  for (let i = 0; i < out.length; i += BATCH_SIZE) {
    const batch = out.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("culture_facilities")
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
  console.error("실패:", e);
  process.exit(1);
});
