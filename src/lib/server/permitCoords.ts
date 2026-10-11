// src/lib/server/permitCoords.ts
//
// 음식점의 지도 좌표를 "행정안전부 지방행정 인허가 데이터"에서 찾습니다(서버 전용).
//
// 식품안전나라의 반려동물 동반 음식점 목록에는 주소만 있고 좌표가 없습니다. 주소 → 좌표 변환 서비스들은
// 결과를 저장하지 못하게 하거나(브이월드·카카오), 좌표를 인터넷에 표시하거나 해외 서버에 두지 못하게 해서
// (행정안전부 주소 좌표 API의 신청 조건) 쓸 수 없었습니다. 인허가 데이터는 공공데이터포털이 직접 제공하고
// 이용허락범위에 제한이 없으며, 음식점마다 좌표가 이미 들어 있습니다 — 변환 없이 "같은 주소의 인허가 기록"을
// 찾아 그 좌표를 씁니다.
//
//  · 일반음식점  https://apis.data.go.kr/1741000/general_restaurants/info
//  · 휴게음식점  https://apis.data.go.kr/1741000/rest_cafes/info
//  · 제과점영업  https://apis.data.go.kr/1741000/bakeries/info
// 좌표는 중부원점TM(EPSG:5174)이라 지도에서 쓰는 위도·경도(WGS84)로 바꿉니다.
// 키는 공공데이터포털 계정 키(관광공사 데이터에 쓰는 것과 같은 키)입니다.
import proj4 from "proj4";

const EPSG5174 = "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";

/** 인허가 데이터의 좌표(EPSG:5174) → 위도·경도. 우리나라 범위를 벗어나면 null */
export function tm5174ToWgs84(x: number, y: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;
  const [lng, lat] = proj4(EPSG5174, "WGS84", [x, y]);
  if (!(lat > 32 && lat < 39.5 && lng > 124 && lng < 132.5)) return null;
  return { lat, lng };
}

const SERVICE_PATHS = { general: "general_restaurants", cafe: "rest_cafes", bakery: "bakeries" } as const;
type ServiceKey = keyof typeof SERVICE_PATHS;

/** 업종 이름에 맞는 서비스부터 찾아봅니다(못 찾으면 나머지도). */
export function serviceOrder(category: string): ServiceKey[] {
  const first: ServiceKey = /제과/.test(category) ? "bakery" : /휴게|카페|커피/.test(category) ? "cafe" : "general";
  return [first, ...(Object.keys(SERVICE_PATHS) as ServiceKey[]).filter((k) => k !== first)];
}

const squash = (text: string) => text.replace(/[\s,()·.\-]/g, "").toLowerCase();

/**
 * 주소에서 "도로명 + 건물번호"를 뽑습니다. 예: "경상북도 안동시 풍천면 수호로 59, 1층" → { road: "수호로", number: "59" }
 * "중앙로 12번길 5" 같은 주소는 road가 "중앙로 12번길"이 됩니다. 도로명주소가 아니면 null
 */
export function roadPart(address: string): { road: string; number: string } | null {
  const text = address.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const match = /([가-힣A-Za-z0-9·.]+(?:로|길)(?:\s?\d+번?[가나다라마바사]?길)?)\s*(\d+(?:-\d+)?)(?![번\d])/.exec(text);
  return match ? { road: match[1], number: match[2] } : null;
}

/** 주소 앞부분의 시·군·구(예: "안동시", "수성구") — 다른 지역의 같은 도로명과 헷갈리지 않게 확인하는 데 씁니다. */
export function districtOf(address: string): string | null {
  const tokens = address.replace(/\(.*?\)/g, " ").split(/\s+/).filter(Boolean);
  // 첫 낱말은 시·도. 그 뒤에서 시·군·구로 끝나는 마지막 낱말(예: "수원시 팔달구"면 "팔달구")
  let found: string | null = null;
  for (const token of tokens.slice(1, 4)) if (/(시|군|구)$/.test(token)) found = token;
  return found;
}

type PermitRow = { BPLC_NM?: string; ROAD_NM_ADDR?: string; CRD_INFO_X?: string; CRD_INFO_Y?: string; SALS_STTS_CD?: string };

