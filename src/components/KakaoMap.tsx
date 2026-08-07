"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";
import { fetchAllRows } from "@/lib/supabasePaging";
import { calculateRecommendScore } from "@/lib/recommend";
import { getPetZoneLabel } from "@/lib/placeConstants";
import { openPlaceDetail as openPlaceDetailShared } from "@/lib/openPlace";
import { trackEvent } from "@/lib/analytics";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LocateFixed, Share, MapPin, MapPinPlus, Pencil,
  ZoomIn, ZoomOut, Link, Upload, MessageCircle, PawPrint, X,
  Search, Bot, List,
} from "lucide-react";

// 리스트/신규 장소/추천 장소 패널이 겹치지 않고 화면 폭에 비례해 배치되도록 하는 기준선.
// 이보다 좁은 화면(모바일 세로, 웹 분할화면 등)에서는 리스트·신규·추천 패널을 동시에
// 펼치지 않고 하나씩만(토글) 보여줍니다 — 세 패널을 동시에 다 펼치기엔 가로 폭이
// 부족해서 그대로 두면 서로 겹치거나 화면 밖으로 밀려납니다.
const NARROW_BREAKPOINT = "(max-width: 720px)";

declare global {
  interface Window {
    kakao: any;
    selectPlace: (id: number) => void;
  }
}

const PET_ZONE_EMOJI: Record<string, string> = {
  indoor: "🏠",
  terrace: "🌿",
  both: "🏡",
};

// ── 카테고리 기반 이모지 (pet_zone과 무관하게 category로 결정되는 장소용)
const CATEGORY_EMOJI: Record<string, string> = {
  "동물병원": "🏥",
  "동물약국": "💊",
};

const getPlaceEmoji = (place: any) =>
  CATEGORY_EMOJI[place?.category] || PET_ZONE_EMOJI[place?.pet_zone] || null;

const getPlaceLabel = (place: any) =>
  CATEGORY_EMOJI[place?.category]
    ? place.category
    : getPetZoneLabel(place?.pet_zone);

// ── 지역 검색: 하드코딩 좌표표 없이 Kakao 주소 검색 API에
// 흔한 행정구역 접미사를 순서대로 붙여가며 물어봐서 전국 어디든 커버합니다.
const REGION_SUFFIXES = [
  "광역시",
  "특별시",
  "특별자치시",
  "특별자치도",
  "도",
  "시",
  "군",
  "구",
];

const tryKakaoAddressSearch = async (
  query: string
): Promise<{ lat: number; lng: number } | null> => {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) return null;

    const lat = parseFloat(doc.y);
    const lng = parseFloat(doc.x);
    if (isNaN(lat) || isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
};

const searchRegionAndMoveMap = async (
  query: string,
  mapInstance: any
): Promise<{ lat: number; lng: number } | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 이미 행정구역 접미사(시/도/군/구/읍/면/동)로 끝나면 그대로 한 번만 시도
  const alreadyHasSuffix = /(시|도|군|구|읍|면|동)$/.test(trimmed);
  const candidates = alreadyHasSuffix
    ? [trimmed]
    : [trimmed, ...REGION_SUFFIXES.map((suf) => `${trimmed}${suf}`)];

  for (const candidate of candidates) {
    const result = await tryKakaoAddressSearch(candidate);
    if (result) {
      mapInstance.setCenter(new window.kakao.maps.LatLng(result.lat, result.lng));
      // "OO구 OO동"처럼 세부 단위면 좁게, 시/도 단위면 넓게
      const isDetailed = /\s/.test(trimmed) || /(동|읍|면)$/.test(trimmed);
      mapInstance.setLevel(isDetailed ? 5 : 8);
      return result;
    }
  }

  return null;
};

const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── 특정 좌표를 중심으로 "반경 radiusKm" 정도가 화면에 보이도록 지도 범위를 잡는 헬퍼 ──
// 예전에는 setCenter()로 중심만 옮기고 확대 레벨은 그대로 뒀는데(초기 level:4는 실제로
// 반경 1km 남짓만 보여서), 리스트 패널이 참고하는 mapBounds(화면에 보이는 사각형)도
// 그만큼 좁아져 "5km 이내" 장소 상당수가 화면 밖으로 밀려나 리스트에 안 뜨는 문제가
// 있었습니다. setCenter 대신 setBounds로 위경도 기준 반경 5km 사각 범위를 직접 지정하면,
// 카카오맵이 그 범위가 다 보이도록 확대 레벨을 자동으로 계산해줘서 정확히 "5km 이내"가
// 화면(및 리스트)에 들어옵니다.
const boundsAroundKm = (lat: number, lng: number, radiusKm: number) => {
  const latDelta = radiusKm / 111; // 위도 1도 ≈ 111km
  const lngDelta = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))); // 경도는 위도에 따라 보정
  const sw = new window.kakao.maps.LatLng(lat - latDelta, lng - lngDelta);
  const ne = new window.kakao.maps.LatLng(lat + latDelta, lng + lngDelta);
  return new window.kakao.maps.LatLngBounds(sw, ne);
};

const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    const region = data.documents?.[0];
    if (region) return region.region_2depth_name || "";
  } catch {}
  return "";
};

