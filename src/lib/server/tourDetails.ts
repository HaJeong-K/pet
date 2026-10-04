// src/lib/server/tourDetails.ts
//
// 한국관광공사 반려동물 동반여행(KorPetTourService2) 장소의 "상세 정보" 보관소(서버 전용).
//
// 목록 API에는 이름·주소·좌표·사진만 있고, 영업시간·휴무일·주차·전화·홈페이지·반려동물 동반 조건은
// 장소마다 상세 API 3종(detailCommon2 · detailIntro2 · detailPetTour2)을 따로 불러야 나옵니다.
// 전국 약 9,700곳 × 3번이라 한 번에 다 받을 수 없어서(공공데이터포털 하루 호출 한도),
//   · 받은 상세는 Supabase Storage 파일 하나(tour-details-v1.json.gz)에 쌓아 두고
//   · 매일 새벽 작업이 아직 안 받은 장소부터 시간·한도가 허락하는 만큼 이어서 받습니다.
// 목록을 만들 때(getTourPlaces)는 이 파일만 읽어 합치므로 화면을 열 때 추가 호출이 없습니다.
// ⚠ 예전엔 목록 앞쪽 50곳만 그 자리에서 상세를 받아, 나머지 9,600여 곳은 영업시간·전화가 비어 있었습니다.
// 공공누리 공공데이터라 저장해 두고 쓰는 데 제약이 없습니다(카카오 장소 API와 다른 점).

import { gzipSync, gunzipSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BASE_URL = "https://apis.data.go.kr/B551011/KorPetTourService2";
const BUCKET = "public-data-cache";
const PATH = "tour-details-v1.json.gz";
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY = 10;
/** 이보다 오래된 상세는 (새 장소를 다 받은 뒤) 다시 받아 최신으로 바꿉니다. */
const REFRESH_AFTER_MS = 60 * 24 * 60 * 60 * 1000;
/** 이만큼 받을 때마다 중간 저장(도중에 시간 초과로 끊겨도 받은 만큼은 남게) */
const SAVE_EVERY = 300;
const MEM_TTL_MS = 10 * 60_000;

export type TourDetail = {
  phone: string | null;
  website: string | null;
  overview: string | null;
  hours: string | null;
  closedDays: string | null;
  parking: string | null;
  entryFee: string | null;
  /** 동반 유형(예: "전구역 동반가능", "일부구역 동반가능") */
  petType: string | null;
  /** 동반 가능 동물(예: "전 견종 동반 가능", "7kg 이하 반려동물") */
  petAnimals: string | null;
  /** 동반 시 필요사항(예: "목줄 착용") */
  petNeeds: string | null;
  /** 기타 동반 안내 */
  petEtc: string | null;
  /** 받은 시각(ms) */
  at: number;
};
export type TourDetailMap = Record<string, TourDetail>;
export type TourListItem = { contentid: string; contenttypeid?: string };

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

let mem: { map: TourDetailMap; at: number } | null = null;

export async function loadTourDetails(force = false): Promise<TourDetailMap> {
  if (!force && mem && Date.now() - mem.at < MEM_TTL_MS) return mem.map;
  const client = admin();
  if (!client) return mem?.map ?? {};
  try {
    const { data, error } = await client.storage.from(BUCKET).download(PATH);
    if (error || !data) return mem?.map ?? {};
    const map = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as TourDetailMap;
    mem = { map, at: Date.now() };
    return map;
  } catch (e) {
    console.error("[tourDetails] 읽기 실패:", e);
    return mem?.map ?? {};
  }
}

async function saveTourDetails(map: TourDetailMap): Promise<boolean> {
  const client = admin();
  if (!client) return false;
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const body = gzipSync(Buffer.from(JSON.stringify(map), "utf8"));
  const { error } = await client.storage.from(BUCKET).upload(PATH, body, { upsert: true, contentType: "application/gzip" });
  if (error) {
    console.error("[tourDetails] 저장 실패:", error.message);
    return false;
  }
  mem = { map, at: Date.now() };
  return true;
}

function encodeServiceKey(key: string): string {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

/** 태그를 벗기고 줄바꿈(<br>)은 살립니다. */
export function cleanText(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text || null;
}

function extractHomepageUrl(raw: unknown): string | null {
  if (!raw) return null;
  const href = String(raw).match(/href=["']([^"']+)["']/i);
  if (href) return href[1];
  const text = cleanText(raw);
  const url = text?.match(/https?:\/\/[^\s]+/);
  return url ? url[0] : text && /^[\w.-]+\.[a-z]{2,}/i.test(text) ? `http://${text.split(/\s/)[0]}` : null;
}

/** "순천시청 녹지과 061-749-4243\n…" 같은 문의처 글에서 첫 전화번호만 꺼냅니다(tel: 링크로 쓰기 위해). */
export function extractPhone(raw: unknown): string | null {
  const text = cleanText(raw);
  if (!text) return null;
  const m = text.match(/(?:0\d{1,3}|1\d{3})[-.\s)]?\d{3,4}[-.\s]?\d{4}|1\d{3}[-.\s]?\d{4}/);
  return m ? m[0].replace(/[.\s)]/g, "-").replace(/-+/g, "-") : null;
}

