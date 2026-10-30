// src/lib/storeCategories.ts
//
// 쇼핑 입점(포장 주문·매장 식사)을 받을 수 있는 가게 종류 — 카페·식당·디저트·반려동물 수제 간식 등 먹거리와 용품 가게.
// 공원·동물병원·약국·미용·숙소는 해당하지 않아 입점 안내도 보이지 않습니다.

const ELIGIBLE = /카페|커피|디저트|베이커리|제과|빵|브런치|음식|식당|레스토랑|한식|양식|일식|중식|분식|주점|펍|간식|펫푸드|반려동물용품/;
const EXCLUDED = /공원|병원|약국|미용|호텔|펜션|숙|캠핑|글램핑|리조트/;

export function isStoreEligibleCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return ELIGIBLE.test(category) && !EXCLUDED.test(category);
}