export default function KakaoMap() {
  const router = useRouter();

  // ── 장소 상세로 이동: 동물병원·동물약국은 새 창(팝업)으로, 그 외는 기존 인앱 모달로
  const openPlaceDetail = (place: any) => openPlaceDetailShared(router, place);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const [session, setSession] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [wideView, setWideView] = useState(false);
  const savedLevelRef = useRef<number>(4);

  // ── 마커: Map 객체로 관리 (증분 업데이트) — 상세 pill 마커(CustomOverlay)용
  const markerMapRef = useRef<Map<number, any>>(new Map());
  // ── 클러스터링용: 넓은 줌에서 쓰는 경량 Marker + MarkerClusterer
  const clustererRef = useRef<any>(null);
  const clusterMarkersRef = useRef<any[]>([]);
  // ── 현위치 오버레이
  const locationOverlayRef = useRef<any>(null);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userRegion, setUserRegion] = useState<string>("");
  // ── 검색으로 지도를 이동시켰을 때의 중심 좌표 (리스트 패널 반경 기준 우선순위: 검색 > 실제 위치)
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  // ── 현재 지도 화면(뷰포트)의 경계. 지도를 드래그/확대·축소할 때마다 갱신되고,
  // 리스트 패널(nearbyPlaces)이 고정 반경 대신 "지금 화면에 보이는 영역"을 기준으로
  // 장소를 보여주는 데 씁니다.
  const [mapBounds, setMapBounds] = useState<{ swLat: number; swLng: number; neLat: number; neLng: number } | null>(null);

  // ── 검색: 입력값 / 디바운스값 분리 (새로고침해도 마지막 검색어 유지)
  // ⚠️ 서버 렌더링 시점엔 localStorage가 없으므로 항상 빈 문자열로 시작해야
  //   서버/클라이언트 첫 렌더가 일치합니다 (hydration mismatch 방지).
  //   저장된 검색어는 아래 useEffect에서 마운트 이후에 반영합니다.
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // 마운트 이후(클라이언트에서만)에 저장된 검색어 복원
  useEffect(() => {
    const saved = localStorage.getItem("ggk_search_query");
    if (saved) setSearchQuery(saved);
  }, []);

  // 300ms 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 관리자 통계 분석 탭의 "검색어 추이" 계산용 — 실제로 입력을 멈춘 검색어만 기록
  useEffect(() => {
    if (debouncedSearch.trim().length >= 2) {
      trackEvent("search", { query: debouncedSearch.trim() });
    }
  }, [debouncedSearch]);

  // (검색 시 지도 이동 로직은 nameSearchResults가 정의된 아래쪽으로 옮겼습니다 —
  // 가게명 매칭 결과를 우선 확인해야 하기 때문입니다. 관련 useEffect는 하단 참고.)

  const createUserProfile = async (user: any) => {
    if (!user) return;
    const { data: existingUser } = await supabase
      .from("users").select("*").eq("auth_user_id", user.id).maybeSingle();
    if (existingUser) {
      const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        user.user_metadata?.profile_image || null;
      await supabase.from("users").update({ avatar_url: avatarUrl }).eq("auth_user_id", user.id);
      return;
    }
    const nickname =
      user.user_metadata?.full_name ||
      user.user_metadata?.preferred_username ||
      user.user_metadata?.nickname ||
      user.user_metadata?.name ||
      user.identities?.[0]?.identity_data?.name ||
      user.email?.split("@")[0] || "사용자";
    const avatarUrl =
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      user.user_metadata?.profile_image || null;
    const { error } = await supabase.from("users").upsert([
      { auth_user_id: user.id, email: user.email || "", nickname, avatar_url: avatarUrl },
    ], { onConflict: "auth_user_id" });
    if (error) console.error("유저 프로필 생성 오류:", JSON.stringify(error));
  };

  const selectPlaceRef = useRef<(id: number) => void>(() => {});
  const [places, setPlaces] = useState<any[]>([]);
  const [selectedPetZone, setSelectedPetZone] = useState("all");
  const [showRecommendPanel, setShowRecommendPanel] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
  const [showRecentPanel, setShowRecentPanel] = useState(false);

  // ── 반응형: 리스트/신규 장소/추천 장소 패널이 화면 폭에 맞게 겹치지 않도록.
  // 좁은 화면(모바일 세로, 분할화면 등)에서는 리스트 패널을 기본으로 숨기고 토글로만
  // 보여주며, 신규/추천 패널을 열면 리스트 패널은 자동으로 닫힙니다(반대도 마찬가지).
  // 넓은 화면에서는 예전처럼 리스트 패널이 항상 보입니다.
  const isNarrowScreen = useMediaQuery(NARROW_BREAKPOINT);
  const [showListPanelMobile, setShowListPanelMobile] = useState(false);
  const showListPanel = !isNarrowScreen || showListPanelMobile;

  // ── 플로팅 헤더 실제 높이를 측정해서, 리스트/신규/추천 패널과 "넓게 둘러보기" 버튼의
  // 상단 위치를 여기에 맞춥니다. 헤더는 화면이 좁아지면 검색창·필터·버튼이 줄바꿈되며
  // 키(높이)가 늘어나는데, 예전처럼 top 값을 고정 px(122px)로 박아두면 헤더가 늘어난
  // 만큼 패널들이 헤더 뒤에 가려지거나 겹치는 문제가 있었습니다.
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(112);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h) setHeaderHeight(Math.ceil(h));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 넓은 화면(예전부터 쓰던 데스크톱 레이아웃)에서는 원래 고정값(122px)을 그대로 쓰고,
  // 좁은 화면(반응형 대상)에서만 실제 측정한 헤더 높이를 씁니다. 헤더 자체는 넓은
  // 화면에서도 약간 줄바꿈될 수 있어 measuredHeight가 122px 기준과 미묘하게 달라질 수
  // 있는데, 그 오차가 리스트/넓게보기 버튼 위치를 예전과 다르게 보이게 했습니다.
  const panelTop = isNarrowScreen ? `${headerHeight + 12}px` : "122px";

  selectPlaceRef.current = (id: number) => {
    const found = places.find((p) => p.id === id);
    if (found) setSelectedPlace(found);
  };

  const getButtonStyle = (type: string) => ({
    padding: "4px 9px",
    fontSize: "11px",
    borderRadius: "999px",
    border: "none",
    fontWeight: "600" as const,
    cursor: "pointer",
    background:
      selectedPetZone === type
        ? "linear-gradient(135deg, #1a1a1a, #333)"
        : "rgba(245,246,248,0.95)",
    color: selectedPetZone === type ? "white" : "#444",
    boxShadow:
      selectedPetZone === type
        ? "0 1px 6px rgba(0,0,0,0.22)"
        : "0 1px 3px rgba(0,0,0,0.07)",
    whiteSpace: "nowrap" as const,
    transition: "all 0.15s ease",
    fontFamily: "'Noto Sans KR', sans-serif",
  });

  // ── 초기 데이터 로드
  // ⚠ 최적화: 예전엔 (세션 확인 + DB places + 관광공사/식약처/문화정보원 공공데이터 3종)를
  // Promise.all로 한 번에 묶어서, 그중 가장 느린 것(특히 관광공사 실시간 API 호출)이 끝날
  // 때까지 지도에 마커가 "하나도" 안 뜨고 있었습니다. 최종 데이터는 동일하게 다 합쳐지지만,
  // 두 단계로 나눠서: 1) 세션 확인 + 우리 DB places(작고 빠름)를 먼저 fetch해서 즉시 화면에
  // 반영하고, 2) 공공데이터(느리고 큰 3종)는 별도로 이어서 fetch해 도착하는 대로 places에
  // 합쳐줍니다. 첫 화면에 마커가 뜨기까지 걸리는 시간이 "가장 느린 소스" 기준에서
  // "우리 DB 조회 1번" 기준으로 줄어듭니다.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // AWS(DynamoDB+Lambda) 전국 데이터는 scripts/migrate-aws-to-supabase.mjs로
      // Supabase `places` 테이블에 이관 완료되어, 더 이상 fetchAwsPlaces()를 따로
      // 호출하지 않고 Supabase 조회 한 번으로 통합해서 가져옵니다.
      // ⚠ fetchAllRows를 씁니다 — 그냥 select()만 하면 Supabase가 한 번에 최대 1000행만
      // 돌려줘서, places가 1000건을 넘어가는 순간부터 나머지가 조용히 지도에서 빠집니다.
      const [{ data: { session } }, placesData] = await Promise.all([
        supabase.auth.getSession(),
        fetchAllRows("places", "id, name, lat, lng, pet_zone, category, address, image_url, created_at"),
      ]);
      if (cancelled) return;
      setSession(session);
      setPlaces(placesData || []);
      if (session?.user) await createUserProfile(session.user);
      if ((window as any).Kakao && !(window as any).Kakao.isInitialized()) {
        (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
      }

      // 느린 공공데이터 3종은 별도로 이어서 fetch — 도착하면 기존 DB places 위에 덧붙입니다.
      const publicDataPlaces = await fetchPublicDataPlaces();
      if (cancelled) return;
      setPlaces((prev) => [...prev, ...publicDataPlaces]);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async () => {});
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  // ── 저장된 위치는 "첫 화면을 빠르게 그리기 위한 임시값"으로만 쓰고, 매번 실제 GPS로 갱신
  //
  // ⚠ 예전에는 localStorage에 캐시(user_lat/lng/region)가 한 번이라도 저장되면 그 값을
  // 영구히 신뢰하고 실제 GPS 조회를 아예 건너뛰었습니다. 그 결과 대구에서 처음 위치를
  // 잡아둔 뒤 포항으로 여행을 가서 앱을 열어도, 화면·추천 점수·친화도 점수가 전부 대구
  // 좌표 기준으로 계산되는 문제가 있었습니다("내 위치로" 버튼(moveToMyLocation)을 수동으로
  // 눌러야만 갱신됨). 이제는 캐시가 있으면 지도를 즉시 그 위치로 먼저 그려서 대기 시간을
  // 없애되, 곧바로 실제 GPS를 다시 조회해서 위치가 바뀌었으면(예: 여행) 자동으로 덮어씁니다.
  // recommendedPlaces/nearbyPlaces/친화도 점수는 모두 userLocation을 구독하고 있어서
  // 이 값만 갱신되면 화면 전체가 자동으로 "현재 있는 지역" 기준으로 다시 계산됩니다.
  useEffect(() => {
    const savedLat    = localStorage.getItem("user_lat");
    const savedLng    = localStorage.getItem("user_lng");
    const savedRegion = localStorage.getItem("user_region");

    if (savedLat && savedLng && savedRegion) {
      const lat = parseFloat(savedLat);
      const lng = parseFloat(savedLng);
      setUserLocation({ lat, lng });
      setUserRegion(savedRegion);
      if (mapRef.current) {
        mapRef.current.setBounds(boundsAroundKm(lat, lng, 5));
      }
    }

    // 캐시 유무와 무관하게 항상 최신 GPS 위치를 다시 조회해 갱신(여행지 이동 반영).
    // 권한 거부/조회 실패 시엔 위에서 세팅한 캐시 값이 그대로 유지됩니다.
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setSearchCenter(null); // 실제 위치가 갱신되면 이전 검색 기준 중심은 초기화
        if (mapRef.current) {
          mapRef.current.setBounds(boundsAroundKm(latitude, longitude, 5));
        }
        const region = await reverseGeocode(latitude, longitude);
        setUserRegion(region);
        localStorage.setItem("user_lat", String(latitude));
        localStorage.setItem("user_lng", String(longitude));
        localStorage.setItem("user_region", region);
      },
      () => { /* 조회 실패/거부 — 캐시(있다면)를 그대로 유지 */ }
    );
  }, [mapReady]);

  // ── 현위치 파란 점 오버레이
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userLocation || !window.kakao?.maps) return;

    // 기존 오버레이 제거
    if (locationOverlayRef.current) {
      locationOverlayRef.current.setMap(null);
    }

    const position = new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng);
    const overlay = new window.kakao.maps.CustomOverlay({
      position,
      content: `
        <div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">
          <div style="
            position:absolute;
            width:36px;height:36px;border-radius:50%;
            background:rgba(37,99,235,0.18);
            animation:locationPulse 2s ease-out infinite;
          "></div>
          <div style="
            position:relative;
            width:14px;height:14px;border-radius:50%;
            background:#2563eb;
            border:2.5px solid white;
            box-shadow:0 2px 8px rgba(37,99,235,0.5);
            z-index:1;
          "></div>
        </div>
      `,
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 10,
    });

    overlay.setMap(mapRef.current);
    locationOverlayRef.current = overlay;
  }, [userLocation, mapReady]);

  const hasOpenedRef = useRef(false);
  useEffect(() => {
    const placeId = searchParams.get("placeId");
    if (!placeId || places.length === 0) return;
    if (hasOpenedRef.current) return;
    const found = places.find((p) => String(p.id) === placeId);
    if (found) {
      hasOpenedRef.current = true;
      openPlaceDetail(found);
    }
  }, [searchParams, places]);

  // ── filteredPlaces: debouncedSearch 사용
  //
  // ⚠ 최적화: 예전엔 여기서 userLocation이 바뀔 때마다(캐시 위치 → 실제 GPS → "내
  // 위치로" 클릭 등, 로드 직후에만 2~3번) places 전체(공공데이터 포함 수만 건)를
  // 거리순으로 매번 다시 정렬했습니다. 정렬 1번에 하버사인 거리 계산이 수십만 번
  // 발생해서 메인 스레드가 몇백 ms씩 멈추는 원인이었습니다. 실제로 "거리순 정렬된
  // 결과"가 필요한 곳은 리스트 패널(nearbyPlaces)뿐이고, 그마저도 화면에 보이는
  // 영역(최대 MAX_LIST_ITEMS건)만 정렬하면 충분합니다 — 그래서 정렬은 nearbyPlaces
  // 쪽으로 옮기고, 여기서는 카테고리 필터링만 합니다(수만 건 전체를 매번 정렬하지 않음).
  const filteredPlaces = useMemo(() => {
    if (selectedPetZone === "vet") {
      return places.filter((p) => p.category === "동물병원");
    } else if (selectedPetZone === "pharmacy") {
      return places.filter((p) => p.category === "동물약국");
    } else if (selectedPetZone !== "all") {
      return places.filter((p) => p.pet_zone === selectedPetZone);
    }
    return places;
  }, [places, selectedPetZone]);

  // ── 리스트 패널 전용: 지도를 드래그/확대·축소하면 "지금 화면에 보이는 영역"(mapBounds)
  // 기준으로 갱신됩니다. 지도가 아직 준비되지 않은 아주 짧은 초기 순간에만 예전처럼
  // 검색 좌표 또는 실제 위치 기준 반경 5km로 임시 표시합니다.
  // 너무 축소해서 화면 안에 장소가 수천 개씩 들어오는 경우를 대비해, 기준 좌표(검색
  // 좌표 > 실제 위치 > 화면 중심)에서 가까운 순으로 정렬 후 상위 300개까지만 보여줍니다.
  const MAX_LIST_ITEMS = 300;
  const nearbyPlaces = useMemo(() => {
    // ⚠ 거리순 정렬은 항상 여기(화면/반경으로 이미 좁혀진, 최대 몇백 건짜리 부분집합)에서만
    // 합니다 — filteredPlaces(수만 건일 수 있는 전체 목록)를 통째로 정렬하지 않기 위함입니다.
    const sortByDistance = (list: any[], center: { lat: number; lng: number }) =>
      [...list].sort(
        (a, b) =>
          getDistance(center.lat, center.lng, parseFloat(a.lat), parseFloat(a.lng)) -
          getDistance(center.lat, center.lng, parseFloat(b.lat), parseFloat(b.lng))
      );

    if (!mapBounds) {
      const center = searchCenter || userLocation;
      if (!center) return filteredPlaces;
      const within5km = filteredPlaces.filter((place) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return getDistance(center.lat, center.lng, lat, lng) <= 5;
      });
      return sortByDistance(within5km, center);
    }

    const inView = filteredPlaces.filter((place) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);
      if (isNaN(lat) || isNaN(lng)) return false;
      return (
        lat >= mapBounds.swLat &&
        lat <= mapBounds.neLat &&
        lng >= mapBounds.swLng &&
        lng <= mapBounds.neLng
      );
    });

    const sortCenter =
      searchCenter ||
      userLocation || {
        lat: (mapBounds.swLat + mapBounds.neLat) / 2,
        lng: (mapBounds.swLng + mapBounds.neLng) / 2,
      };

    // ⚠ 지금 보이는 화면 안에 장소가 하나도 없으면(외곽 지역 등) 예전엔 그냥
    // "이 화면에 보이는 장소가 없습니다"만 보여줬습니다. 화면을 살짝만 옮겨도
    // 리스트가 텅 비어버리는 게 불편하다는 피드백이 있어서, 화면 안이 비어 있을
    // 때는 대신 지금 보고 있는 위치(검색 좌표 > 실제 위치 > 화면 중심) 기준
    // 반경 5km 이내 장소를 보여주도록 폴백을 추가했습니다.
    if (inView.length === 0) {
      const within5km = filteredPlaces.filter((place) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return getDistance(sortCenter.lat, sortCenter.lng, lat, lng) <= 5;
      });
      const sortedNearby = sortByDistance(within5km, sortCenter);
      return sortedNearby.length <= MAX_LIST_ITEMS ? sortedNearby : sortedNearby.slice(0, MAX_LIST_ITEMS);
    }

    const sorted = sortByDistance(inView, sortCenter);
    return inView.length <= MAX_LIST_ITEMS ? sorted : sorted.slice(0, MAX_LIST_ITEMS);
  }, [filteredPlaces, userLocation, searchCenter, mapBounds]);

  // ── 가게명 검색 결과: 검색어가 가게명에 일부라도 포함되면 매칭하고, 실제 위치
  // 기준으로 가까운 순으로 정렬합니다. 반경 5km 제한 없이(찾는 가게가 멀리 있어도
  // 나오도록) 전체 매칭 결과를 보여줍니다.
  const nameSearchResults = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return [];
    return [...filteredPlaces]
      .filter((p) => p.name?.toLowerCase().includes(q))
      .sort((a, b) => {
        if (!userLocation) return 0;
        const distA = getDistance(userLocation.lat, userLocation.lng, parseFloat(a.lat), parseFloat(a.lng));
        const distB = getDistance(userLocation.lat, userLocation.lng, parseFloat(b.lat), parseFloat(b.lng));
        return distA - distB;
      });
  }, [filteredPlaces, debouncedSearch, userLocation]);

  // ── 리스트 패널에 실제로 표시할 목록: 가게명 검색 결과가 있으면 그걸 우선,
  // 없으면(검색어가 없거나 지역명 검색인 경우) 기존 반경 기반 목록을 보여줍니다.
  const displayedPlaces = useMemo(() => {
    if (debouncedSearch.trim() && nameSearchResults.length > 0) return nameSearchResults;
    return nearbyPlaces;
  }, [debouncedSearch, nameSearchResults, nearbyPlaces]);

  // ── debouncedSearch 변경 시 지도 이동 + searchCenter 갱신
  // 1순위: 가게명이 일부라도 일치하는 곳이 있으면 그중 가장 가까운 곳을 지도
  //        중심으로 이동시킵니다(실제 위치 기준 거리순 정렬 결과의 맨 앞).
  // 2순위: 이름 매칭이 없으면 기존처럼 지역명(주소) 검색을 시도합니다.
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      // 이미 null이면 다시 set하지 않음 (불필요한 렌더링 방지)
      setSearchCenter((prev) => (prev === null ? prev : null));
      localStorage.removeItem("ggk_search_query");
      return;
    }
    localStorage.setItem("ggk_search_query", debouncedSearch.trim()); // 새로고침 유지용 저장
    if (!mapRef.current || !mapReady) return;

    if (nameSearchResults.length > 0) {
      const nearest = nameSearchResults[0];
      const lat = parseFloat(nearest.lat);
      const lng = parseFloat(nearest.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        mapRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
        mapRef.current.setLevel(5);
        setSearchCenter({ lat, lng });
      }
      return;
    }

    (async () => {
      const center = await searchRegionAndMoveMap(debouncedSearch.trim(), mapRef.current);
      if (center) setSearchCenter(center);
    })();
  }, [debouncedSearch, mapReady, nameSearchResults]);

  // ── AI 추천 장소: 거리 + 현재 선택된 필터 일치도 + 편의시설 + 신규 등록 여부를 종합한
  // Content-Based 스코어링(calculateRecommendScore)으로 정렬한 Top 10. "추천 장소" 우측 패널에서 사용.
  const recommendedPlaces = useMemo(() => {
    const center = searchCenter || userLocation;
    const filterCategory =
      selectedPetZone === "vet" ? "동물병원" : selectedPetZone === "pharmacy" ? "동물약국" : null;

    // ⚠ 최적화: 공공데이터까지 합치면 후보가 전국 수만 건일 수 있는데, 그 전체를 매번
    // 점수 계산 + 정렬하는 건 낭비입니다. recommend.ts의 거리 감점이 10km부터 이미
    // 최대치라 30km 밖 장소가 top10에 들 일은 사실상 없으므로, 점수 계산 전에 위경도
    // 박스(삼각함수 없이 저렴한 1차 필터)로 후보를 넉넉하게 좁혀둡니다. 근처에 후보가
    // 너무 적으면(외곽 지역 등) 전체 목록으로 폴백해 결과가 비어 보이지 않게 합니다.
    let candidates = filteredPlaces;
    if (center) {
      const RADIUS_KM = 30;
      const latDelta = RADIUS_KM / 111;
      const lngDelta = RADIUS_KM / (111 * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
      const nearby = filteredPlaces.filter((place) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return Math.abs(lat - center.lat) <= latDelta && Math.abs(lng - center.lng) <= lngDelta;
      });
      if (nearby.length >= 10) candidates = nearby;
    }

    const scoreOf = (place: any) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);
      const distanceKm =
        center && !isNaN(lat) && !isNaN(lng) ? getDistance(center.lat, center.lng, lat, lng) : null;
      const matchesSelectedFilter =
        selectedPetZone !== "all" &&
        (place.pet_zone === selectedPetZone || (filterCategory && place.category === filterCategory));
      return calculateRecommendScore({
        distanceKm,
        matchesSelectedFilter: !!matchesSelectedFilter,
        largeDog: place.large_dog,
        createdAt: place.created_at,
      });
    };
    return [...candidates]
      .map((place) => ({ place, score: scoreOf(place) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [filteredPlaces, userLocation, searchCenter, selectedPetZone]);

  // ── 지도 초기화 (SDK는 layout.tsx의 <Script>가 이미 불러오는 중 — 여기선 준비될 때까지 대기만 함)
  useEffect(() => {
    window.selectPlace = (id: number) => selectPlaceRef.current(id);
    const initializeMap = () => {
      const container = document.getElementById("map");
      if (!container) return;
      mapRef.current = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(37.5665, 126.978),
        level: 4,
        scrollwheel: true,
        disableDoubleClickZoom: false,
      });
      mapRef.current.setZoomable(true);
      // 초기 level:4는 실제로는 반경 1km 남짓만 보여서, 사용자 위치가 아직 안 잡힌
      // 첫 화면(또는 위치 조회 실패 시)에도 최소 5km 반경은 보이도록 맞춰둡니다.
      // 위치가 확인되면 아래 userLocation 이펙트가 그 위치 기준 5km로 다시 잡습니다.
      mapRef.current.setBounds(boundsAroundKm(37.5665, 126.978, 5));
      setMapReady(true);
    };

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => { initializeMap(); });
      } else {
        // layout.tsx의 Script가 afterInteractive라 아직 로딩 중일 수 있음 — 100ms마다 재확인
        setTimeout(tryInit, 100);
      }
    };
    tryInit();

    return () => { cancelled = true; };
  }, []);

  // ── 줌 레벨 10 이상(넓게 볼 때)이면 클러스터링, 그보다 좁으면 지금까지의 이름표 pill 마커.
  // 카카오맵 레벨은 숫자가 클수록 더 넓게(축소) 보이는 상태입니다.
  // 예전엔 7이었는데, (1) 이름표 pill이 보이는 구간이 좁아서 조금만 축소해도 클러스터
  // 뭉치로 바뀌어버리고 (2) 카카오 SDK 스크립트에 libraries=clusterer 파라미터가 빠져 있어서
  // 클러스터러 자체가 undefined인 채로 7 이상 구간에서 마커가 아예 안 그려지는 버그가
  // 겹쳐 있었습니다. libraries=clusterer는 layout.tsx에서 추가했고, 여기서는 이름표 마커가
  // 보이는 구간(축소 가능 범위) 자체를 10으로 넓혔습니다.
  const CLUSTER_ZOOM_THRESHOLD = 10;

  // ── 줌 레벨에 따라 상세 pill 마커 / 클러스터링 마커를 전환
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;

    const map = mapRef.current;

    // 클러스터러는 한 번만 만들어서 재사용 (libraries=clusterer 파라미터가 SDK 로드 URL에 없으면 undefined)
    if (!clustererRef.current && window.kakao.maps.MarkerClusterer) {
      clustererRef.current = new window.kakao.maps.MarkerClusterer({
        map: null, // 처음엔 지도에 안 붙이고, 모드 전환될 때만 붙임
        averageCenter: true,
        minLevel: CLUSTER_ZOOM_THRESHOLD,
        disableClickZoom: false,
        calculator: [10, 50, 100],
        styles: [
          { width: "34px", height: "34px", background: "rgba(76,110,245,0.85)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "34px", fontSize: "12px", fontWeight: "700" },
          { width: "44px", height: "44px", background: "rgba(59,90,220,0.88)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "44px", fontSize: "13px", fontWeight: "700" },
          { width: "54px", height: "54px", background: "rgba(37,70,190,0.9)",  borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "54px", fontSize: "14px", fontWeight: "700" },
        ],
      });
    }

    const clearDetailMarkers = () => {
      markerMapRef.current.forEach((overlay) => overlay.setMap(null));
      markerMapRef.current.clear();
    };

    const clearClusterMarkers = () => {
      clustererRef.current?.clear();
      clusterMarkersRef.current = [];
    };

    // ── 좁은 줌: 지금까지 쓰던 이름표 pill (CustomOverlay) + 뷰포트 필터링
    const renderDetailMarkers = () => {
      clearClusterMarkers();

      const bounds = map.getBounds();
      clearDetailMarkers();

      filteredPlaces.forEach((place) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const position = new window.kakao.maps.LatLng(lat, lng);
        if (!bounds.contain(position)) return; // 화면 안에 없으면 생성 안 함

        const emoji = getPlaceEmoji(place) || "🐾";
        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content: `
            <div
              onclick="window.selectPlace(${place.id})"
              style="
                background:white;
                border-radius:999px;
                padding:5px 10px;
                font-size:11px;
                font-weight:600;
                font-family:'Noto Sans KR',sans-serif;
                box-shadow:0 2px 6px rgba(0,0,0,0.13);
                cursor:pointer;
                white-space:nowrap;
                user-select:none;
                border:1px solid rgba(0,0,0,0.06);
              "
            >
              ${emoji} ${place.name}
            </div>
          `,
          yAnchor: 1,
          zIndex: 3,
        });

        overlay.setMap(map);
        markerMapRef.current.set(place.id, overlay);
      });
    };

    // ── 넓은 줌: 경량 Marker + MarkerClusterer
    // ⚠ 최적화: 예전엔 filteredPlaces(카테고리 필터만 적용된, 사실상 전국 규모 데이터) 전체를
    // 지도를 팬/줌할 때마다("idle" 이벤트마다) 매번 새 Marker 객체로 다시 만들어서 클러스터러에
    // 넘기고 있었습니다 — 전국 데이터라 조작 한 번마다 수만 개의 Marker를 새로 생성/폐기하는
    // 게 체감 렉의 큰 원인이었습니다. 클러스터러가 화면 경계 부근 클러스터를 정확히 계산하려면
    // 뷰포트 "안"만 넘기면 안 되지만(그러면 경계 근처 클러스터가 깨짐), 전국 전체를 넘길 필요도
    // 없습니다 — 현재 보이는 영역을 상하좌우로 1배씩(총 3배, 9배 면적) 넉넉히 확장한 범위 안의
    // 장소만 넘기면, 이어서 자연스럽게 이어지는 팬/줌 범위는 충분히 커버하면서 매번 만드는
    // Marker 개수는 크게 줄어듭니다. 사용자가 아주 멀리 순간 이동하듯 이동해도 다음 idle에서
    // 다시 계산되므로 결과가 틀리게 남지는 않습니다.
    const renderClusterMarkers = () => {
      clearDetailMarkers();
      clearClusterMarkers();
      if (!clustererRef.current) return; // libraries=clusterer 누락 시 여기서 조용히 중단

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const latPad = ne.getLat() - sw.getLat();
      const lngPad = ne.getLng() - sw.getLng();
      const minLat = sw.getLat() - latPad;
      const maxLat = ne.getLat() + latPad;
      const minLng = sw.getLng() - lngPad;
      const maxLng = ne.getLng() + lngPad;

      const markers = filteredPlaces
        .map((place) => {
          const lat = parseFloat(place.lat);
          const lng = parseFloat(place.lng);
          if (isNaN(lat) || isNaN(lng)) return null;
          if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) return null;

          const marker = new window.kakao.maps.Marker({
            position: new window.kakao.maps.LatLng(lat, lng),
          });
          window.kakao.maps.event.addListener(marker, "click", () => {
            selectPlaceRef.current(place.id);
          });
          return marker;
        })
        .filter(Boolean);

      clustererRef.current.addMarkers(markers);
      clusterMarkersRef.current = markers;
    };

    const updateByZoom = () => {
      const level = map.getLevel();
      if (level >= CLUSTER_ZOOM_THRESHOLD) {
        renderClusterMarkers();
      } else {
        renderDetailMarkers();
      }
    };

    // 지도를 드래그하거나 확대/축소해서 화면이 다시 안정되면(idle) 리스트 패널이
    // 참고할 현재 화면 경계도 함께 갱신합니다 — 리스트가 "지금 보고 있는 지도 영역"을
    // 따라가도록 하기 위함입니다.
    const updateBounds = () => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      setMapBounds({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() });
    };

    updateByZoom();
    updateBounds();

    window.kakao.maps.event.addListener(map, "idle", updateByZoom);
    window.kakao.maps.event.addListener(map, "idle", updateBounds);
    return () => {
      window.kakao.maps.event.removeListener(map, "idle", updateByZoom);
      window.kakao.maps.event.removeListener(map, "idle", updateBounds);
      clearDetailMarkers();
      clearClusterMarkers();
    };
  }, [filteredPlaces, mapReady]);

  const moveToMyLocation = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }
    if (!mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current.setCenter(new window.kakao.maps.LatLng(latitude, longitude));
        mapRef.current.setLevel(3);
        setUserLocation({ lat: latitude, lng: longitude });
        setSearchCenter(null); // 내 위치로 이동하면 검색 기준은 초기화
        setSearchQuery("");
        const region = await reverseGeocode(latitude, longitude);
        setUserRegion(region);
        localStorage.setItem("user_lat", String(latitude));
        localStorage.setItem("user_lng", String(longitude));
        localStorage.setItem("user_region", region);
      },
      () => { alert("위치 정보를 가져올 수 없습니다.\n브라우저 위치 권한을 확인해주세요."); }
    );
  };

  const handleWideView = () => {
    if (!mapRef.current || !window.kakao?.maps) return;
    if (!wideView) {
      savedLevelRef.current = mapRef.current.getLevel();
      mapRef.current.setLevel(Math.min(savedLevelRef.current + 2, 14));
      setWideView(true);
    } else {
      mapRef.current.setLevel(savedLevelRef.current);
      setWideView(false);
    }
  };

  const handleKakaoShare = () => {
    const Kakao = (window as any).Kakao;
    if (!Kakao) { alert("카카오톡 공유를 사용할 수 없습니다."); return; }
    // ⚠ 카카오 SDK 스크립트를 afterInteractive로 늦춰 불렀기 때문에(최적화), 초기
    // 로드 이펙트의 Kakao.init() 호출이 스크립트 로딩보다 먼저 실행돼 건너뛰어졌을
    // 수 있습니다 — 공유 시점에 아직 초기화 전이면 여기서 한 번 더 안전하게 시도합니다.
    if (!Kakao.isInitialized()) Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
    Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: "같이가개",
        description: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
        imageUrl: `${window.location.origin}/icons/header_logo_final.png`,
        link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
      },
    });
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    alert("링크가 복사되었습니다.");
    setShowShareModal(false);
  };

  const handleSnsShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "같이가개",
        text: "나의 가족인 반려동물과 함께 추억을 나눌 장소를 찾아보세요.",
        url: window.location.href,
      });
    } else {
      alert("SNS 공유가 지원되지 않는 브라우저입니다.");
    }
    setShowShareModal(false);
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes tabPop {
          0% { transform: scale(1); }
          50% { transform: scale(0.88); }
          100% { transform: scale(1); }
        }
        .tab-item:active { animation: tabPop 0.18s ease; }

        /* ── 현위치 파동 애니메이션 */
        @keyframes locationPulse {
          0%   { transform: scale(0.8); opacity: 0.9; }
          70%  { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
      `}</style>

      {/* ── 지도 영역 */}
      <div style={{ position: "fixed", inset: 0, width: "100%", height: "100vh", zIndex: 0 }}>
        <div id="map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

        {/* 넓게 둘러보기 버튼 — 지도 위에 떠 있는 가운데 정렬 버튼이라 좁은 화면에서는
            리스트/신규/추천 패널과 자리를 다투다 겹치는 문제가 있었습니다. 좁은 화면에서는
            이 버튼을 지도 위에 띄우지 않고, 아래 헤더의 버튼 줄 안에 똑같은 기능으로
            넣어서(다른 버튼들처럼 flex 흐름을 타므로 절대 겹치지 않음) 대체합니다. */}
        {mapReady && !isNarrowScreen && (
          <button
            onClick={handleWideView}
            className="ggk-body"
            style={{
              position: "absolute",
              top: panelTop,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 5,
              padding: "6px 14px",
              borderRadius: "999px",
              background: wideView ? "linear-gradient(135deg, #2a2a2a, #111)" : "white",
              color: wideView ? "white" : "#111",
              border: wideView ? "none" : "1px solid rgba(0,0,0,0.09)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.18s ease",
            }}
          >
            {wideView ? <><ZoomOut size={13} /> 돌아가기</> : <><ZoomIn size={13} /> 넓게 둘러보기</>}
          </button>
        )}

        {/* 공유 버튼 — 하단 탭바(플로팅 필)는 좁은 화면일수록 폭이 화면 거의 전체(calc(100vw - 28px))로
            늘어나면서 오른쪽 끝이 항상 화면 우측에서 14px 지점까지 옵니다. 이 버튼들이 예전
            위치(96px/42px)에 있으면 좁은 화면에서 탭바 위에 그대로 겹쳐 보였습니다. 탭바
            높이(약 58px) + 여백을 감안해 더 위로 올렸습니다. */}
        <button
          onClick={() => setShowShareModal(true)}
          title="공유하기"
          style={{
            position: "absolute",
            bottom: "144px",
            right: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "none",
            background: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.16)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
          }}
        >
          <Share size={17} color="#444" />
        </button>

        {/* 내 위치 버튼 */}
        <button
          onClick={moveToMyLocation}
          title="내 위치로 이동"
          style={{
            position: "absolute",
            bottom: "90px",
            right: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "none",
            background: "white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.16)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 3px 12px rgba(0,0,0,0.24)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.16)")}
        >
          <LocateFixed size={18} color="#444" />
        </button>

        {/* 마커 클릭 팝업 — 폭을 clamp()로 화면 크기에 비례하게 줄여서, 좁은 화면에서
            오른쪽의 공유·내 위치 버튼과 겹치는 범위를 최소화합니다. */}
        {selectedPlace && (
          <div
            className="ggk-body"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "100px",
              transform: "translateX(-50%)",
              width: isNarrowScreen ? "clamp(220px, 70vw, 290px)" : "290px",
              background: "#ffffff",
              borderRadius: "18px",
              boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
              zIndex: 10,
              overflow: "hidden",
              animation: "fadeUp 0.2s ease",
              border: "1px solid #e8eaed",
            }}
          >
            <style>{`
              @keyframes fadeUp {
                from { opacity: 0; transform: translateX(-50%) translateY(8px); }
                to   { opacity: 1; transform: translateX(-50%) translateY(0); }
              }
            `}</style>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSelectedPlace(null)}
                style={{
                  position: "absolute", top: "8px", right: "8px",
                  width: "26px", height: "26px", borderRadius: "50%",
                  border: "none", background: "rgba(0,0,0,0.45)", color: "white",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", zIndex: 1, fontSize: "13px", lineHeight: 1,
                }}
              >
                <X size={12} color="white" />
              </button>
            </div>
            <div style={{ padding: "13px" }}>
              <div className="ggk-logo" style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
                {selectedPlace.name}
              </div>
              <div style={{ fontSize: "11px", color: "#666", marginTop: "3px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                  {getPlaceEmoji(selectedPlace)
                    ? getPlaceEmoji(selectedPlace)
                    : <PawPrint size={11} color="#888" />}
                </span>{" "}
                {getPlaceLabel(selectedPlace)}
              </div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px", display: "flex", alignItems: "center", gap: "3px" }}>
                <MapPin size={10} color="#bbb" />
                {selectedPlace.address}
              </div>
              <button
                onClick={() => { const p = selectedPlace; setSelectedPlace(null); openPlaceDetail(p); }}
                className="ggk-body"
                style={{
                  marginTop: "10px", width: "100%", padding: "9px",
                  background: "linear-gradient(145deg, #2a2a2a, #111)",
                  color: "white", border: "none", borderRadius: "10px",
                  fontWeight: 600, fontSize: "12px", cursor: "pointer",
                }}
              >
                자세히 보기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 플로팅 헤더 ──
          예전엔 중앙(검색창+필터)을 position:absolute + left:50%로 띄우고 좌측 로고·우측
          버튼들과는 별도 레이어처럼 다뤄서, 화면이 좁아지면(모바일, 분할화면) 세 영역이
          같은 자리에서 서로 겹쳤습니다. 지금은 셋 다 같은 flex 행의 자연스러운 자식으로
          두고 flexWrap을 줘서, 폭이 부족하면 겹치는 대신 자동으로 다음 줄로 줄바꿈되게
          했습니다(= "화면을 비율적으로 분배"). 실제 렌더링된 높이는 headerRef로 측정해서
          아래 리스트/신규/추천 패널의 top 위치에 그대로 반영합니다. */}
      {!pathname.includes("login") && !pathname.includes("signup") && (
        <div
          ref={headerRef}
          className="ggk-body"
          style={{
            position: "fixed",
            top: "10px",
            left: "10px",
            right: "10px",
            zIndex: 999,
            padding: "10px 16px",
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e8eaed",
            boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            rowGap: "8px",
            columnGap: "12px",
          }}
        >
          {/* 좌측: 로고 */}
          <div style={{ flexShrink: 0, lineHeight: 1 }}>
            <img
              src="/icons/header_logo_final.png"
              alt="같이가개"
              style={{ height: "60px", display: "block", objectFit: "contain" }}
            />
            <div
              className="ggk-body"
              style={{ fontSize: "10px", color: "#888", fontWeight: 400, marginTop: "6px", letterSpacing: "-0.1px", whiteSpace: "nowrap" }}
            >
              나의 가족인 반려동물과 함께 맛있는 추억을 나눌 장소 찾기
            </div>
          </div>

          {/* 중앙: 검색창 + 필터 — 폭이 부족하면 자기 줄로 줄바꿈되고, 그 안에서도
              중앙 정렬을 유지합니다(margin: 0 auto). */}
          <div
            style={{
              flex: "1 1 240px",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              margin: "0 auto",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#f5f6f8",
              borderRadius: "999px",
              padding: "5px 12px",
              width: "100%",
              maxWidth: "220px",
              border: "1px solid #e8eaed",
              boxSizing: "border-box",
            }}>
              <Search size={12} color="#aaa" style={{ flexShrink: 0 }} />
              <input
                placeholder="가게명 또는 주소 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1, border: "none", outline: "none",
                  fontSize: "11px", background: "transparent",
                  fontFamily: "'Noto Sans KR', sans-serif",
                  color: "#111", minWidth: 0,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}
                >
                  <X size={11} color="#aaa" />
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <button onClick={() => setSelectedPetZone("all")} style={getButtonStyle("all")}>전체</button>
              <button onClick={() => setSelectedPetZone("indoor")} style={getButtonStyle("indoor")}>🏠 실내 가능</button>
              <button onClick={() => setSelectedPetZone("terrace")} style={getButtonStyle("terrace")}>🌿 야외 가능</button>
              <button onClick={() => setSelectedPetZone("both")} style={getButtonStyle("both")}>🏡 실내외 모두</button>
              <button onClick={() => setSelectedPetZone("vet")} style={getButtonStyle("vet")}>🏥 동물병원</button>
              <button onClick={() => setSelectedPetZone("pharmacy")} style={getButtonStyle("pharmacy")}>💊 동물약국</button>
            </div>
          </div>

          {/* 우측: (좁은 화면 전용) 목록 + 신규 장소 + 추천 장소 + 제보하기 —
              목록/신규/추천 세 패널은 좁은 화면에서 동시에 펼치면 자리가 없으므로
              하나를 열면 나머지 둘은 자동으로 닫습니다. */}
          <div style={{ display: "flex", gap: "5px", flexShrink: 0, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            {isNarrowScreen && (
              <button
                onClick={() => { setShowListPanelMobile((v) => !v); setShowRecentPanel(false); setShowRecommendPanel(false); }}
                className="ggk-body"
                style={{
                  padding: "5px 10px",
                  fontSize: "11px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: showListPanelMobile ? "linear-gradient(145deg, #2a2a2a, #111)" : "#f5f6f8",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  color: showListPanelMobile ? "white" : "#444",
                  whiteSpace: "nowrap",
                }}
              >
                <List size={11} />
                목록
              </button>
            )}

            {/* 넓게 둘러보기 — 좁은 화면 전용. 데스크톱에서는 지도 위에 떠 있는 별도
                버튼(위쪽 "넓게 둘러보기 버튼" 참고)으로 계속 보여주고, 좁은 화면에서는
                다른 버튼들과 같은 flex 줄에 넣어 겹칠 걱정 없이 배치합니다. */}
            {isNarrowScreen && mapReady && (
              <button
                onClick={handleWideView}
                className="ggk-body"
                style={{
                  padding: "5px 10px",
                  fontSize: "11px",
                  borderRadius: "8px",
                  border: wideView ? "none" : "1px solid rgba(0,0,0,0.08)",
                  background: wideView ? "linear-gradient(145deg, #2a2a2a, #111)" : "#f5f6f8",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  color: wideView ? "white" : "#444",
                  whiteSpace: "nowrap",
                }}
              >
                {wideView ? <><ZoomOut size={11} /> 돌아가기</> : <><ZoomIn size={11} /> 넓게</>}
              </button>
            )}

            <button
              onClick={() => { setShowRecentPanel(!showRecentPanel); setShowRecommendPanel(false); setShowListPanelMobile(false); }}
              className="ggk-body"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(210,160,45,0.4)",
                background: "linear-gradient(145deg, #FCEDB0, #F5C840)",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#7A5300",
                boxShadow: "0 1px 5px rgba(240,195,60,0.22)",
                whiteSpace: "nowrap",
              }}
            >
              <MapPinPlus size={11} />
              신규 장소
            </button>

            <button
              onClick={() => { setShowRecommendPanel(!showRecommendPanel); setShowRecentPanel(false); setShowListPanelMobile(false); }}
              className="ggk-body"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(92,122,74,0.35)",
                background: "linear-gradient(145deg, #DCE7CD, #A9C48A)",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#3F5230",
                boxShadow: "0 1px 5px rgba(92,122,74,0.22)",
                whiteSpace: "nowrap",
              }}
            >
              <Bot size={12} />추천 장소
            </button>

            <button
              onClick={() => router.push("/jebo")}
              className="ggk-body"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#f5f6f8",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "#444",
                whiteSpace: "nowrap",
              }}
            >
              <Pencil size={11} />
              제보하기
            </button>
          </div>
        </div>
      )}

      {/* ── 리스트 패널 (검색 중이면 가게명 매칭 결과, 아니면 현재 지도 화면 영역: displayedPlaces 사용)
          좁은 화면에서는 헤더의 "목록" 토글을 켰을 때만 보이고, 폭도 clamp()로 화면 크기에
          비례해서 줄어듭니다(고정 210px이면 좁은 화면에서 지도 대부분을 가려버립니다). */}
      {showListPanel && (
      <div
        className="ggk-body"
        style={{
          position: "fixed",
          top: panelTop,
          left: "14px",
          width: isNarrowScreen ? "clamp(160px, 46vw, 210px)" : "210px",
          height: "60vh",
          background: "#ffffff",
          border: "1px solid #e8eaed",
          borderRadius: "20px",
          overflow: "hidden",
          zIndex: 20,
          boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
          display: "flex",
          flexDirection: "column",
          padding: "14px 0",
        }}
      >
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            height: "100%",
            marginTop: "6px",
            marginBottom: "6px",
            paddingLeft: "10px",
            paddingRight: "8px",
            scrollbarWidth: "thin",
          }}
        >
          <div style={{ height: "8px" }} />
          {displayedPlaces.length === 0 && (
            <div style={{
              textAlign: "center", padding: "30px 10px",
              color: "#bbb", fontSize: "11px", lineHeight: 1.8,
              display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
            }}>
              <Search size={22} color="#ddd" />
              <div>{searchQuery ? `"${searchQuery}"\n검색 결과가 없습니다` : "이 화면에 보이는 장소가 없습니다"}</div>
            </div>
          )}
          {displayedPlaces.map((place) => (
            <div key={place.id}>
              <div
                onClick={() => {
                  setSelectedPlace(null);
                  openPlaceDetail(place);
                }}
                style={{
                  marginBottom: "6px",
                  background: selectedPlace?.id === place.id ? "#eef6ff" : "white",
                  borderRadius: "12px",
                  cursor: "pointer",
                  border:
                    selectedPlace?.id === place.id
                      ? "1.5px solid #93c5fd"
                      : "1px solid #eee",
                  overflow: "hidden",
                }}
              >
                {/* lazy loading + 기본 이미지 fallback */}
                <img
                  src={place.image_url || "/images/default-place.png"}
                  alt={place.name}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/images/default-place.png"; }}
                  style={{ width: "100%", height: "85px", objectFit: "cover", display: "block" }}
                />
                <div style={{ padding: "6px 9px" }}>
                  <div style={{ fontWeight: 700, fontSize: "11px", color: "#111" }}>{place.name}</div>
                  <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      {getPlaceEmoji(place)
                        ? <span>{getPlaceEmoji(place)}</span>
                        : <PawPrint size={10} color="#888" />}
                      {getPlaceLabel(place)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#999",
                      marginTop: "1px",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                  >
                    <MapPin size={10} color="#bbb" />
                    {place.address}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ height: "8px" }} />
        </div>
      </div>
      )}

      {/* ── 신규 장소 패널 */}
      {showRecentPanel && (
        <div
          className="ggk-body"
          style={{
            position: "fixed",
            top: panelTop,
            right: "14px",
            width: isNarrowScreen ? "clamp(220px, 78vw, 280px)" : "280px",
            maxHeight: "64vh",
            background: "#ffffff",
            borderRadius: "22px",
            overflow: "hidden",
            zIndex: 30,
            boxShadow: "0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 100%)",
              padding: "16px 18px 14px",
              flexShrink: 0,
              borderBottom: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div
                  className="ggk-logo"
                  style={{ fontSize: "15px", fontWeight: 800, color: "#1e1b4b", letterSpacing: "-0.2px" }}
                >
                  신규 장소
                </div>
                <div style={{ fontSize: "10px", color: "#4338ca", marginTop: "3px", fontWeight: 500 }}>
                  최근 등록된 장소 순서
                </div>
              </div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(99,102,241,0.18)",
                  color: "#3730a3",
                  letterSpacing: "0.5px",
                }}
              >
                NEW
              </div>
            </div>
          </div>

          <div
            style={{
              overflowY: "auto",
              flex: 1,
              padding: "10px 10px",
              scrollbarWidth: "thin",
              scrollbarColor: "#ddd transparent",
            }}
          >
            {places.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 10px", color: "#bbb", fontSize: "11px" }}>
                새로운 장소가 아직 없습니다
              </div>
            )}
            {[...places]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 10)
              .map((place, idx) => (
                <div
                  key={place.id}
                  onClick={() => openPlaceDetail(place)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "11px",
                    padding: "10px 11px",
                    borderRadius: "14px",
                    marginBottom: "6px",
                    cursor: "pointer",
                    border: "1px solid rgba(0,0,0,0.05)",
                    background: "#f8f9fb",
                    transition: "background 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#eef2ff";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(99,102,241,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#f8f9fb";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "9px",
                      background: "rgba(99,102,241,0.18)",
                      color: "#3730a3",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="ggk-logo"
                      style={{
                        fontWeight: 700,
                        fontSize: "13px",
                        color: "#111",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        letterSpacing: "-0.1px",
                      }}
                    >
                      {place.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "#777", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <span>
                        {getPlaceEmoji(place)
                          ? getPlaceEmoji(place)
                          : <PawPrint size={10} color="#777" />}
                      </span>
                      <span>{getPlaceLabel(place)}</span>
                    </div>
                    {place.address && (
                      <div style={{
                        fontSize: "10px",
                        color: "#aaa",
                        marginTop: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {place.address}
                      </div>
                    )}
                  </div>

                  <div style={{ color: "#c8ccd4", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}>›</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 추천 장소 패널 (우측): Content-Based 스코어링(calculateRecommendScore)
          거리·현재 필터 일치도·편의시설·신규 등록 여부를 종합해 정렬한 Top 10 */}
      {showRecommendPanel && (
        <div
          className="ggk-body"
          style={{
            position: "fixed",
            top: panelTop,
            right: "14px",
            width: isNarrowScreen ? "clamp(220px, 78vw, 280px)" : "280px",
            maxHeight: "64vh",
            background: "#ffffff",
            borderRadius: "22px",
            overflow: "hidden",
            zIndex: 30,
            boxShadow: "0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #DCE7CD 0%, #A9C48A 100%)",
              padding: "16px 18px 14px",
              flexShrink: 0,
              borderBottom: "1px solid rgba(92,122,74,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div
                  className="ggk-logo"
                  style={{ fontSize: "15px", fontWeight: 800, color: "#3b0764", letterSpacing: "-0.2px" }}
                >
                  추천 장소
                </div>
                <div style={{ fontSize: "10px", color: "#48603A", marginTop: "3px", fontWeight: 500 }}>
                  위치·선호·편의시설 기반 AI 추천순
                </div>
              </div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(92,122,74,0.18)",
                  color: "#3F5230",
                  letterSpacing: "0.5px",
                }}
              >
                HOT
              </div>
            </div>
          </div>

          <div
            style={{
              overflowY: "auto",
              flex: 1,
              padding: "10px 10px",
              scrollbarWidth: "thin",
              scrollbarColor: "#ddd transparent",
            }}
          >
            {recommendedPlaces.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 10px", color: "#bbb", fontSize: "11px" }}>
                추천할 장소가 없습니다
              </div>
            )}
            {recommendedPlaces.map(({ place, score }, idx) => (
              <div
                key={place.id}
                onClick={() => openPlaceDetail(place)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  padding: "10px 11px",
                  borderRadius: "14px",
                  marginBottom: "6px",
                  cursor: "pointer",
                  border: "1px solid rgba(0,0,0,0.05)",
                  background: "#faf9fe",
                  transition: "background 0.15s ease, box-shadow 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "#f3e8ff";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(92,122,74,0.10)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = "#faf9fe";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "9px",
                    background: "rgba(92,122,74,0.18)",
                    color: "#3F5230",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: "11px",
                    fontWeight: 800,
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="ggk-logo"
                    style={{
                      fontWeight: 700,
                      fontSize: "13px",
                      color: "#111",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "-0.1px",
                    }}
                  >
                    {place.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "#777", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>
                      {getPlaceEmoji(place)
                        ? getPlaceEmoji(place)
                        : <PawPrint size={10} color="#777" />}
                    </span>
                    <span>{getPlaceLabel(place)}</span>
                    <span style={{ color: "#A9C48A" }}>·</span>
                    <span style={{ color: "#5C7A4A", fontWeight: 700 }}>추천점수 {score}</span>
                  </div>
                </div>
                <div style={{ color: "#c8ccd4", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}>›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 공유 모달 */}
      {showShareModal && (
        <>
          <div
            onClick={() => setShowShareModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100 }}
          />
          <div
            className="ggk-body"
            style={{
              position: "fixed",
              bottom: "50%",
              left: "50%",
              transform: "translate(-50%, 50%)",
              background: "white",
              borderRadius: "20px",
              padding: "22px 20px",
              zIndex: 101,
              boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
              width: "320px",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: "18px" }}>공유하기</div>
            <div onClick={handleCopyLink} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", marginBottom: "7px", border: "1px solid #eee" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Link size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>링크 복사하기</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "1px" }}>클립보드에 링크를 복사합니다</div>
              </div>
            </div>
            <div onClick={handleSnsShare} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", marginBottom: "7px", border: "1px solid #eee" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Upload size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>SNS로 공유하기</div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "1px" }}>인스타그램, X, Thread 등으로 공유합니다</div>
              </div>
            </div>
            <div onClick={() => { handleKakaoShare(); setShowShareModal(false); }} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", border: "1px solid #eee", background: "#FEE500" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle size={16} color="#7a6000" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>카카오톡으로 공유하기</div>
                <div style={{ fontSize: "11px", color: "#7a6000", marginTop: "1px" }}>카카오톡 친구에게 공유합니다</div>
              </div>
            </div>
            <button onClick={() => setShowShareModal(false)} style={{ marginTop: "16px", width: "100%", padding: "12px", background: "#f5f5f5", border: "none", borderRadius: "12px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
              닫기
            </button>
          </div>
        </>
      )}
    </>
  );
}