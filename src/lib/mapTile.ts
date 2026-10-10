// src/lib/mapTile.ts
//
// 지도 데이터(공공데이터 장소·공원)를 "칸 단위"로 요청하기 위한 공용 규칙(브라우저·서버 공용).
//
// 예전에는 내 정확한 좌표(예: 35.871432, 128.601455)로 요청해서 사람마다 주소가 달랐고, 그래서 캐시가
// 전혀 되지 않아 지도를 열 때마다 서버 함수가 실행됐습니다(방문자가 늘수록 비용이 그대로 늘어나는 구조).
// 좌표를 0.1도 칸(약 11km × 9km)의 가운데로 맞춰 요청하면 같은 동네 사람들은 같은 주소를 쓰게 되고,
// CDN이 응답을 대신 돌려줘서 서버 함수가 거의 실행되지 않습니다.
//
// 칸 가운데는 내 위치에서 최대 약 7km 떨어질 수 있으므로, 반경 30km를 받아 "내 위치 기준 약 23km"를 보장합니다.
// (예전에는 40km를 받았는데, 서울에서는 그것만으로 1만 5천 곳·9MB였습니다. 화면 목록은 10km 안, 추천은 거리 감점이
//  10km에서 이미 최대라 23km면 충분하고, 지도를 더 멀리 끌면 그 지역 칸을 추가로 받습니다 — KakaoMap의 VIEW_REGION_*.)

/** 칸 크기(도) */
export const TILE_DEG = 0.1;
/** 칸 가운데 기준으로 받는 반경(km) */
export const TILE_RADIUS_KM = 30;
/** 위치를 모를 때 쓰는 기준점 — 지도 첫 화면과 같은 서울시청. 예전에는 이때 전국 데이터(압축 2.4MB)를 통째로 받았습니다. */
export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

/** 좌표를 칸 가운데 값으로 맞춥니다(소수 첫째 자리). */
export function snapToTile(lat: number, lng: number): { lat: number; lng: number } {
  const snap = (v: number) => Math.round(v / TILE_DEG) * TILE_DEG;
  return { lat: Number(snap(lat).toFixed(1)), lng: Number(snap(lng).toFixed(1)) };
}

/** 요청에 붙일 주소 뒷부분 — 같은 칸이면 항상 같은 글자가 됩니다(캐시 키). */
export function tileQuery(lat?: number | null, lng?: number | null): string {
  const base = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : DEFAULT_CENTER;
  const tile = snapToTile(base.lat, base.lng);
  return `lat=${tile.lat.toFixed(1)}&lng=${tile.lng.toFixed(1)}&radiusKm=${TILE_RADIUS_KM}`;
}

// ── 전송량 줄이기: 목록용 "가벼운 장소" ──
// 지도·목록에 필요 없는 값은 빼고 보냅니다. 빈 값(null), 모든 장소가 같은 값(source), 기본 그림 주소,
// 상세 화면에서만 쓰는 긴 안내문(memo)·출처 번호(sourceId)를 빼면 전송량이 절반쯤으로 줄어듭니다.
// 상세 화면은 장소 하나를 따로 받아 오므로(/api/public-data/place/[id]) 거기서는 전부 보입니다.
const DEFAULT_IMAGE = "/images/default-place.png";
export const PLACE_KEYS = ["id", "name", "category", "address", "lat", "lng", "pet_zone", "hours", "large_dog", "treatable_animals", "phone", "website", "closed_days", "parking", "entry_fee", "image_url", "created_at"] as const;

/** 서버: 보낼 때 가볍게 줄입니다. */
export function compactPlace(place: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PLACE_KEYS) {
    const value = place[key];
    if (value == null || value === "") continue;
    if (key === "image_url" && value === DEFAULT_IMAGE) continue;
    // 좌표는 소수 6자리(약 10cm)면 충분합니다.
    out[key] = (key === "lat" || key === "lng") && typeof value === "string" && value.length > 10 ? Number(value).toFixed(6) : value;
  }
  return out;
}

/** 브라우저: 받은 뒤 원래 모양으로 되돌립니다(빠진 값은 null, 기본 그림·출처 표시 복원). */
export function expandPlace(place: Record<string, unknown>): Record<string, unknown> {
  // ⚠ 속도: 지도를 열 때 장소 1만여 곳에 대해 실행됩니다. 키를 하나씩 돌며 채우던 것을 한 번에 쓰는 모양으로 바꿨습니다
  // (같은 결과, 몇 배 빠름). PLACE_KEYS에 항목을 더하면 여기에도 더해야 합니다 — 빠뜨리면 mapTile.test.ts가 알려 줍니다.
  const p = place;
  return {
    memo: null, source: "public-data",
    id: p.id ?? null, name: p.name ?? null, category: p.category ?? null, address: p.address ?? null,
    lat: p.lat ?? null, lng: p.lng ?? null, pet_zone: p.pet_zone ?? null, hours: p.hours ?? null,
    large_dog: p.large_dog ?? null, treatable_animals: p.treatable_animals ?? null, phone: p.phone ?? null,
    website: p.website ?? null, closed_days: p.closed_days ?? null, parking: p.parking ?? null,
    entry_fee: p.entry_fee ?? null, image_url: p.image_url ?? DEFAULT_IMAGE, created_at: p.created_at ?? null,
  };
}

/** CDN 캐시 지시 — 5분 동안은 캐시를 그대로 쓰고, 그 뒤 하루까지는 일단 캐시를 주면서 뒤에서 새로 받아 둡니다. */
export const TILE_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
