// src/lib/geo.ts
//
// 좌표 관련 순수 계산 헬퍼. routeRecommend.ts에 있던 haversineKm을 이쪽으로 옮겨서,
// 공공데이터 지역 필터링(publicDataPlaces.ts, parkPlaces.ts)에서도 같은 거리 계산
// 로직을 재사용합니다(계산식이 두 곳에 따로 존재하면 나중에 한쪽만 고쳐 값이
// 어긋나는 사고가 나기 쉽습니다).

/** 두 좌표 사이의 직선거리(km, haversine 공식). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
