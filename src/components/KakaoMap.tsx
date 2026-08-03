"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getPlaces } from "@/lib/api";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";
import { calculateRecommendScore } from "@/lib/recommend";
import { openPlaceDetail as openPlaceDetailShared } from "@/lib/openPlace";
import { trackEvent } from "@/lib/analytics";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LocateFixed, Share, MapPin, MapPinPlus, Pencil,
  ZoomIn, ZoomOut, Link, Upload, MessageCircle, PawPrint, X,
  Search, Bot,
} from "lucide-react";

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
    : PET_ZONE_LABEL[place?.pet_zone] || place?.pet_zone || "";

const PET_ZONE_LABEL: Record<string, string> = {
  indoor: "실내 가능",
  terrace: "야외 가능",
  both: "실내외 가능",
};

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
  useEffect(() => {
    const init = async () => {
      // AWS(DynamoDB+Lambda) 전국 데이터는 scripts/migrate-aws-to-supabase.mjs로
      // Supabase `places` 테이블에 이관 완료되어, 더 이상 fetchAwsPlaces()를 따로
      // 호출하지 않고 Supabase 조회 한 번으로 통합해서 가져옵니다.
      const [{ data: { session } }, { data: placesData }, publicDataPlaces] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("places").select("id, name, lat, lng, pet_zone, category, address, image_url, created_at"),
        fetchPublicDataPlaces(),
      ]);
      setSession(session);
      setPlaces([...(placesData || []), ...publicDataPlaces]);
      if (session?.user) await createUserProfile(session.user);
      if ((window as any).Kakao && !(window as any).Kakao.isInitialized()) {
        (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
      }
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async () => {});
    return () => subscription.unsubscribe();
  }, []);

  // ── 저장된 위치 불러오기 / 현위치 자동 취득
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
        mapRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
      }
    } else {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          const region = await reverseGeocode(latitude, longitude);
          setUserRegion(region);
          localStorage.setItem("user_lat", String(latitude));
          localStorage.setItem("user_lng", String(longitude));
          localStorage.setItem("user_region", region);
          if (mapRef.current) {
            mapRef.current.setCenter(new window.kakao.maps.LatLng(latitude, longitude));
          }
        },
        () => {}
      );
    }
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
  const filteredPlaces = useMemo(() => {
    let filtered = places;
    if (selectedPetZone === "vet") {
      filtered = places.filter((p) => p.category === "동물병원");
    } else if (selectedPetZone === "pharmacy") {
      filtered = places.filter((p) => p.category === "동물약국");
    } else if (selectedPetZone !== "all") {
      filtered = places.filter((p) => p.pet_zone === selectedPetZone);
    }

    // 검색어 없을 때만 현재 지역 필터
    // if (!debouncedSearch.trim() && userRegion) {
    //   filtered = filtered.filter((p) =>
    //     p.address?.includes(userRegion)
    //   );
    // }

    if (userLocation) {
      filtered = [...filtered].sort((a, b) => {
        const distA = getDistance(
          userLocation.lat,
          userLocation.lng,
          parseFloat(a.lat),
          parseFloat(a.lng)
        );

        const distB = getDistance(
          userLocation.lat,
          userLocation.lng,
          parseFloat(b.lat),
          parseFloat(b.lng)
        );

        return distA - distB;
      });
    }

    return filtered;
  }, [places, selectedPetZone, userLocation, userRegion, debouncedSearch]);

  // ── 리스트 패널 전용: 검색 중이면 검색된 좌표, 아니면 실제 위치 기준 반경 5km 이내만
  const nearbyPlaces = useMemo(() => {
    const center = searchCenter || userLocation;
    if (!center) return filteredPlaces;
    return filteredPlaces.filter((place) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);
      if (isNaN(lat) || isNaN(lng)) return false;
      return getDistance(center.lat, center.lng, lat, lng) <= 5;
    });
  }, [filteredPlaces, userLocation, searchCenter]);

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
        petMenu: place.pet_menu,
        createdAt: place.created_at,
      });
    };
    return [...filteredPlaces]
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

  // ── 줌 레벨 7 이상(넓게 볼 때)이면 클러스터링, 그보다 좁으면 지금까지의 pill 마커
  // 카카오맵 레벨은 숫자가 클수록 더 넓게(축소) 보이는 상태입니다.
  const CLUSTER_ZOOM_THRESHOLD = 7;

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

    // ── 넓은 줌: 경량 Marker + MarkerClusterer (뷰포트 밖도 전부 넘겨야 클러스터러가 안팎을 알아서 계산함)
    const renderClusterMarkers = () => {
      clearDetailMarkers();
      clearClusterMarkers();
      if (!clustererRef.current) return; // libraries=clusterer 누락 시 여기서 조용히 중단

      const markers = filteredPlaces
        .map((place) => {
          const lat = parseFloat(place.lat);
          const lng = parseFloat(place.lng);
          if (isNaN(lat) || isNaN(lng)) return null;

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

    updateByZoom();

    window.kakao.maps.event.addListener(map, "idle", updateByZoom);
    return () => {
      window.kakao.maps.event.removeListener(map, "idle", updateByZoom);
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
    if (!(window as any).Kakao) { alert("카카오톡 공유를 사용할 수 없습니다."); return; }
    (window as any).Kakao.Share.sendDefault({
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

        {/* 넓게 둘러보기 버튼 */}
        {mapReady && (
          <button
            onClick={handleWideView}
            className="ggk-body"
            style={{
              position: "absolute",
              top: "122px",
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

        {/* 공유 버튼 */}
        <button
          onClick={() => setShowShareModal(true)}
          title="공유하기"
          style={{
            position: "absolute",
            bottom: "96px",
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
            bottom: "42px",
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

        {/* 마커 클릭 팝업 */}
        {selectedPlace && (
          <div
            className="ggk-body"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "100px",
              transform: "translateX(-50%)",
              width: "290px",
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

      {/* ── 플로팅 헤더 */}
      {!pathname.includes("login") && !pathname.includes("signup") && (
        <div
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
            alignItems: "center",
            justifyContent: "space-between",
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

          {/* 중앙: 검색창 + 필터 */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#f5f6f8",
              borderRadius: "999px",
              padding: "5px 12px",
              width: "220px",
              border: "1px solid #e8eaed",
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

            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <button onClick={() => setSelectedPetZone("all")} style={getButtonStyle("all")}>전체</button>
              <button onClick={() => setSelectedPetZone("indoor")} style={getButtonStyle("indoor")}>🏠 실내 가능</button>
              <button onClick={() => setSelectedPetZone("terrace")} style={getButtonStyle("terrace")}>🌿 야외 가능</button>
              <button onClick={() => setSelectedPetZone("both")} style={getButtonStyle("both")}>🏡 실내외 모두</button>
              <button onClick={() => setSelectedPetZone("vet")} style={getButtonStyle("vet")}>🏥 동물병원</button>
              <button onClick={() => setSelectedPetZone("pharmacy")} style={getButtonStyle("pharmacy")}>💊 동물약국</button>
            </div>
          </div>

          {/* 우측: 신규 장소 + 제보하기 */}
          <div style={{ display: "flex", gap: "5px", flexShrink: 0, alignItems: "center" }}>
            <button
              onClick={() => { setShowRecentPanel(!showRecentPanel); setShowRecommendPanel(false); }}
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
              onClick={() => { setShowRecommendPanel(!showRecommendPanel); setShowRecentPanel(false); }}
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

      {/* ── 리스트 패널 (검색 중이면 가게명 매칭 결과, 아니면 반경 5km 이내: displayedPlaces 사용) */}
      <div
        className="ggk-body"
        style={{
          position: "fixed",
          top: "122px",
          left: "14px",
          width: "210px",
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
              <div>{searchQuery ? `"${searchQuery}"\n검색 결과가 없습니다` : "반경 5km 이내에 장소가 없습니다"}</div>
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

      {/* ── 신규 장소 패널 */}
      {showRecentPanel && (
        <div
          className="ggk-body"
          style={{
            position: "fixed",
            top: "122px",
            right: "14px",
            width: "280px",
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
            top: "122px",
            right: "14px",
            width: "280px",
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
                AI
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