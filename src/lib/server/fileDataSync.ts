// src/lib/server/fileDataSync.ts
//
// "파일로만 제공되는" 공공데이터 두 가지를 자동으로 내려받아 반영합니다(서버 전용, 새벽 자동 작업에서 실행).
// 두 데이터 모두 실시간 API가 없어서 예전에는 사람이 파일을 받아 스크립트(scripts/import-*.mjs)로 넣었고,
// 그 뒤로는 새로 생기거나 없어진 곳이 반영되지 않았습니다.
//
//  1) 한국문화정보원 — 전국 반려동물 동반 가능 문화시설 (data.go.kr/data/15111389, CSV 약 30MB)
//     · 갱신 주기: "수시(1회성)" — 2022년 구축, 2025년 3월 보완. 거의 바뀌지 않습니다.
//     · 그래서 매달 한 번 공공데이터포털 페이지에서 "파일이 바뀌었는지"만 확인하고, 바뀌었을 때만 내려받아 다시 넣습니다.
//  2) 식품안전나라 — 반려동물 동반출입 음식점 (foodsafetykorea.go.kr/portal/petKorea.do, 엑셀)
//     · 갱신 주기: 내려받는 시점 기준의 최신 목록(두 달 사이 약 370곳 증가). 매주 한 번 받아서
//       새로 생긴 곳은 추가하고, 목록에서 빠진 곳(영업 종료 등)은 지웁니다.
//     · 원본에 좌표가 없어서, 새 음식점의 좌표는 행정안전부 지방행정 인허가 데이터에서 "같은 주소의 인허가 기록"을
//       찾아 씁니다(src/lib/server/permitCoords.ts — 공공데이터포털 계정 키 사용). 주소 → 좌표 변환 서비스(브이월드,
//       행정안전부 주소 좌표 API)는 결과 저장·인터넷 표시·해외 서버 이용을 막는 조건이 있어 쓰지 않습니다.
//       못 찾은 곳은 추가를 미루고 다음 실행에서 다시 찾아봅니다.
//
// 안전장치: 새로 받은 목록이 기존의 절반도 안 되면(사이트 오류·형식 변경 의심) 아무것도 바꾸지 않고 실패로 알립니다.
// 관리자가 직접 지운 장소는 "다시 넣지 않을 목록"에 기억해 두어, 다음 갱신 때 되살아나지 않게 합니다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readXlsxRows } from "@/lib/server/xlsxRead";
import { findPermitCoord, permitApiKey } from "@/lib/server/permitCoords";

const BUCKET = "app-private";
const STATE_FILE = "file-data-sync.json";
const CULTURE_PAGE = "https://www.data.go.kr/data/15111389/fileData.do";
const FOOD_EXCEL = "https://www.foodsafetykorea.go.kr/portal/petKorea/downloadExcel.do";
const FOOD_PAGE = "https://www.foodsafetykorea.go.kr/portal/petKorea.do";
const UA = "Mozilla/5.0 (compatible; gachigagae-sync/1.0; +https://gachigagae.vercel.app)";
const BATCH = 500;
/** 새 목록이 기존의 이 비율보다 적으면 반영하지 않습니다. */
const MIN_KEEP_RATIO = 0.5;
/** 한 번에 이 비율보다 많이 지워야 하면(이름·주소 규칙이 어긋났을 가능성) 반영하지 않습니다. */
const MAX_REMOVE_RATIO = 0.3;
/** 한 번 실행에서 좌표로 바꿀 새 음식점 수(남은 것은 다음 실행에서 이어서) */
const FOOD_GEOCODE_PER_RUN = 400;

type SyncState = {
  culture?: { fileId: string; fileName: string; checkedAt: string; appliedAt?: string; rows?: number };
  food?: { checkedAt: string; total: number; added: number; removed: number; pending: number };
  /** 관리자가 지운 장소의 source_key — 갱신 때 다시 넣지 않습니다. */
  tombstones?: string[];
};

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function loadState(client: SupabaseClient): Promise<SyncState> {
  const { data, error } = await client.storage.from(BUCKET).download(STATE_FILE);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) as SyncState; } catch { return {}; }
}

async function saveState(client: SupabaseClient, state: SyncState): Promise<void> {
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  await client.storage.from(BUCKET).upload(STATE_FILE, Buffer.from(JSON.stringify(state)), { upsert: true, contentType: "application/json" });
}

/** 관리자가 파일 출처 장소를 지울 때 부릅니다 — 다음 갱신 때 되살아나지 않게 기억합니다. */
export async function rememberDeletedSourceKey(sourceKey: string): Promise<void> {
  const client = admin();
  const state = await loadState(client);
  const set = new Set(state.tombstones ?? []);
  if (set.has(sourceKey)) return;
  set.add(sourceKey);
  await saveState(client, { ...state, tombstones: [...set] });
}

