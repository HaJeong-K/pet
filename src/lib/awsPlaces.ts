// lib/awsPlaces.ts
// AWS(DynamoDB + Lambda) GET /places 결과를 기존 Supabase places 스키마 형태로 변환합니다.
// place_id(문자열, 예: "busan-0001")는 기존 코드가 전제하는 숫자 id와 타입이 달라서
// 충돌하지 않는 범위(900000+)의 숫자로 변환해 사용합니다.
// 이 방식은 place_id 끝자리 숫자를 그대로 쓰므로, DynamoDB의 항목 순서가 바뀌어도
// 같은 장소는 항상 같은 id를 갖습니다(링크 공유 시에도 안전).

const AWS_ID_OFFSET = 900000;

// 공공데이터엔 사진이 없어서, public/images/default-place.png 에 넣어둔
// 같이가개 기본 이미지를 대신 채워 넣습니다.
export const DEFAULT_PLACE_IMAGE = "/images/default-place.png";

function toNumericId(placeId: string): number {
  const match = placeId.match(/(\d+)$/);
  const num = match ? parseInt(match[1], 10) : 0;
  return AWS_ID_OFFSET + num;
}

export async function fetchAwsPlaces(): Promise<any[]> {
  const apiUrl = process.env.NEXT_PUBLIC_AWS_PLACES_API;
  if (!apiUrl) return [];

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) return [];
    const raw: any[] = await res.json();

    return raw.map((item) => ({
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
  } catch (e) {
    console.error("AWS places fetch 실패:", e);
    return [];
  }
}