import { NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";
import { approvedPartnerIds } from "@/lib/server/lodgingStore";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { isLodgingCategory } from "@/lib/ownerKind";
import { petPolicySummary, type PetSize } from "@/lib/lodgingRules";

// GET /api/lodging/list — 숙소 탭(/stay)에 보여 줄 전국 반려동물 동반 숙소
//   · 공공데이터(관광공사·문화정보원)의 숙박·펜션 등 + 직접 등록된 장소 중 숙소 분류
//   · 같이가개에서 바로 예약할 수 있는 숙소(사장님이 객실을 올린 곳)는 최저가·객실 수·동반 조건 요약을 함께
// 가까운 순 정렬·검색·필터는 화면에서 합니다(이 응답은 누구에게나 같아서 CDN이 잠깐 대신 응답할 수 있게).

export const revalidate = 300;

type Item = {
  id: number; name: string; category: string | null; address: string | null; lat: number | null; lng: number | null;
  image: string | null; phone: string | null; largeDog: boolean | null;
  bookable: boolean; minPrice: number | null; roomCount: number; petSummary: string | null; petSizes: PetSize[];
};

const LODGING_PATTERNS = ["숙박", "숙소", "펜션", "호텔", "리조트", "모텔", "민박", "게스트", "캠핑", "글램핑", "스테이", "풀빌라", "한옥"];
const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET() {
  const headers = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" };
  try {
    const [publicPlaces, own] = await Promise.all([
      getMergedPublicDataPlaces().catch(() => [] as any[]),
      db.from("places").select("id, name, category, address, lat, lng, image_url, phone, large_dog")
        .or(LODGING_PATTERNS.map((w) => `category.ilike.%${w}%`).join(",")).limit(3000),
    ]);
    const items = new Map<number, Item>();
    const add = (p: any) => {
      const id = Number(p.id);
      if (!Number.isFinite(id) || !isLodgingCategory(p.category) || items.has(id)) return;
      items.set(id, {
        id, name: p.name, category: p.category ?? null, address: p.address ?? null, lat: num(p.lat), lng: num(p.lng),
        image: p.image_url ?? null, phone: p.phone ?? null, largeDog: p.large_dog ?? null,
        bookable: false, minPrice: null, roomCount: 0, petSummary: null, petSizes: [],
      });
    };
    for (const p of own.data ?? []) add(p);
    for (const p of publicPlaces) add(p);

    // 바로 예약 가능한 숙소(판매 중인 객실이 있는 곳)
    // 입점 승인된 숙소만 "바로 예약"(입점 표가 아직 없으면 모두)
    const allOwn = (own.data ?? []).map((p) => Number(p.id));
    const approved = await approvedPartnerIds(allOwn);
    const ownIds = approved ? allOwn.filter((id) => approved.has(id)) : allOwn;
    if (ownIds.length) {
      const [rooms, profiles] = await Promise.all([
        db.from("lodging_rooms").select("place_id, base_price, images").in("place_id", ownIds).eq("is_active", true),
        db.from("lodging_profiles").select("place_id, pet_species, pet_sizes, max_pet_weight_kg, max_pets, pet_fee").in("place_id", ownIds),
      ]);
      for (const r of rooms.data ?? []) {
        const item = items.get(Number(r.place_id));
        if (!item) continue;
        item.bookable = true;
        item.roomCount += 1;
        item.minPrice = item.minPrice == null ? r.base_price : Math.min(item.minPrice, r.base_price);
        if (!item.image && Array.isArray(r.images) && r.images[0]) item.image = r.images[0];
      }
      for (const p of profiles.data ?? []) {
        const item = items.get(Number(p.place_id));
        if (!item) continue;
        item.petSizes = (p.pet_sizes ?? []) as PetSize[];
        item.petSummary = petPolicySummary({ pet_species: p.pet_species ?? [], pet_sizes: p.pet_sizes ?? [], max_pet_weight_kg: p.max_pet_weight_kg == null ? null : Number(p.max_pet_weight_kg), max_pets: p.max_pets, pet_fee: p.pet_fee });
        if (item.petSizes.includes("large")) item.largeDog = true;
      }
    }
    return NextResponse.json({ items: [...items.values()].filter((i) => i.lat != null && i.lng != null) }, { headers });
  } catch (e) {
    console.error("[/api/lodging/list] failed:", e);
    return NextResponse.json({ items: [] });
  }
}
