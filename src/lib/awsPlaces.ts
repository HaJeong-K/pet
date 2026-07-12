// lib/awsPlaces.ts
// AWS(DynamoDB + Lambda) GET /places 결과를 기존 Supabase places 스키마 형태로 변환합니다.
// place_id(문자열, 예: "seoul-0001")는 기존 코드가 전제하는 숫자 id와 타입이 달라서
// 충돌하지 않는 범위(900000+)의 숫자로 변환해 사용합니다.
// place_id는 "지역코드-지역별순번" 형식이라 지역코드까지 반영해서 변환합니다
// (지역코드를 무시하고 끝자리 순번만 쓰면, 모든 지역의 "-0001"이 전부 같은 숫자가 되어
//  마커를 눌렀을 때 엉뚱한 장소가 뜨는 버그가 생깁니다 — 실제로 겪었던 문제).

const AWS_ID_OFFSET = 900000;

// place_id 접두사(지역코드) → 슬롯 번호. 지역마다 100,000칸씩 떨어뜨려서
// 어느 지역도 순번이 100,000건을 넘지 않는 한 절대 겹치지 않게 합니다.
// (전국 데이터 전처리 때 쓴 지역코드와 반드시 동일해야 합니다 — community/page.tsx의 BOARDS와도 일치)
const REGION_SLOT: Record<string, number> = {
  busan: 0, seoul: 1, gyeonggi: 2, incheon: 3, gangwon: 4,
  chungbuk: 5, chungnam: 6, daejeon: 7, gyeongbuk: 8, daegu: 9,
  ulsan: 10, gyeongnam: 11, jeonbuk: 12, jeonnam: 13, gwangju: 14,
  jeju: 15, sejong: 16,
};
const UNKNOWN_REGION_SLOT = 99; // 위 목록에 없는 새 지역코드가 생기면 여기로 몰림 (경고 로그로 바로 티나게)

// 공공데이터엔 사진이 없어서, public/images/default-place.png 에 넣어둔
// 같이가개 기본 이미지를 대신 채워 넣습니다.
export const DEFAULT_PLACE_IMAGE = "/images/default-place.png";

// ── 메모리 캐시: API Gateway/Lambda 콜드 스타트로 인한 지연을 줄이기 위해
// 60초 이내 재요청은 네트워크 호출 없이 캐시된 값을 즉시 반환합니다.
let cachedPlaces: any[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

// 문자열을 32bit 정수로 해시 — 정규식에 안 맞는 place_id가 여럿 있어도
// fallback id가 전부 같아지지 않도록 구분해줍니다.
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toNumericId(placeId: string): number {
  // "지역코드-순번"(예: busan-0001) 또는 "지역코드-카테고리-순번"(예: busan-vet-90147) 둘 다 지원
  const match = placeId.match(/^([a-z]+)-(?:([a-z]+)-)?(\d+)$/);
  if (!match) {
    console.warn(`[awsPlaces] place_id 형식이 예상과 다릅니다: "${placeId}"`);
    // 형식이 안 맞는 것들끼리도 겹치지 않도록 문자열 해시를 더함
    return AWS_ID_OFFSET + UNKNOWN_REGION_SLOT * 100000 + (hashString(placeId) % 100000);
  }

  const [, region, category, seqStr] = match;
  const seq = parseInt(seqStr, 10);

  if (region in REGION_SLOT === false) {
    console.warn(`[awsPlaces] 등록되지 않은 지역코드 "${region}" (place_id: "${placeId}") — REGION_SLOT에 추가해주세요.`);
  }
  const regionSlot = REGION_SLOT[region] ?? UNKNOWN_REGION_SLOT;

  // "vet" 같은 카테고리가 붙어있으면 같은 지역 안에서도 별도 서브슬롯으로 분리해
  // 일반 장소 순번과 절대 겹치지 않게 합니다. (카테고리 없으면 서브슬롯 0 = 기본 장소)
  const categorySlot = category ? (hashString(category) % 50) + 1 : 0;
  const slot = regionSlot * 100 + categorySlot;

  return AWS_ID_OFFSET + slot * 100000 + seq;
}

export async function fetchAwsPlaces(): Promise<any[]> {
  const apiUrl = process.env.NEXT_PUBLIC_AWS_PLACES_API;
  if (!apiUrl) return [];

  // 캐시가 유효하면 네트워크 호출 없이 바로 반환
  // (API Gateway/Lambda 콜드 스타트 지연을 줄이기 위해 60초간 재사용)
  if (cachedPlaces && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPlaces;
  }

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) return cachedPlaces ?? [];
    const raw: any[] = await res.json();

    const mapped = raw.map((item) => ({
      id: toNumericId(item.place_id),
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
      image_url: item.image_url || DEFAULT_PLACE_IMAGE,
      // 리스트 정렬용 — 실제 등록일이 없으니 현재 시각으로 채움(신규 장소 패널에서 밀리지 않게)
      created_at: item.created_at ?? new Date().toISOString(),
      source: "aws" as const,
    }));

    cachedPlaces = mapped;
    cachedAt = Date.now();
    return mapped;
  } catch (e) {
    console.error("AWS places fetch 실패:", e);
    return cachedPlaces ?? [];
  }
}