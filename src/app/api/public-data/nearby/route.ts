import { NextRequest, NextResponse } from "next/server";
import { getMergedPublicDataPlaces } from "@/lib/publicDataAggregate";
import { haversineKm } from "@/lib/geo";
import { compactPlace, DEFAULT_CENTER, TILE_CACHE_CONTROL } from "@/lib/mapTile";

export const runtime = "nodejs";

// ⚠ 렌더링 성능 개선(공공데이터 지역 필터링): 예전에는 이 3개 소스(관광공사·식약처·
// 문화정보원, 문화시설만 21,000여 건)를 브라우저가 매번 전량 내려받아 전국 규모
// JSON을 파싱+중복제거했습니다 — 화면엔 어차피 사용자 주변 몇십~몇백 곳만 보이는데
// 말입니다. lat/lng 컬럼이 text라(문자열 비교라 부등호 비교가 부정확) Supabase
// 쿼리 단계에서 바로 거리 필터링을 걸 수 없어서, 서버(이 라우트)가 대신 전량을
// 받아 반경 필터링까지 마친 "이미 걸러진" 결과만 클라이언트로 내려줍니다 —
// 21,000여 건을 부산-서울 왕복시키던 것을, 사용자 반경 안 수십~수백 건만
// 오가도록 줄이는 게 핵심입니다. lat/lng 없이 호출하면(위치를 아직 모를 때)
// 예전과 동일하게 전국 데이터를 반환합니다(하위 호환 폴백).
//
// 병합·중복제거 로직 자체는 src/lib/publicDataAggregate.ts로 옮겼습니다 —
// /api/public-data/place/[id](장소 상세페이지 단건 조회)도 같은 병합 결과가
// 필요해서, 같은 모듈 메모리 캐시를 공유하도록 공용화했습니다.

const MAX_RADIUS_KM = 50;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // ⚠ searchParams.get()은 파라미터가 없으면 null을 반환하는데, Number(null)은
  // NaN이 아니라 0입니다 — lat/lng 없이 호출했을 때 (0,0)(기니만, 한국과 무관한
  // 좌표)으로 필터링돼버려서 전국 폴백이 아니라 "결과 0건"이 나오는 버그가
  // 있었습니다. 파라미터가 실제로 있는지부터 먼저 확인합니다.
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  // 반경 상한 — 예전엔 radiusKm=1000처럼 넣으면 전국 3만 곳(약 17MB)이 통째로 내려가, 반복 호출만으로
  // 서버 전송량·비용을 크게 늘릴 수 있었습니다. 앱은 40km를 쓰므로 50km까지만 허용합니다.
  const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(0.1, Number(searchParams.get("radiusKm")) || 40));

  const merged = await getMergedPublicDataPlaces();

  // ⚠ 트래픽: 예전에는 위치 없이 부르면 전국 3만 곳(압축해도 2.4MB)을 통째로 내려줬습니다 — 위치 권한을
  // 주지 않은 첫 방문자마다 이만큼을 받았습니다. 이제는 기준점(서울시청) 주변만 내려줍니다.
  const hasPoint = latParam != null && lngParam != null && Number.isFinite(Number(latParam)) && Number.isFinite(Number(lngParam));
  const lat = hasPoint ? Number(latParam) : DEFAULT_CENTER.lat;
  const lng = hasPoint ? Number(lngParam) : DEFAULT_CENTER.lng;

  const nearby = merged.filter((p) => {
    const pLat = parseFloat(p.lat);
    const pLng = parseFloat(p.lng);
    if (isNaN(pLat) || isNaN(pLng)) return false;
    return haversineKm(lat, lng, pLat, pLng) <= radiusKm;
  });

  // 브라우저는 칸 단위 주소로 요청하므로(src/lib/mapTile.ts) 같은 동네의 요청은 CDN이 대신 응답합니다.
  // 관리자가 장소를 숨기거나 정보를 고쳐도 이 시간(약 5분)만큼은 예전 내용이 보일 수 있습니다.
  // 지도·목록에 필요한 값만 가볍게 보냅니다(브라우저가 expandPlace로 되돌려 씁니다).
  return NextResponse.json(nearby.map(compactPlace), { headers: { "Cache-Control": TILE_CACHE_CONTROL } });
}
