// src/lib/server/shelterDirectory.ts
//
// 전국 동물보호센터 목록(서버 전용) — "보호소·후원" 화면(/shelter-notices/support)과 보호센터별 화면에서 씁니다.
//
// 따로 보호소 목록 API를 쓰지 않고, 이미 쓰고 있는 유기동물 공고 API(abandonmentPublic_v2)의 최근 공고를 모아
// 보호소별로 묶습니다(공고마다 보호소 이름·전화·관할 지역이 들어 있음). 그래서 "지금 공고가 올라와 있는 보호소"만 나옵니다.
//
// ⚠ 주소는 일부러 담지 않습니다. 정부 사이트에 공개된 정보이긴 하지만, 보호소를 한눈에 찾는 화면에 주소·지도를 붙이면
// 동물을 버리려는 사람이 가까운 보호소를 찾기 쉬워집니다. 여기서는 지역(시·군·구)과 전화만 보여 줍니다.
// (입양하러 찾아가야 하는 공고 상세 화면에는 주소가 그대로 있습니다.)

import { redactSecrets } from "@/lib/redact";
import { gunzipSync, gzipSync } from "node:zlib";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseOpenApiItems, type ShelterNotice } from "@/lib/shelterNotices";

const API_URL = "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2";
const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
/** 최근 며칠 동안의 공고로 목록을 만들지 */
const LOOKBACK_DAYS = 20;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const SNAPSHOT_BUCKET = "public-data-cache";
const SNAPSHOT_PATH = "shelter-directory-v1.json.gz";
/** 마감이 이 날수 이하로 남으면 "마감 임박" */
export const URGENT_DAYS = 3;

export type ShelterEntry = {
  id: string;
  name: string;
  /** 시·도(예: "경상북도") */
  sido: string;
  /** 시·군·구(예: "구미시"). 없으면 빈 글자 */
  sigungu: string;
  tel: string;
  /** 지금 보호 중이고 공고 기간이 남은 아이 수 */
  protecting: number;
  dogs: number;
  cats: number;
  others: number;
  /** 그중 마감이 URGENT_DAYS일 이하로 남은 수 */
  urgent: number;
};

/** 목록 카드에 필요한 공고 값(ShelterNoticeCard와 같은 모양) */
export type ShelterNoticeBrief = Pick<ShelterNotice, "desertionNo" | "noticeNumber" | "region" | "subRegion" | "breed" | "imageUrl" | "daysLeft"> & {
  /** 종류 — 보호센터 화면에서 골라 보는 데 씁니다 */
  kind: "dog" | "cat" | "other";
};

type Built = { list: ShelterEntry[]; notices: Map<string, ShelterNoticeBrief[]> };
type Cached = Built & { at: number };

let cache: Cached | null = null;
let refreshing: Promise<Cached | null> | null = null;
let loading: Promise<Cached> | null = null;

