// src/lib/server/korEnrich.ts
//
// 한국관광공사 국문 관광정보 서비스(KorService2)로 빈칸 채우기(서버 전용) — 2026-11-13
//
// 식약처 반려동물 동반 음식점·카페(약 2,800곳)는 이름·주소만 있어 영업시간·쉬는 날·주차·전화·사진이 비어 있습니다.
// 인허가 데이터에는 영업시간이 없어서, 관광공사에 등록된 음식점(약 13,000곳)·숙박(약 3,000곳)과
// "같은 가게"인 곳을 찾아 그 상세 정보로 빈칸을 채웁니다.
//   · 같은 가게 기준: 150m 안 + 이름이 같거나 한쪽이 다른 쪽을 포함(src/lib/permitMatch.ts의 nameScore — 인허가 대조와 같은 기준).
//     이름이 완전히 같으면 500m까지 봅니다(출처마다 찍은 지점이 조금 다름). 후보가 여럿이면 고르지 않습니다.
//   · 결과는 Supabase Storage 파일(kor-fill-v1.json.gz)에 장소 번호별로 쌓고, 지도 목록을 만들 때
//     (src/lib/publicDataAggregate.ts) 비어 있는 칸만 채웁니다 — 원래 있던 값은 바꾸지 않습니다.
//   · 맞는 가게가 없던 곳도 기록해 30일 동안 다시 찾지 않습니다.
// 이용허락: 공공누리(한국관광공사) — 사진은 저작권 유형이 1유형·3유형으로 표시된 것만 씁니다.

import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { nameScore, cleanPhone } from "@/lib/permitMatch";

const BASE_URL = "https://apis.data.go.kr/B551011/KorService2";
const BUCKET = "public-data-cache";
const PATH = "kor-fill-v1.json.gz";
const MEM_TTL_MS = 10 * 60_000;
const RECHECK_MS = 30 * 86_400_000;
const NEAR_KM = 0.15;
const EXACT_NAME_KM = 0.5;
const DEFAULT_IMAGE = "/images/default-place.png";

/** 채울 값 — h: 영업시간, c: 쉬는 날, p: 주차, t: 전화, i: 사진, m: 대표 메뉴. n: 맞는 가게가 없었음. at: 확인한 때 */
export type KorFill = { h?: string; c?: string; p?: string; t?: string; i?: string; m?: string; n?: 1; at: number };
export type KorFillMap = Record<string, KorFill>;

type Place = { id: number; name: string; category: string | null; address: string | null; lat: string | number | null; lng: string | number | null; hours?: string | null; closed_days?: string | null; parking?: string | null; phone?: string | null; image_url?: string | null; memo?: string | null };
type KorItem = { contentid: string; contenttypeid: string; title: string; mapx: string; mapy: string; tel?: string; firstimage?: string; cpyrhtDivCd?: string };

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let mem: { map: KorFillMap; at: number } | null = null;

export async function loadKorFill(force = false): Promise<KorFillMap> {
  if (!force && mem && Date.now() - mem.at < MEM_TTL_MS) return mem.map;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return {};
  try {
    const { data, error } = await admin().storage.from(BUCKET).download(PATH);
    if (error || !data) { mem = { map: {}, at: Date.now() }; return mem.map; }
    const map = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as KorFillMap;
    mem = { map, at: Date.now() };
    return map;
  } catch {
    return mem?.map ?? {};
  }
}

async function saveKorFill(map: KorFillMap): Promise<void> {
  const client = admin();
  await client.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const { error } = await client.storage.from(BUCKET).upload(PATH, gzipSync(Buffer.from(JSON.stringify(map), "utf8")), { upsert: true, contentType: "application/gzip" });
  if (error) console.error("[korEnrich] 저장 실패:", error.message);
  else mem = { map, at: Date.now() };
}

const isBlank = (v: unknown) => v == null || String(v).trim() === "";

