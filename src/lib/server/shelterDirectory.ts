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

import { parseOpenApiItems, type ShelterNotice } from "@/lib/shelterNotices";

const API_URL = "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2";
const PAGE_SIZE = 1000;
const MAX_PAGES = 8;
/** 최근 며칠 동안의 공고로 목록을 만들지 */
const LOOKBACK_DAYS = 20;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 60 * 60 * 1000;
/** 마감이 이 날수 이하로 남으면 "마감 임박" */
const URGENT_DAYS = 3;

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
export type ShelterNoticeBrief = Pick<ShelterNotice, "desertionNo" | "noticeNumber" | "region" | "subRegion" | "breed" | "imageUrl" | "daysLeft">;

type Built = { list: ShelterEntry[]; notices: Map<string, ShelterNoticeBrief[]> };

let cache: ({ at: number } & Built) | null = null;
let pending: Promise<Built> | null = null;

function encodeKey(key: string): string {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
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
      const kind = String(it.upKindNm ?? "");
      if (kind === "개") entry.dogs++; else if (kind === "고양이") entry.cats++; else entry.others++;
      if (notice.daysLeft <= URGENT_DAYS) entry.urgent++;
      const brief: ShelterNoticeBrief = { desertionNo: notice.desertionNo, noticeNumber: notice.noticeNumber, region: notice.region, subRegion: notice.subRegion, breed: notice.breed, imageUrl: notice.imageUrl, daysLeft: notice.daysLeft };
      notices.set(id, [...(notices.get(id) ?? []), brief]);
    }
    if (items.length < PAGE_SIZE) break;
  }
  for (const list of notices.values()) list.sort((a, b) => a.daysLeft - b.daysLeft);
  const list = [...byId.values()].sort((a, b) => a.sido.localeCompare(b.sido, "ko") || a.sigungu.localeCompare(b.sigungu, "ko") || a.name.localeCompare(b.name, "ko"));
  return { list, notices };
}

async function load(): Promise<Built> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (!pending) {
    pending = build()
      .then((built) => { if (built.list.length > 0) cache = { at: Date.now(), ...built }; return built; })
      .catch((e) => { console.error("[shelterDirectory] 목록을 만들지 못했습니다:", e instanceof Error ? e.message : e); return cache ?? { list: [], notices: new Map() }; })
      .finally(() => { pending = null; });
  }
  return pending;
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