// 컨텐츠 타입(관광지·음식점·숙박…)마다 영업시간·휴무일·주차·요금·문의처 필드 이름이 다릅니다(TourAPI4.0 공통 규칙).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractIntroFields(contentTypeId: string | undefined, intro: any) {
  const empty = { hours: null as string | null, closedDays: null as string | null, parking: null as string | null, entryFee: null as string | null, infoCenter: null as string | null };
  if (!intro) return empty;
  const pick = (hours: unknown, closedDays: unknown, parking: unknown, entryFee: unknown, infoCenter: unknown) => ({
    hours: cleanText(hours), closedDays: cleanText(closedDays), parking: cleanText(parking), entryFee: cleanText(entryFee), infoCenter: cleanText(infoCenter),
  });
  switch (contentTypeId) {
    case "39": // 음식점
      return pick(intro.opentimefood, intro.restdatefood, intro.parkingfood, intro.discountinfofood, intro.infocenterfood);
    case "32": { // 숙박
      const checkin = cleanText(intro.checkintime), checkout = cleanText(intro.checkouttime);
      return pick(checkin || checkout ? `체크인 ${checkin || "-"} / 체크아웃 ${checkout || "-"}` : null, null, intro.parkinglodging, null, intro.infocenterlodging);
    }
    case "28": // 레포츠
      return pick(intro.usetimeleports, intro.restdateleports, intro.parkingleports, intro.usefeeleports, intro.infocenterleports);
    case "38": // 쇼핑
      return pick(intro.opentime, intro.restdateshopping, intro.parkingshopping, null, intro.infocentershopping);
    case "14": // 문화시설
      return pick(intro.usetimeculture, intro.restdateculture, intro.parkingculture, intro.usefee, intro.infocenterculture);
    case "15": // 축제공연행사
      return pick(intro.playtime, null, null, intro.usetimefestival, intro.sponsor1tel);
    default: // 12 관광지 등
      return pick(intro.usetime, intro.restdate, intro.parking, intro.usefee, intro.infocenter);
  }
}

class QuotaExceeded extends Error {}