function encodeKey(key: string): string {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

// ── 묶은 결과 보관(Supabase Storage) ──
// 공고 4,500여 건을 받아 묶는 데 6~8초가 걸립니다. 예전에는 서버가 새로 뜰 때마다(메모리가 비어 있을 때마다) 이 일을
// 방문자가 기다리는 동안 했습니다. 이제는 묶은 결과를 파일로 보관해 두고 0.3초 안팎에 읽어 옵니다.
// 오래됐으면(1시간) 일단 그 결과를 보여 주고, 응답을 보낸 뒤에 새로 만들어 바꿔 둡니다.
// 정부 공공데이터라 보관해 두고 쓰는 데 제약이 없습니다(주소는 여전히 담지 않습니다).
function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function readSnapshot(): Promise<Cached | null> {
  try {
    const { data, error } = await storage().storage.from(SNAPSHOT_BUCKET).download(SNAPSHOT_PATH);
    if (error || !data) return null;
    const json = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8"));
    if (!Array.isArray(json?.list) || json.list.length === 0) return null;
    return { at: Number(json.builtAt) || 0, list: json.list, notices: new Map(Object.entries(json.notices ?? {})) as Map<string, ShelterNoticeBrief[]> };
  } catch (e) {
    console.error("[shelterDirectory] 보관해 둔 목록을 읽지 못했습니다:", redactSecrets(e));
    return null;
  }
}

async function writeSnapshot(built: Cached): Promise<void> {
  try {
    const client = storage();
    await client.storage.createBucket(SNAPSHOT_BUCKET, { public: false }).catch(() => {});
    const body = gzipSync(Buffer.from(JSON.stringify({ builtAt: built.at, list: built.list, notices: Object.fromEntries(built.notices) })));
    const { error } = await client.storage.from(SNAPSHOT_BUCKET).upload(SNAPSHOT_PATH, body, { upsert: true, contentType: "application/gzip" });
    if (error) console.error("[shelterDirectory] 목록을 보관하지 못했습니다:", error.message);
  } catch (e) {
    console.error("[shelterDirectory] 목록을 보관하지 못했습니다:", redactSecrets(e));
  }
}

async function build(): Promise<Built> {
  const key = process.env.ANIMAL_OPEN_API_KEY;
  if (!key) throw new Error("ANIMAL_OPEN_API_KEY 환경변수가 없습니다.");
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const bgnde = ymd(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
  const endde = ymd(new Date());

  const byId = new Map<string, ShelterEntry>();
  const notices = new Map<string, ShelterNoticeBrief[]>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = `serviceKey=${encodeKey(key)}&bgnde=${bgnde}&endde=${endde}&pageNo=${page}&numOfRows=${PAGE_SIZE}&_type=json`;
    const res = await fetch(`${API_URL}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`공고 API 응답 오류 ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const header = json?.response?.header;
    if (header && header.resultCode !== "00") throw new Error(`공고 API 오류 ${header.resultCode}`);
    const raw = json?.response?.body?.items?.item;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const it of items) {
      const name = String(it.careNm ?? "").trim();
      if (!name) continue;
      const id = String(it.careRegNo ?? "").trim() || name;
      const [sido = "", ...rest] = String(it.orgNm ?? "").trim().split(/\s+/);
      const entry = byId.get(id) ?? { id, name, sido, sigungu: rest.join(" "), tel: String(it.careTel ?? "").trim(), protecting: 0, dogs: 0, cats: 0, others: 0, urgent: 0 };
      byId.set(id, entry);
      // 지금 보호 중이고 공고 기간이 남은 아이만 셉니다(입양·반환 등으로 끝난 공고는 제외).
      if (!/보호중/.test(String(it.processState ?? ""))) continue;
      const notice = parseOpenApiItems([it])[0];
      if (!notice || notice.daysLeft < 0) continue;
      entry.protecting++;
      const kindName = String(it.upKindNm ?? "");
      const kind: ShelterNoticeBrief["kind"] = kindName === "개" ? "dog" : kindName === "고양이" ? "cat" : "other";
      if (kind === "dog") entry.dogs++; else if (kind === "cat") entry.cats++; else entry.others++;
      if (notice.daysLeft <= URGENT_DAYS) entry.urgent++;
      const brief: ShelterNoticeBrief = { desertionNo: notice.desertionNo, noticeNumber: notice.noticeNumber, region: notice.region, subRegion: notice.subRegion, breed: notice.breed, imageUrl: notice.imageUrl, daysLeft: notice.daysLeft, kind };
      notices.set(id, [...(notices.get(id) ?? []), brief]);
    }
    if (items.length < PAGE_SIZE) break;
  }
  for (const list of notices.values()) list.sort((a, b) => a.daysLeft - b.daysLeft);
  const list = [...byId.values()].sort((a, b) => a.sido.localeCompare(b.sido, "ko") || a.sigungu.localeCompare(b.sigungu, "ko") || a.name.localeCompare(b.name, "ko"));
  return { list, notices };
}

/** 새로 만들어 메모리와 저장소에 반영합니다(동시에 여러 번 돌지 않게 한 번만). 실패하면 null */
function refresh(): Promise<Cached | null> {
  if (!refreshing) {
    refreshing = build()
      .then(async (built) => {
        if (built.list.length === 0) return null;
        const next: Cached = { at: Date.now(), ...built };
        cache = next;
        await writeSnapshot(next);
        return next;
      })
      .catch((e) => { console.error("[shelterDirectory] 목록을 만들지 못했습니다:", redactSecrets(e)); return null; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/** 응답을 보낸 뒤에 새로 만듭니다(방문자를 기다리게 하지 않음) */
function refreshLater() {
  try { after(() => refresh()); } catch { void refresh(); }
}

async function load(): Promise<Cached> {
  const fresh = (c: Cached) => Date.now() - c.at < CACHE_TTL_MS;
  if (cache) {
    if (!fresh(cache)) refreshLater(); // 오래됐어도 일단 보여 주고 뒤에서 새로
    return cache;
  }
  if (!loading) {
    loading = (async () => {
      const saved = await readSnapshot();
      if (saved) {
        cache = saved;
        if (!fresh(saved)) refreshLater();
        return saved;
      }
      // 보관해 둔 것이 아예 없을 때(처음 한 번)만 기다리며 만듭니다.
      return (await refresh()) ?? { at: 0, list: [], notices: new Map() };
    })().finally(() => { loading = null; });
  }
  return loading;
}

/** 전국 보호소 목록. 1시간 동안 기억하고, 새로 받기에 실패하면 직전 목록을 그대로 돌려줍니다. */
export async function getShelterDirectory(): Promise<ShelterEntry[]> {
  return (await load()).list;
}

/** 보호센터 한 곳과 그곳에서 지금 보호 중인 아이들의 공고(마감 임박순). 없으면 null */
export async function getShelterWithNotices(id: string): Promise<{ shelter: ShelterEntry; notices: ShelterNoticeBrief[] } | null> {
  const built = await load();
  const shelter = built.list.find((entry) => entry.id === id);
  return shelter ? { shelter, notices: built.notices.get(id) ?? [] } : null;
}