/** 이름·주소 비교용 정규화(괄호 안 내용·공백·기호 제거) — 예전 반입 스크립트와 같은 규칙이라 기존 행과 그대로 맞습니다. */
export const normalizeKey = (s: string | null | undefined) =>
  (s || "").replace(/\(.*?\)/g, "").replace(/[^가-힣0-9a-zA-Z]/g, "").toLowerCase();

/** 쉼표·따옴표 규칙을 지키는 CSV 읽기 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function allSourceKeys(client: SupabaseClient, table: string, extra = ""): Promise<{ source_key: string; name?: string; address?: string }[]> {
  const out: { source_key: string; name?: string; address?: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(`source_key${extra}`).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
    out.push(...((data ?? []) as unknown as { source_key: string }[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function deleteByKeys(client: SupabaseClient, table: string, keys: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const { error, count } = await client.from(table).delete({ count: "exact" }).in("source_key", keys.slice(i, i + 100));
    if (error) throw new Error(`${table} 삭제 실패: ${error.message}`);
    removed += count ?? 0;
  }
  return removed;
}

// ── 1) 한국문화정보원 ──

const toPetZone = (indoor: string, outdoor: string) => (indoor === "Y" && outdoor === "Y" ? "both" : outdoor === "Y" ? "terrace" : "indoor");

/** CSV 내용 → culture_facilities 행(동반 가능 Y만, 이름+주소 중복 제거). 예전 반입 스크립트와 같은 규칙입니다. */
export function cultureRowsFromCsv(text: string): Record<string, unknown>[] {
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const header = rows[0] ?? [];
  const idx = (name: string) => header.indexOf(name);
  const col = {
    name: idx("시설명"), cat3: idx("카테고리3"), road: idx("도로명주소"), lot: idx("지번주소"), lat: idx("위도"), lng: idx("경도"),
    phone: idx("전화번호"), website: idx("홈페이지"), closed: idx("휴무일"), hours: idx("운영시간"), parking: idx("주차 가능여부"),
    fee: idx("입장(이용료)가격 정보"), accompany: idx("반려동물 동반 가능정보"), size: idx("입장 가능 동물 크기"),
    restriction: idx("반려동물 제한사항"), indoor: idx("장소(실내) 여부"), outdoor: idx("장소(실외)여부"), desc: idx("기본 정보_장소설명"), extraFee: idx("애견 동반 추가 요금"),
  };
  // 꼭 필요한 칸이 없으면 파일 형식이 바뀐 것 — 잘못 넣지 않도록 멈춥니다.
  for (const key of ["name", "lat", "lng", "accompany"] as const) {
    if (col[key] < 0) throw new Error(`문화정보원 파일 형식이 바뀌었어요(필수 칸 없음: ${key}).`);
  }
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length || row[col.accompany] !== "Y") continue;
    const name = row[col.name]?.trim();
    const address = row[col.road]?.trim() || row[col.lot]?.trim() || "";
    const lat = row[col.lat]?.trim();
    const lng = row[col.lng]?.trim();
    if (!name || !address || !lat || !lng) continue;
    const key = `${normalizeKey(name)}|${normalizeKey(address)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const restriction = row[col.restriction];
    const extraFee = row[col.extraFee];
    const memo = [row[col.desc], restriction && restriction !== "제한사항 없음" ? `제한사항: ${restriction}` : "", extraFee && extraFee !== "없음" ? `추가요금: ${extraFee}` : ""].filter(Boolean).join("\n");
    const size = row[col.size] ?? "";
    out.push({
      source_key: `culture-${key}`,
      name,
      category: row[col.cat3]?.trim() || "문화시설",
      address, lat, lng,
      phone: row[col.phone] && row[col.phone] !== "정보없음" ? row[col.phone] : null,
      website: row[col.website] && row[col.website] !== "정보없음" ? row[col.website] : null,
      hours: row[col.hours] || null,
      closed_days: row[col.closed] || null,
      parking: row[col.parking] || null,
      entry_fee: row[col.fee] || null,
      pet_zone: toPetZone(row[col.indoor], row[col.outdoor]),
      large_dog: size === "모두 가능" || size.includes("대형"),
      memo: memo || null,
    });
  }
  return out;
}

export type CultureSyncResult = { changed: boolean; fileName: string; rows?: number; added?: number; removed?: number; firstCheck?: boolean };

/** 공공데이터포털에서 파일이 바뀌었는지 확인하고, 바뀌었으면 내려받아 반영합니다. force면 바뀌지 않았어도 다시 넣습니다. */
export async function syncCultureFile(force = false): Promise<CultureSyncResult> {
  const client = admin();
  const state = await loadState(client);

  const page = await fetch(CULTURE_PAGE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!page.ok) throw new Error(`공공데이터포털 페이지 응답 ${page.status}`);
  const html = await page.text();
  const url = /"contentUrl"\s*:\s*"(https:\/\/www\.data\.go\.kr\/cmm\/cmm\/fileDownload\.do\?[^"]+)"/.exec(html)?.[1];
  const fileId = url ? /atchFileId=([A-Za-z0-9_]+)/.exec(url)?.[1] : undefined;
  if (!url || !fileId) throw new Error("공공데이터포털 페이지에서 파일 주소를 찾지 못했어요(페이지 구조 변경 의심).");
  const fileName = /"alternateName"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? fileId;
  const now = new Date().toISOString();

  // 처음 확인하는 경우: 지금 DB에 들어 있는 것이 이 파일이라고 보고 기준만 잡습니다(30MB를 괜히 다시 넣지 않음).
  if (!state.culture && !force) {
    await saveState(client, { ...state, culture: { fileId, fileName, checkedAt: now } });
    return { changed: false, fileName, firstCheck: true };
  }
  if (!force && state.culture?.fileId === fileId && state.culture?.fileName === fileName) {
    await saveState(client, { ...state, culture: { ...state.culture, checkedAt: now } });
    return { changed: false, fileName };
  }

  const file = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
  if (!file.ok) throw new Error(`문화정보원 파일 내려받기 실패 ${file.status}`);
  const rows = cultureRowsFromCsv(Buffer.from(await file.arrayBuffer()).toString("utf8"));

  const existing = await allSourceKeys(client, "culture_facilities");
  if (existing.length > 0 && rows.length < existing.length * MIN_KEEP_RATIO) {
    throw new Error(`문화정보원 새 파일이 너무 적어요(${rows.length}곳 / 기존 ${existing.length}곳) — 반영하지 않았어요.`);
  }
  const tombstones = new Set(state.tombstones ?? []);
  const fresh = rows.filter((r) => !tombstones.has(r.source_key as string));
  const freshKeys = new Set(fresh.map((r) => r.source_key as string));
  const existingKeys = new Set(existing.map((e) => e.source_key));

  const goneKeys = existing.map((e) => e.source_key).filter((k) => !freshKeys.has(k));
  if (goneKeys.length > existing.length * MAX_REMOVE_RATIO) {
    throw new Error(`문화정보원 갱신에서 지울 곳이 너무 많아요(${goneKeys.length}곳 / 기존 ${existing.length}곳) — 반영하지 않았어요.`);
  }
  for (let i = 0; i < fresh.length; i += BATCH) {
    const { error } = await client.from("culture_facilities").upsert(fresh.slice(i, i + BATCH), { onConflict: "source_key" });
    if (error) throw new Error(`culture_facilities 저장 실패: ${error.message}`);
  }
  const removed = await deleteByKeys(client, "culture_facilities", goneKeys);
  const added = fresh.filter((r) => !existingKeys.has(r.source_key as string)).length;
  await saveState(client, { ...state, culture: { fileId, fileName, checkedAt: now, appliedAt: now, rows: fresh.length } });
  return { changed: true, fileName, rows: fresh.length, added, removed };
}

// ── 2) 식품안전나라 ──

export type FoodRow = { key: string; name: string; category: string; region: string; address: string };

/** 엑셀 행 → 음식점 목록(이름+주소 중복 제거). */
export function foodRowsFromSheet(rows: string[][]): FoodRow[] {
  const header = rows[0] ?? [];
  const iName = header.indexOf("업소명"), iCategory = header.indexOf("업종"), iRegion = header.indexOf("지역"), iAddress = header.indexOf("업소주소");
  if (iName < 0 || iAddress < 0) throw new Error("식품안전나라 파일 형식이 바뀌었어요(업소명·업소주소 칸 없음).");
  const seen = new Set<string>();
  const out: FoodRow[] = [];
  for (const row of rows.slice(1)) {
    const name = row[iName]?.trim();
    const address = row[iAddress]?.trim();
    if (!name || !address) continue;
    const key = `${normalizeKey(name)}|${normalizeKey(address)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name, category: row[iCategory]?.trim() || "카페/식당", region: row[iRegion]?.trim() || "", address });
  }
  return out;
}

