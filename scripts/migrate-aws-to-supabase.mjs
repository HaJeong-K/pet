// scripts/migrate-aws-to-supabase.mjs
//
// AWS(DynamoDB + Lambda)에 있는 전국 데이터를 Supabase `places` 테이블로 옮기는
// 1회성(또는 재실행 가능한) 마이그레이션 스크립트입니다.
//
// 목적: 지금은 Supabase 무료 티어 + AWS(DynamoDB/Lambda)를 함께 쓰고 있는데,
// 비용을 최소화하려면 Supabase 하나로 합치는 게 유리합니다. 이 스크립트로 AWS 쪽
// 데이터를 Supabase에 옮겨두면, 이후 앱 코드에서 fetchAwsPlaces() 호출을 걷어내고
// AWS(API Gateway + Lambda + DynamoDB) 리소스를 정리(비용 절감)할 수 있습니다.
//
// ── 사용 전 준비 ──
// 1. Supabase `places` 테이블에 아래 컬럼이 없다면 추가하세요 (중복 실행 방지용 unique 키):
//      alter table places add column if not exists external_ref text unique;
// 2. 프로젝트 루트의 .env.local에 아래 값이 채워져 있어야 합니다 (이미 앱에서
//    쓰고 있다면 별도 작업 불필요 — 이 스크립트가 .env.local을 자동으로 읽습니다).
//      NEXT_PUBLIC_AWS_PLACES_API=<기존 Lambda GET /places 엔드포인트>
//      NEXT_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
//      SUPABASE_SERVICE_ROLE_KEY=<Supabase 서비스 롤 키 — anon key 아님, RLS 우회 필요>
//        (Supabase 대시보드 > Project Settings > API > service_role key)
//
// ── 실행 (반드시 프로젝트 루트에서) ──
//   node scripts/migrate-aws-to-supabase.mjs
//
// 여러 번 실행해도 external_ref 기준으로 upsert 하기 때문에 중복 생성되지 않습니다.
// 마이그레이션이 끝나고 Supabase에서 데이터가 잘 보이면, 그 다음에 알려주시면
// 앱 코드에서 AWS 호출부(fetchAwsPlaces)를 제거하는 정리 작업을 진행하겠습니다.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// ── .env.local 자동 로드 ──
// Next.js(`next dev`/`next build`)는 .env.local을 자동으로 읽어들이지만,
// 일반 `node 스크립트.mjs` 실행은 그렇지 않습니다. 별도 dotenv 패키지 설치 없이
// 프로젝트 루트의 .env.local을 직접 파싱해 process.env에 채워 넣습니다.
function loadEnvLocal() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // 값이 따옴표로 감싸져 있으면 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const AWS_API = process.env.NEXT_PUBLIC_AWS_PLACES_API;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!AWS_API || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "환경변수가 부족합니다. NEXT_PUBLIC_AWS_PLACES_API / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 설정해주세요."
  );
  console.error(
    "프로젝트 루트(package.json이 있는 위치)에 .env.local 파일이 있는지, 그리고 위 세 값이 모두 채워져 있는지 확인해주세요."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log("AWS(Lambda)에서 전국 데이터 조회 중...");
  const res = await fetch(AWS_API);
  if (!res.ok) {
    console.error("AWS API 응답 오류:", res.status);
    process.exit(1);
  }
  const raw = await res.json();
  console.log(`총 ${raw.length}건 조회됨. Supabase로 옮기는 중...`);

  const BATCH_SIZE = 200;
  let migrated = 0;

  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const batch = raw.slice(i, i + BATCH_SIZE).map((item) => ({
      external_ref: `aws-${item.place_id}`, // 재실행 시 중복 방지 키
      name: item.name ?? "",
      category: item.category ?? null,
      address: item.address ?? "",
      lat: String(item.lat ?? ""),
      lng: String(item.lng ?? ""),
      pet_zone: item.pet_zone ?? null,
      hours: item.hours ?? null,
      large_dog: item.large_dog ?? null,
      pet_menu: item.pet_menu ?? null,
      phone: item.phone ?? null,
      memo: item.memo ?? null,
      website: item.website ?? null,
      closed_days: item.closed_days ?? null,
      parking: item.parking ?? null,
      entry_fee: item.entry_fee ?? null,
      specialty_department: item.specialty_department ?? null,
      treatable_animals: item.treatable_animals ?? null,
      image_url: item.image_url || null,
    }));

    const { error } = await supabase
      .from("places")
      .upsert(batch, { onConflict: "external_ref" });

    if (error) {
      console.error(`배치 ${i / BATCH_SIZE + 1} 저장 실패:`, error.message);
      continue;
    }
    migrated += batch.length;
    console.log(`진행: ${migrated} / ${raw.length}`);
  }

  console.log("마이그레이션 완료:", migrated, "건");
}

main().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