/** 지도 목록에 반영 — 비어 있는 칸만 채웁니다 */
export function applyKorFill<T extends Place>(list: T[], fills: KorFillMap): T[] {
  if (Object.keys(fills).length === 0) return list;
  return list.map((p) => {
    const f = fills[String(p.id)];
    if (!f || f.n) return p;
    const next: T = { ...p };
    if (isBlank(p.hours) && f.h) next.hours = tidyKorHours(f.h);
    if (isBlank(p.closed_days) && f.c) next.closed_days = f.c;
    if (isBlank(p.parking) && f.p) next.parking = f.p;
    if (isBlank(p.phone) && f.t) next.phone = cleanPhone(f.t) ?? f.t;
    if ((isBlank(p.image_url) || p.image_url === DEFAULT_IMAGE) && f.i) next.image_url = f.i;
    if (f.m && !String(p.memo ?? "").includes("대표 메뉴")) next.memo = `${p.memo ? `${p.memo}\n` : ""}대표 메뉴: ${f.m} (한국관광공사 제공)`;
    return next;
  });
}

function apiKey(): string {
  const key = process.env.TOUR_API_KEY || "";
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

class DailyLimitError extends Error {}

async function call(path: string, qs: string): Promise<any[]> {
  const url = `${BASE_URL}/${path}?serviceKey=${apiKey()}&MobileOS=ETC&MobileApp=petsroad&_type=json&${qs}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    // 정상 응답(JSON)을 먼저 봅니다 — 가게 이름에 "일일" 같은 글자가 있어도 한도 초과로 오해하지 않게.
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* 오류 응답은 XML·글자로 옵니다 */ }
    if (!json?.response?.body) {
      if (res.status === 429 || /PER_SECOND/.test(text)) { await sleep(3000 * attempt); continue; }
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS/.test(text)) throw new DailyLimitError("오늘 호출 한도 도달");
      throw new Error(`관광공사 응답 오류 ${res.status} ${text.slice(0, 80)}`);
    }
    const items = json?.response?.body?.items?.item ?? [];
    return Array.isArray(items) ? items : items ? [items] : [];
  }
  throw new Error("관광공사 호출 제한(초당)");
}

/** 관광공사에 등록된 음식점(39)·숙박(32) 전체 목록 */
async function fetchKorList(contentTypeId: number): Promise<KorItem[]> {
  const out: KorItem[] = [];
  for (let pageNo = 1; pageNo <= 40; pageNo++) {
    const items = await call("areaBasedList2", `numOfRows=1000&pageNo=${pageNo}&contentTypeId=${contentTypeId}&arrange=A`);
    out.push(...(items as KorItem[]));
    if (items.length < 1000) break;
    await sleep(150);
  }
  return out;
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** 관광공사 글의 <br>·태그를 걷어 내고 줄바꿈으로 */
export function cleanKorText(raw: unknown): string | undefined {
  const text = String(raw ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return text && text !== "-" && text !== "없음" ? text.slice(0, 300) : undefined;
}

/**
 * 관광공사 영업시간 글 다듬기 — "- 09:00~21:00- 마지막 주문 20:30", "[평일] - 17:30~22:30 - 마지막 주문 21:30 [주말] …" 처럼
 * 줄표로 이어 붙인 글을 줄바꿈으로 나눕니다. "09:00 - 20:00" 같은 시간 범위의 줄표는 그대로 둡니다.
 */
export function tidyKorHours(raw: string): string {
  return raw
    .replace(/^\s*-\s*/, "")
    .replace(/\]\s*-\s*/g, "] ")
    .replace(/\s*-\s*(?=[가-힣\[(])/g, "\n")
    .replace(/(?<=\S)\s*(?=\[[^\]]{1,12}\])/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** 우리 분류 → 관광공사 유형(39 음식점 / 32 숙박 / 12 관광지 / 14 문화시설 / 28 레포츠 / 38 쇼핑). 해당 없으면 null */
export type KorType = 39 | 32 | 12 | 14 | 28 | 38;
export function korTypeFor(category: string | null | undefined): KorType | null {
  const c = category ?? "";
  if (/음식점|식당|카페|제과|베이커리|주점|맛집/.test(c)) return 39;
  if (/숙박|펜션|호텔|리조트|민박|글램핑|캠핑|한옥|게스트하우스|모텔/.test(c)) return 32;
  if (/박물관|미술관|문화|전시|도서관|공연/.test(c)) return 14;
  if (/레포츠|체험|스포츠|낚시|승마/.test(c)) return 28;
  if (/여행지|관광지|명소|해수욕장|휴양림|수목원/.test(c)) return 12;
  if (/쇼핑|용품|매장|마트|의류|잡화|화장품|안경|시장/.test(c)) return 38;
  return null;
}

const CELL = 100; // 약 1km 격자
const cellKey = (lat: number, lng: number) => `${Math.floor(lat * CELL)}:${Math.floor(lng * CELL)}`;

/** 같은 가게 찾기 — 확실하지 않으면 null(틀린 정보가 빈칸보다 나쁩니다) */
export function matchKorItem(place: { name: string; lat: number; lng: number }, grid: Map<string, KorItem[]>): KorItem | null {
  const baseLat = Math.floor(place.lat * CELL), baseLng = Math.floor(place.lng * CELL);
  const found: { item: KorItem; score: number; d: number }[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const item of grid.get(`${baseLat + i}:${baseLng + j}`) ?? []) {
      const d = km(place.lat, place.lng, Number(item.mapy), Number(item.mapx));
      if (d > EXACT_NAME_KM) continue;
      const score = nameScore(place.name, item.title);
      if (score >= 3 || (score >= 2 && d <= NEAR_KM)) found.push({ item, score, d });
    }
  }
  if (found.length === 0) return null;
  const best = Math.max(...found.map((f) => f.score));
  const top = found.filter((f) => f.score === best).sort((a, b) => a.d - b.d);
  // 같은 점수의 후보가 둘 이상이고 서로 다른 가게면(체인점 등) 가장 가까운 것이 확실히 가까울 때만
  if (top.length > 1 && top[1].d - top[0].d < 0.05) return null;
  return top[0].item;
}

function introFields(typeId: number, intro: Record<string, unknown>): { h?: string; c?: string; p?: string; t?: string; m?: string } {
  if (typeId === 39) {
    return { h: cleanKorText(intro.opentimefood), c: cleanKorText(intro.restdatefood), p: cleanKorText(intro.parkingfood), t: cleanPhone(String(intro.infocenterfood ?? "")) ?? undefined, m: cleanKorText(intro.firstmenu) };
  }
  if (typeId !== 32) {
    // 관광지(12)는 꼬리말 없이, 문화시설·레포츠·쇼핑은 유형 이름이 붙은 칸에 들어 있습니다
    const suffix = typeId === 14 ? "culture" : typeId === 28 ? "leports" : typeId === 38 ? "shopping" : "";
    const hours = typeId === 38 ? intro.opentime : intro[`usetime${suffix}`];
    return { h: cleanKorText(hours), c: cleanKorText(intro[`restdate${suffix}`]), p: cleanKorText(intro[`parking${suffix}`]), t: cleanPhone(String(intro[`infocenter${suffix}`] ?? "")) ?? undefined };
  }
  const inOut = [cleanKorText(intro.checkintime) && `입실 ${cleanKorText(intro.checkintime)}`, cleanKorText(intro.checkouttime) && `퇴실 ${cleanKorText(intro.checkouttime)}`].filter(Boolean).join(" / ");
  return { h: inOut || undefined, p: cleanKorText(intro.parkinglodging), t: cleanPhone(String(intro.infocenterlodging ?? "")) ?? undefined };
}

/**
 * 빈칸이 있는 음식점·카페·숙소를 관광공사 목록과 맞춰 상세 정보를 받아 둡니다.
 * 정해진 시간(maxMs) 안에서 아직 확인하지 않은 곳부터. 매주 한 번(/api/cron/daily?only=kor) 돕니다.
 */
export async function runKorEnrich(places: Place[], maxMs: number): Promise<{ targets: number; checked: number; matched: number; filledHours: number; left: number; stopped?: string }> {
  const startedAt = Date.now();
  if (!process.env.TOUR_API_KEY) return { targets: 0, checked: 0, matched: 0, filledHours: 0, left: 0, stopped: "공공데이터포털 키 없음" };
  const fills = { ...(await loadKorFill(true)) };
  const due = Date.now() - RECHECK_MS;
  const targets = places.filter((p) => {
    if (!korTypeFor(p.category) || !p.name || p.lat == null || p.lng == null) return false;
    if (!(isBlank(p.hours) || isBlank(p.closed_days) || isBlank(p.parking) || isBlank(p.phone) || p.image_url === DEFAULT_IMAGE)) return false;
    const done = fills[String(p.id)];
    return !done || done.at < due;
  });
  if (targets.length === 0) return { targets: 0, checked: 0, matched: 0, filledHours: 0, left: 0 };

  const grids = new Map<number, Map<string, KorItem[]>>();
  let stopped: string | undefined;
  try {
    for (const typeId of [...new Set(targets.map((p) => korTypeFor(p.category) as number))]) {
      const grid = new Map<string, KorItem[]>();
      for (const item of await fetchKorList(typeId)) {
        const lat = Number(item.mapy), lng = Number(item.mapx);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue;
        const key = cellKey(lat, lng);
        const list = grid.get(key);
        if (list) list.push(item); else grid.set(key, [item]);
      }
      grids.set(typeId, grid);
    }
  } catch (e) {
    return { targets: targets.length, checked: 0, matched: 0, filledHours: 0, left: targets.length, stopped: e instanceof Error ? e.message : "목록을 받지 못함" };
  }

  let checked = 0, matched = 0, filledHours = 0, next = 0, sinceSave = 0;
  const worker = async () => {
    while (next < targets.length && Date.now() - startedAt < maxMs && !stopped) {
      const p = targets[next++];
      const typeId = korTypeFor(p.category) as number;
      const item = matchKorItem({ name: p.name, lat: Number(p.lat), lng: Number(p.lng) }, grids.get(typeId)!);
      checked++;
      if (!item) { fills[String(p.id)] = { n: 1, at: Date.now() }; continue; }
      try {
        const [intro] = await call("detailIntro2", `contentId=${item.contentid}&contentTypeId=${typeId}`);
        const f = introFields(typeId, (intro ?? {}) as Record<string, unknown>);
        const image = item.firstimage && /^Type[13]$/.test(item.cpyrhtDivCd ?? "") ? item.firstimage.replace(/^http:\/\//, "https://") : undefined;
        const phone = f.t ?? cleanPhone(item.tel) ?? undefined;
        fills[String(p.id)] = { ...(f.h ? { h: f.h } : {}), ...(f.c ? { c: f.c } : {}), ...(f.p ? { p: f.p } : {}), ...(phone ? { t: phone } : {}), ...(image ? { i: image } : {}), ...(f.m ? { m: f.m } : {}), at: Date.now() };
        matched++;
        if (f.h) filledHours++;
      } catch (e) {
        if (e instanceof DailyLimitError) { stopped = e.message; next--; break; }
        // 잠깐 실패한 곳은 다음 실행으로 미룹니다(기록하지 않음)
      }
      await sleep(60);
      if (++sinceSave >= 200) { sinceSave = 0; await saveKorFill(fills); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await saveKorFill(fills);
  return { targets: targets.length, checked, matched, filledHours, left: Math.max(0, targets.length - next), ...(stopped ? { stopped } : {}) };
}