export type FoodSyncResult = { total: number; added: number; removed: number; pending: number; geocodeFailed: number; note?: string };

/** 식품안전나라에서 최신 목록을 받아 새 음식점은 추가하고 빠진 곳은 지웁니다. maxMs 안에서 좌표 변환을 진행합니다. */
export async function syncFoodFile(maxMs = 60_000): Promise<FoodSyncResult> {
  const started = Date.now();
  const client = admin();
  const state = await loadState(client);

  const res = await fetch(FOOD_EXCEL, { method: "POST", headers: { "User-Agent": UA, Referer: FOOD_PAGE }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`식품안전나라 엑셀 내려받기 실패 ${res.status}`);
  const list = foodRowsFromSheet(readXlsxRows(Buffer.from(await res.arrayBuffer())));

  const existing = await allSourceKeys(client, "foodsafety_restaurants");
  if (existing.length > 0 && list.length < existing.length * MIN_KEEP_RATIO) {
    throw new Error(`식품안전나라 새 목록이 너무 적어요(${list.length}곳 / 기존 ${existing.length}곳) — 반영하지 않았어요.`);
  }

  // 문화정보원에 이미 있는 곳은 한 번만 보여 주려고 건너뜁니다(예전 반입과 같은 규칙).
  const cultureKeys = new Set((await allSourceKeys(client, "culture_facilities")).map((r) => r.source_key.replace(/^culture-/, "")));
  const tombstones = new Set(state.tombstones ?? []);
  const wanted = list.filter((r) => !cultureKeys.has(r.key) && !tombstones.has(`foodsafety-${r.key}`));
  const wantedKeys = new Set(wanted.map((r) => `foodsafety-${r.key}`));
  const existingKeys = new Set(existing.map((e) => e.source_key));

  // 목록에서 빠진 곳(영업 종료·지정 취소 등) 삭제
  const goneKeys = existing.map((e) => e.source_key).filter((k) => !wantedKeys.has(k));
  if (goneKeys.length > existing.length * MAX_REMOVE_RATIO) {
    throw new Error(`식품안전나라 갱신에서 지울 곳이 너무 많아요(${goneKeys.length}곳 / 기존 ${existing.length}곳) — 반영하지 않았어요.`);
  }
  const removed = await deleteByKeys(client, "foodsafety_restaurants", goneKeys);

  // 새로 생긴 곳 추가 — 좌표가 있어야 지도에 올릴 수 있습니다.
  const fresh = wanted.filter((r) => !existingKeys.has(`foodsafety-${r.key}`));
  const permitKey = permitApiKey();
  let added = 0, geocodeFailed = 0;
  if (permitKey) {
    const batch: Record<string, unknown>[] = [];
    // 인허가 조회 한 번이 1~2초 걸려서, 네 곳씩 동시에 찾습니다(하루 호출 한도 1만 건에 비해 충분히 적은 양).
    // ⚠ 지난번에 못 찾은 곳이 늘 목록 앞에 있어 매번 그것부터 다시 찾느라 뒤쪽이 밀리지 않도록,
    //    실행할 때마다 시작 위치를 바꿔 가며 훑습니다.
    const queue = fresh.slice(0, FOOD_GEOCODE_PER_RUN);
    const offset = queue.length ? Math.floor(Date.now() / 60_000) % queue.length : 0;
    const ordered = [...queue.slice(offset), ...queue.slice(0, offset)];
    let next = 0;
    const worker = async () => {
      while (next < ordered.length && Date.now() - started <= maxMs) {
        const r = ordered[next++];
        // 인허가 조회가 잠깐 실패해도(시간 초과 등) 전체를 멈추지 않고 그 가게만 다음 실행으로 미룹니다.
        const coord = await findPermitCoord(r, permitKey).catch(() => null);
        if (!coord) { geocodeFailed++; continue; }
        batch.push({ source_key: `foodsafety-${r.key}`, name: r.name, category: r.category, region: r.region, address: r.address, lat: coord.lat, lng: coord.lng, memo: "식품안전나라 반려동물 동반출입 음식점 제공 정보" });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    for (let i = 0; i < batch.length; i += BATCH) {
      const { error } = await client.from("foodsafety_restaurants").upsert(batch.slice(i, i + BATCH), { onConflict: "source_key" });
      if (error) throw new Error(`foodsafety_restaurants 저장 실패: ${error.message}`);
      added += Math.min(BATCH, batch.length - i);
    }
  }
  const pending = fresh.length - added;
  await saveState(client, { ...state, food: { checkedAt: new Date().toISOString(), total: list.length, added, removed, pending } });
  return {
    total: list.length, added, removed, pending, geocodeFailed,
    ...(permitKey ? {} : { note: "공공데이터포털 키(TOUR_API_KEY)가 없어 새 음식점 추가는 미뤘어요" }),
  };
}
