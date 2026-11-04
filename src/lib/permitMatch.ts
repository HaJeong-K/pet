// src/lib/permitMatch.ts
//
// 공공데이터 장소 ↔ 행정안전부 지방행정 인허가 기록 맞추기(순수 함수 — 서버 작업은 src/lib/server/permitEnrich.ts).
// 틀린 전화번호가 들어가는 것이 빈칸보다 나쁘므로, "같은 가게가 확실할 때만" 맞춥니다.
//   · 우리 장소의 분류로 볼 인허가 업종을 정합니다(동물병원 → 동물병원, 카페 → 휴게음식점 등).
//   · 같은 도로명·건물번호(그리고 같은 시·군·구)의 기록 중 가게 이름이 같거나 한쪽이 다른 쪽을 포함하는 것만 후보입니다.
//   · 후보가 여럿인데 전화번호가 서로 다르면(같은 건물의 다른 가게일 수 있음) 아무것도 고르지 않습니다.
//   · 영업 중 기록이 있으면 그것을, 없을 때만 폐업·휴업 기록을 씁니다(같은 자리에 같은 이름으로 다시 연 경우).

/** 인허가 데이터 종류 → 공공데이터포털 주소 이름(https://apis.data.go.kr/1741000/{이름}/info) */
export const PERMIT_PATHS = {
  hospital: "animal_hospitals", pharmacy: "animal_pharmacies", grooming: "pet_grooming", exhibition: "animal_exhibition", boarding: "animal_boarding",
  restaurant: "general_restaurants", cafe: "rest_cafes", bakery: "bakeries",
  lodging: "lodgings", tourLodging: "tourist_accommodations", homestay: "rural_homestays", pension: "tourist_pensions", hanok: "hanok_experience",
} as const;
export type PermitKind = keyof typeof PERMIT_PATHS;

/** 우리 장소 분류(와 이름)로 찾아볼 인허가 업종 — 앞쪽부터 찾습니다. 맞는 업종이 없으면 빈 목록 */
export function permitKindsFor(category: string | null | undefined, name = ""): PermitKind[] {
  const c = category ?? "";
  if (/동물병원/.test(c)) return ["hospital"];
  if (/동물약국/.test(c)) return ["pharmacy"];
  if (/미용/.test(c)) return ["grooming"];
  if (/위탁|호텔|유치원/.test(c)) return ["boarding"];
  if (/제과/.test(c)) return ["bakery", "cafe"];
  if (/휴게음식점|카페/.test(c)) return /애견|펫|강아지|댕댕|도그|dog|pet/i.test(name) ? ["exhibition", "cafe", "restaurant"] : ["cafe", "restaurant"];
  if (/일반음식점|음식점|식당/.test(c)) return ["restaurant", "cafe"];
  if (/펜션/.test(c)) return ["pension", "homestay", "lodging"];
  if (/한옥/.test(c)) return ["hanok", "homestay"];
  if (/숙박|호텔|리조트|민박|글램핑/.test(c)) return ["lodging", "tourLodging", "homestay", "pension", "hanok"];
  return [];
}

export type PermitRecord = { BPLC_NM?: string; ROAD_NM_ADDR?: string; LOTNO_ADDR?: string; SALS_STTS_CD?: string; TELNO?: string; CLSBIZ_YMD?: string };
export type PermitStatus = "open" | "suspended" | "closed";
export type PermitMatch = { name: string; phone: string | null; status: PermitStatus; closedOn: string | null };

const squash = (text: string) => text.replace(/\(.*?\)/g, "").replace(/[\s,()·.\-_'"&]/g, "").toLowerCase();
/** 업종 꼬리말(동물병원·애견미용 등)은 빼고 비교합니다 — "행복동물병원"과 "행복"이 같은 가게로 보이도록 */
const core = (text: string) => squash(text).replace(/(동물병원|동물약국|약국|애견미용|펫미용|미용실|애견호텔|애견카페|카페|커피|베이커리|제과|식당|펜션|민박|호텔)$/u, "");

/** 이름이 같으면 3, 업종 꼬리말을 뺀 이름이 같거나 한쪽이 다른 쪽을 포함하면(세 글자 이상) 2, 아니면 0 */
export function nameScore(ours: string, theirs: string): number {
  const a = squash(ours), b = squash(theirs);
  if (!a || !b) return 0;
  if (a === b) return 3;
  const ca = core(ours), cb = core(theirs);
  if (ca.length >= 2 && ca === cb) return 2;
  // 한쪽이 다른 쪽을 포함할 때는 포함된 쪽이 세 글자 이상이어야 합니다("우리"처럼 흔한 두 글자로 엉뚱한 가게를 고르지 않게)
  if ((cb.length >= 3 && a.includes(cb)) || (ca.length >= 3 && b.includes(ca))) return 2;
  if (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) return 2;
  return 0;
}

/** 전화번호를 0으로 시작하는 숫자·하이픈 모양으로. 번호가 아니면 null */
export function cleanPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 8 && /^1[5-9]/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`; // 1588-0000 같은 대표번호
  if (d.length < 9 || d.length > 12 || !d.startsWith("0") || /^0+$/.test(d)) return null;
  if (d.startsWith("02")) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

const statusOf = (code: string | undefined): PermitStatus => (code === "01" ? "open" : code === "02" ? "suspended" : "closed");

/**
 * 같은 주소(이미 걸러 온) 후보 중에서 우리 가게를 고릅니다. 확실하지 않으면 null.
 * minScore: 주소로 찾은 후보는 2(포함), 이름으로만 찾은 후보는 3(완전히 같은 이름)
 */
export function pickPermit(ourName: string, candidates: PermitRecord[], minScore = 2): PermitMatch | null {
  const scored = candidates.map((c) => ({ c, score: nameScore(ourName, c.BPLC_NM ?? "") })).filter((x) => x.score >= minScore);
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((x) => x.score));
  let top = scored.filter((x) => x.score === best).map((x) => x.c);
  const open = top.filter((c) => c.SALS_STTS_CD === "01");
  if (open.length > 0) top = open;
  // 남은 후보끼리 전화번호가 다르면 어느 가게인지 확신할 수 없습니다
  const phones = new Set(top.map((c) => cleanPhone(c.TELNO)).filter(Boolean));
  if (phones.size > 1) return null;
  const pick = top[0];
  const status = statusOf(pick.SALS_STTS_CD);
  return { name: pick.BPLC_NM ?? "", phone: cleanPhone(top.map((c) => c.TELNO).find((t) => cleanPhone(t)) ?? null), status, closedOn: status === "closed" ? pick.CLSBIZ_YMD || null : null };
}