async function query(service: ServiceKey, cond: string, value: string, key: string): Promise<PermitRow[]> {
  // 포털 키는 이미 주소용으로 바뀐(인코딩된) 모양으로 발급됩니다 — 그대로 붙입니다.
  const url = `https://apis.data.go.kr/1741000/${SERVICE_PATHS[service]}/info?serviceKey=${key}&pageNo=1&numOfRows=100&returnType=json&${encodeURIComponent(`cond[${cond}]`)}=${encodeURIComponent(value)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`인허가 조회 실패 ${res.status}`);
  const json = await res.json().catch(() => null);
  const items = json?.response?.body?.items?.item ?? json?.response?.body?.items ?? [];
  return Array.isArray(items) ? items : items ? [items] : [];
}

export type PermitCoord = { lat: string; lng: string; matchedName: string; by: "address" | "name" };

/**
 * 음식점 하나의 좌표를 인허가 데이터에서 찾습니다. 못 찾으면 null.
 * ① 같은 "도로명 + 건물번호"의 인허가 기록(같은 시·군·구)을 찾습니다 — 좌표는 건물 단위라, 같은 주소면 가게 이름이
 *    조금 달라도 위치는 같습니다. 그중 이름이 가장 비슷하고 영업 중인 기록을 고릅니다.
 * ② 주소로 못 찾으면 가게 이름으로 찾아, 같은 시·군·구에 있는 기록을 씁니다.
 */
export async function findPermitCoord(row: { name: string; address: string; category: string }, key: string): Promise<PermitCoord | null> {
  const road = roadPart(row.address);
  const district = districtOf(row.address);
  const wantName = squash(row.name);
  const districtOk = (candidate: PermitRow) => !district || squash(candidate.ROAD_NM_ADDR ?? "").includes(squash(district));
  const pick = (candidates: PermitRow[], by: "address" | "name"): PermitCoord | null => {
    const scored = candidates
      .map((c) => ({ c, coord: tm5174ToWgs84(Number(c.CRD_INFO_X), Number(c.CRD_INFO_Y)), name: squash(c.BPLC_NM ?? "") }))
      .filter((x) => x.coord)
      .map((x) => ({ ...x, score: (x.name === wantName ? 4 : x.name.includes(wantName) || wantName.includes(x.name) ? 2 : 0) + (x.c.SALS_STTS_CD === "01" ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    // 이름으로 찾은 경우에는 이름이 실제로 비슷해야 합니다(같은 이름의 다른 가게를 잘못 고르지 않게).
    if (!best || (by === "name" && best.score < 2)) return null;
    return { lat: best.coord!.lat.toFixed(6), lng: best.coord!.lng.toFixed(6), matchedName: best.c.BPLC_NM ?? "", by };
  };

  for (const service of serviceOrder(row.category)) {
    if (road) {
      const want = squash(`${road.road}${road.number}`);
      const rows = await query(service, "ROAD_NM_ADDR::LIKE", `${road.road} ${road.number}`, key);
      // "수호로 59"로 찾으면 "수호로 590"도 섞여 나오므로, 번호 바로 뒤가 숫자가 아닌 것만 남깁니다.
      const same = rows.filter((c) => {
        const addr = squash((c.ROAD_NM_ADDR ?? "").replace(/\(.*?\)/g, " "));
        const at = addr.indexOf(want);
        return at >= 0 && !/\d/.test(addr[at + want.length] ?? "") && districtOk(c);
      });
      const found = pick(same, "address");
      if (found) return found;
    }
    const byName = (await query(service, "BPLC_NM::LIKE", row.name.replace(/\(.*?\)/g, " ").trim(), key)).filter(districtOk);
    const found = pick(byName, "name");
    if (found) return found;
  }
  return null;
}

/** 공공데이터포털 계정 키(따로 정해 두지 않았으면 관광공사 데이터에 쓰는 키와 같습니다) */
export const permitApiKey = () => process.env.PERMIT_API_KEY || process.env.TOUR_API_KEY || "";