/** 상세 API 한 번 호출. 항목이 없으면 null, 하루 호출 한도를 넘으면 QuotaExceeded */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchDetailItem(apiKey: string, path: string, contentId: string, contentTypeId?: string): Promise<any | null> {
  const qs = new URLSearchParams({ MobileOS: "ETC", MobileApp: "GachiGagae", _type: "json", contentId });
  if (contentTypeId) qs.set("contentTypeId", contentTypeId);
  const res = await fetch(`${BASE_URL}/${path}?${qs.toString()}&serviceKey=${encodeServiceKey(apiKey)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  // 한도 초과는 JSON이 아닌 XML/문구로 오기도 합니다(LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR, 코드 22).
  if (res.status === 429 || /LIMITED_NUMBER_OF_SERVICE_REQUESTS|<returnReasonCode>22</.test(text)) throw new QuotaExceeded();
  let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = JSON.parse(text); } catch { throw new Error(`응답 형식 오류(${res.status})`); }
  const code = data?.response?.header?.resultCode;
  if (code === "22") throw new QuotaExceeded();
  if (code && !["0", "00", "0000"].includes(code)) throw new Error(`resultCode ${code}`);
  const item = data?.response?.body?.items?.item;
  if (!item) return null;
  return Array.isArray(item) ? item[0] : item;
}

async function fetchOneDetail(apiKey: string, item: TourListItem): Promise<TourDetail> {
  const [common, intro, pet] = await Promise.all([
    fetchDetailItem(apiKey, "detailCommon2", item.contentid),
    fetchDetailItem(apiKey, "detailIntro2", item.contentid, item.contenttypeid),
    fetchDetailItem(apiKey, "detailPetTour2", item.contentid),
  ]);
  const introFields = extractIntroFields(item.contenttypeid, intro);
  return {
    phone: extractPhone(common?.tel) ?? extractPhone(introFields.infoCenter),
    website: extractHomepageUrl(common?.homepage),
    overview: cleanText(common?.overview),
    hours: introFields.hours,
    closedDays: introFields.closedDays,
    parking: introFields.parking,
    entryFee: introFields.entryFee,
    petType: cleanText(pet?.acmpyTypeCd),
    petAnimals: cleanText(pet?.acmpyPsblCpam),
    petNeeds: cleanText(pet?.acmpyNeedMtr),
    petEtc: cleanText(pet?.etcAcmpyInfo),
    at: Date.now(),
  };
}

export type EnrichResult = { total: number; have: number; fetched: number; failed: number; remaining: number; stopped: "done" | "time" | "quota" };

/**
 * 아직 상세가 없는 장소부터(그다음 오래된 순으로) maxMs 동안 받아서 저장합니다.
 * 하루 호출 한도에 걸리면 그 자리에서 멈추고 받은 만큼 저장합니다 — 다음 날 이어서 받습니다.
 */
export async function enrichTourDetails(items: TourListItem[], maxMs: number): Promise<EnrichResult> {
  const apiKey = process.env.TOUR_API_KEY;
  if (!apiKey) throw new Error("TOUR_API_KEY 없음");
  const startedAt = Date.now();
  const map = { ...(await loadTourDetails(true)) };

  const missing = items.filter((it) => !map[it.contentid]);
  const stale = items
    .filter((it) => map[it.contentid] && Date.now() - map[it.contentid].at > REFRESH_AFTER_MS)
    .sort((a, b) => map[a.contentid].at - map[b.contentid].at);
  const queue = [...missing, ...stale];

  let fetched = 0, failed = 0, sinceSave = 0;
  let stopped: EnrichResult["stopped"] = "done";
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > maxMs) { stopped = "time"; break; }
    const results = await Promise.allSettled(queue.slice(i, i + CONCURRENCY).map(async (item) => ({ id: item.contentid, detail: await fetchOneDetail(apiKey, item) })));
    let quota = false;
    for (const r of results) {
      if (r.status === "fulfilled") { map[r.value.id] = r.value.detail; fetched++; sinceSave++; }
      else if (r.reason instanceof QuotaExceeded) quota = true;
      else failed++;
    }
    if (quota) { stopped = "quota"; break; }
    if (sinceSave >= SAVE_EVERY) { await saveTourDetails(map); sinceSave = 0; }
  }
  if (sinceSave > 0) await saveTourDetails(map);

  const have = items.filter((it) => map[it.contentid]).length;
  return { total: items.length, have, fetched, failed, remaining: items.length - have, stopped };
}

/** 가능 동물 문구로 대형견 가능 여부를 추정합니다(판단할 수 없으면 null). */
export function largeDogFrom(petAnimals: string | null): boolean | null {
  if (!petAnimals) return null;
  if (/전\s*견종|모든\s*견종|대형견|제한\s*없/.test(petAnimals) && !/대형견\s*(불가|제외)/.test(petAnimals)) return true;
  if (/\d+\s*kg\s*(이하|미만)|소형견|중소형|대형견\s*(불가|제외)/i.test(petAnimals)) return false;
  return null;
}

/** 동반 유형 문구 → 화면의 동반 가능 범위 값(판단할 수 없으면 null) */
export function petZoneFrom(petType: string | null): "indoor" | "terrace" | "both" | null {
  if (!petType) return null;
  if (/전\s*구역|전체/.test(petType)) return "both";
  if (/실외|야외|테라스/.test(petType) && !/실내/.test(petType)) return "terrace";
  if (/실내/.test(petType) && !/실외|야외/.test(petType)) return "indoor";
  return null;
}

/** 반려동물 동반 안내를 메모용 글로 묶습니다. */
export function petMemo(d: TourDetail): string | null {
  const lines = [
    d.petType && `동반 범위: ${d.petType}`,
    d.petNeeds && `준비물: ${d.petNeeds}`,
    d.petEtc,
  ].filter(Boolean) as string[];
  return tidyLines(lines.join("\n"));
}

/**
 * 관광공사 원문은 줄바꿈 없이 "…상이- 맹견의 경우…", "[1월]- 첫출발…[2월]- …"처럼 붙어서 옵니다.
 * 항목 표시("- ", "[…]", "※") 앞에서 줄을 나눠 읽기 쉽게 만듭니다.
 */
export function tidyLines(text: string | null | undefined): string | null {
  if (!text) return null;
  const out = text
    .replace(/(\S)[ \t]*(\[[^\]\n]{1,20}\])/g, "$1\n$2")
    .replace(/(\S)- (?=[가-힣(\[])/g, "$1\n- ")
    .replace(/([^\n])[ \t]*※/g, "$1\n※")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || null;
}
