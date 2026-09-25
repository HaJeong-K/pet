"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";
import { fetchParks, type ParkPlace } from "@/lib/parkPlaces";
import { fetchAllRows } from "@/lib/supabasePaging";
import {
  calculateRecommendScore, calculateRecommendBreakdownV2, rerankForDiversity, categoryKey, recommendReasons, pickDistinctReasons,
  buildUserPreferenceProfile, personalMatch, EMPTY_PREFERENCE_PROFILE, RECOMMEND_ALGO_VERSION,
  type PlaceSignals, type UserReaction, type ScoredCandidate,
} from "@/lib/recommend";
import { calculateAffinityScore } from "@/lib/affinityScore";
import { isPlacePremiumNow } from "@/lib/premium";
import { RECOMMEND_WEIGHTS, RECOMMEND_V2_WEIGHTS, CARD_BADGE } from "@/lib/scoringConfig";
import {
  buildRoute, applyWalkingLegs, formatEstimatedTime, ROUTE_THEME_LABEL,
  type RouteTheme, type RouteResult, type RoutablePlace,
} from "@/lib/routeRecommend";
import { getPetZoneLabel } from "@/lib/placeConstants";
import { openPlaceDetail as openPlaceDetailShared } from "@/lib/openPlace";
import { trackEvent, extractRegion, getUserKey } from "@/lib/analytics";
import { assignRecVariant, type RecVariant } from "@/lib/experiment";
import { getImpressionCounts, recordImpressions, clearImpression } from "@/lib/recFatigue";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LocateFixed, Share, MapPin, MapPinPlus, Pencil,
  Link, Upload, MessageCircle, PawPrint, X,
  Search, Bot, List, Crown, Store, Route as RouteIcon,
  Footprints, Landmark, Navigation, RefreshCw, ChevronLeft, ChevronRight, Sparkles,
} from "lucide-react";
// ⚠ 최적화: OwnerUpgradeForm(400여 줄)은 "사장님 등록" 버튼을 눌러야만 열리는
// 모달이라, 정적 import로 두면 실제로 한 번도 안 열어보는 대다수 사용자도 이
// 코드를 첫 로드 때 그대로 받게 됩니다. next/dynamic으로 실제 열릴 때만
// 별도 청크를 내려받도록 분리합니다.
const OwnerUpgradeForm = dynamic(() => import("@/components/OwnerUpgradeForm"));

// 리스트/신규 장소/추천 장소 패널이 겹치지 않고 화면 폭에 비례해 배치되도록 하는 기준선.
// 이보다 좁은 화면(모바일 세로, 웹 분할화면 등)에서는 리스트·신규·추천 패널을 동시에
// 펼치지 않고 하나씩만(토글) 보여줍니다 — 세 패널을 동시에 다 펼치기엔 가로 폭이
// 부족해서 그대로 두면 서로 겹치거나 화면 밖으로 밀려납니다.
const NARROW_BREAKPOINT = "(max-width: 720px)";

declare global {
  interface Window {
    kakao: any;
    selectPlace: (id: number) => void;
    selectPark: (id: number) => void;
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

// ── AI 맞춤 추천 경로 테마 탭 아이콘
// ⚠ 카페 중심/비 오는 날 테마는 제거했습니다(요청) — 남은 테마는 산책 중심/관광 중심/
// 실내 추천 3개입니다.
const ROUTE_THEME_ICON: Record<RouteTheme, typeof Footprints> = {
  walk: Footprints,
  attraction: Landmark,
  indoor: Store,
};

// 산책 중심/실내 추천은 "동네를 벗어나지 않는" 코스를 원한다는 요구사항이라, 이 두
// 테마만 후보를 현재 읍/면/동 안으로 좁힙니다. 관광 중심은 지역 내 관광지를 우선하되
// 차로 이동 가능한 거리(외곽지역 한정 반경 5km)까지도 허용해야 해서 하드 필터링 대신
// routeRecommend.ts의 pickAttractionStop에서 별도로 지역 우선순위를 처리합니다.
const DONG_RESTRICTED_THEMES: RouteTheme[] = ["walk", "indoor"];

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
      mapInstance.setLevel(isDetailed ? 5 : 8, { animate: true });
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

// ── AI 맞춤 추천 경로: "산책 중심/비 오는 날/실내 추천" 코스는 읍/면/동을 벗어나지
// 않게 해달라는 요구사항 때문에 필요한, 좌표 → 읍/면/동(region_3depth_name) 조회입니다.
// coord2regioncode는 위 reverseGeocode(시군구, 2depth)와 같은 엔드포인트를 쓰지만
// 3depth(읍/면/동)까지 내려가야 해서 별도 함수로 뒀습니다.
// 행정동(H)과 법정동(B)을 둘 다 돌려줍니다. 장소 주소는 출처마다 둘 중 하나로 적혀 있어서
// (예: 서울시청 좌표 = 행정동 "명동" / 법정동 "태평로1가", 공원 표준데이터 주소는 법정동)
// 한쪽만으로 거르면 같은 동네 장소가 빠집니다.
const reverseGeocodeDong = async (lat: number, lng: number): Promise<{ admin: string; legal: string }> => {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    const admin = data.documents?.find((d: any) => d.region_type === "H")?.region_3depth_name || "";
    const legal = data.documents?.find((d: any) => d.region_type === "B")?.region_3depth_name || "";
    return { admin: admin || legal, legal };
  } catch {
    return { admin: "", legal: "" };
  }
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

  // ── 사장님 등록(전환) 버튼 — 로그인 상태면 OwnerUpgradeForm 모달, 비로그인이면
  // /signup-owner(OwnerSignupForm)로 이동합니다.
  const [showOwnerRegisterModal, setShowOwnerRegisterModal] = useState(false);
  const [ownerCheckLoading, setOwnerCheckLoading] = useState(false);

  // ── 마커: Map 객체로 관리 (증분 업데이트) — 상세 pill 마커(CustomOverlay)용
  const markerMapRef = useRef<Map<number, any>>(new Map());
  // ── 클러스터링용: 넓은 줌에서 쓰는 경량 Marker + MarkerClusterer
  const clustererRef = useRef<any>(null);
  const clusterMarkersRef = useRef<any[]>([]);
  // ── 공원 마커: places와 완전히 별도 레이어라 refs/클러스터러도 따로 둡니다
  // (places 마커 로직을 건드리지 않고 독립적으로 켜고 끌 수 있도록).
  const parkMarkerMapRef = useRef<Map<number, any>>(new Map());
  const parkClustererRef = useRef<any>(null);
  const parkClusterMarkersRef = useRef<any[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkPlace | null>(null);
  const [showParks, setShowParks] = useState(true);
  // ── 현위치 오버레이
  const locationOverlayRef = useRef<any>(null);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userRegion, setUserRegion] = useState<string>("");
  // ⚠ 예전엔 지도를 항상 서울시청 좌표로 먼저 넓게 그린 뒤, 위치가 확인되면 그제서야
  // 사용자 위치로 "점프"했습니다 — 캐시된 위치가 있는 재방문자도 매번 이 깜빡임을
  // 봤고, 첫 방문자는 위치가 잡히기 전까지 엉뚱하게 넓은 지도를 봐야 했습니다.
  // pendingLocationRef에 "지도를 만들 때 쓸 최신 위치"를 미리 담아두고(캐시가
  // 있으면 캐시, 없으면 null), 실제 지도 객체(mapRef.current)를 만드는 순간 이
  // 값으로 바로 중심을 잡습니다. locating은 캐시가 없어 위치 확인을 기다려야 하는
  // 첫 방문자에게만 "위치 확인 중" 오버레이를 보여주기 위한 상태입니다.
  const pendingLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  // 아래 "지역 범위로 공공데이터 재요청" 효과가 이미 어느 좌표로 재요청했는지 기록해서,
  // GPS 좌표가 미세하게(수백m 이내) 흔들릴 때마다 매번 네트워크를 다시 타지 않도록 합니다.
  const regionalFetchKeyRef = useRef<string | null>(null);
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
  const selectParkRef = useRef<(id: number) => void>(() => {});
  const [places, setPlaces] = useState<any[]>([]);
  // ⚠ 공원은 "장소"가 아니라 추천 점수 + 별도 마커 레이어에 쓰는 보조 데이터라 places
  // state와 분리해뒀습니다 — 리뷰/신고/상세페이지 같은 장소 엔티티 구조가 없어서, places에
  // 섞으면 마커 클릭 시 상세 모달이 깨집니다. 대신 자체 마커 레이어 + 가벼운 정보 카드로
  // 별도 표시합니다(아래 selectedPark).
  const [parks, setParks] = useState<ParkPlace[]>([]);
  const [selectedPetZone, setSelectedPetZone] = useState("all");
  const [showRecommendPanel, setShowRecommendPanel] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
  const [showRecentPanel, setShowRecentPanel] = useState(false);

  // ── AI 맞춤 추천 경로(산책 코스) ──
  const [showRoutePanel, setShowRoutePanel] = useState(false);
  const [routeTheme, setRouteTheme] = useState<RouteTheme>("walk");
  const routePolylineRef = useRef<any>(null);
  const routeMarkerOverlaysRef = useRef<any[]>([]);

  // ── 찜/좋아요 인기도 집계 — 장소별 {bookmarks, likes}. 추천 장소 정렬과 AI 코스
  // 정거장 선정 둘 다 이 맵을 참고합니다(recommend.ts의 popularityBonus).
  const [popularityMap, setPopularityMap] = useState<Map<string, { bookmarks: number; likes: number }>>(new Map());

  // ── 추천 v2 신호 ──
  // placeSignals: 서버 집계(/api/recommend/signals) — 시간 감쇠 반응 수, 싫어요 수, 리뷰 만족도
  // myReactions : 내 찜/좋아요/싫어요 — 개인 취향 프로필과 "이미 찜/싫어요한 곳" 처리에 사용
  // recVariant  : A/B 그룹(experiment.ts). 마운트 후에 정해서 SSR/하이드레이션 불일치를 피합니다.
  const [placeSignals, setPlaceSignals] = useState<Map<string, PlaceSignals>>(new Map());
  const [myReactions, setMyReactions] = useState<UserReaction[]>([]);
  // A/B 그룹은 추천 패널(처음엔 닫혀 있음) 안에서만 화면에 드러나서 SSR 결과와 달라도 하이드레이션 불일치가 없습니다.
  const [recVariant] = useState<RecVariant | null>(() =>
    typeof window === "undefined" ? null : assignRecVariant(getUserKey())
  );
  // 실제 도보 경로(TMAP) 조회 결과. key = 코스 좌표 서명 — 코스가 바뀌면 자동으로 무효화됩니다.
  const [walkRouting, setWalkRouting] = useState<{ key: string; legsKm: number[]; legsMinutes: number[]; path: [number, number][] } | null>(null);
  const walkRoutingDisabledRef = useRef(false);

  // ── 리스트 패널 카드에 보여줄 "최근 조회수" — place_view 이벤트를 최근 30일
  // 기준으로 장소별로 센 값입니다(/api/analytics/place-view-counts). 순위/정렬에는
  // 관여하지 않고 카드에 보조 정보로만 표시합니다.
  const [recentViewCounts, setRecentViewCounts] = useState<Map<string, number>>(new Map());

  // ── AI 코스 "산책 중심/실내 추천/관광 중심" 테마 전용: 현재 중심 좌표가 속한 읍/면/동
  // 이름. 산책·실내는 후보를 이 동 안으로만 좁히고(DONG_RESTRICTED_THEMES), 관광 중심은
  // 하드 필터링 없이 "지역 내 관광지 우선순위" 판정에만 씁니다.
  const [routeDongName, setRouteDongName] = useState<string | null>(null);
  // 같은 좌표의 법정동 이름 — 주소가 법정동으로 적힌 장소(공원 등)도 "같은 동"으로 인정하기 위함
  const [routeLegalDongName, setRouteLegalDongName] = useState<string | null>(null);

  // ── "다른 코스 보기": 클릭 시 직전 코스에 나온 정거장들을 제외하고 재계산합니다.
  // 테마를 바꾸거나 패널을 새로 열면 초기화됩니다.
  const [routeExcludedIds, setRouteExcludedIds] = useState<Set<string | number>>(new Set());

  // ── 반응형: 리스트/신규 장소/추천 장소 패널이 화면 폭에 맞게 겹치지 않도록.
  // 좁은 화면(모바일 세로, 분할화면 등)에서는 리스트 패널을 기본으로 숨기고 토글로만
  // 보여주며, 신규/추천 패널을 열면 리스트 패널은 자동으로 닫힙니다(반대도 마찬가지).
  // 넓은 화면에서는 예전처럼 리스트 패널이 항상 보입니다.
  const isNarrowScreen = useMediaQuery(NARROW_BREAKPOINT);
  const [showListPanelMobile, setShowListPanelMobile] = useState(false);
  const showListPanel = !isNarrowScreen || showListPanelMobile;

  // ── 액션 버튼 첫 방문 안내 투어 ──
  // 신규 장소/추천 장소/AI 코스/사장님 등록/제보하기 버튼을 텍스트 없이 아이콘만
  // 남기면서(화면이 좁을 때 자꾸 줄바꿈되던 문제 해결), 처음 보는 사용자는 아이콘
  // 뜻을 알기 어려워질 수 있습니다. 그래서 처음 방문했을 때만(로컬스토리지 체크)
  // 각 아이콘을 순서대로 짚어주는 짧은 안내를 보여주고, 한 번 보거나 건너뛰면
  // 다시 뜨지 않습니다. 마우스를 올렸을 때도 각 버튼의 title 속성으로 이름이 뜹니다.
  const ACTION_TOUR_STORAGE_KEY = "ggk_action_tour_seen_v1";
  const recentBtnRef = useRef<HTMLButtonElement>(null);
  const recommendBtnRef = useRef<HTMLButtonElement>(null);
  const routeBtnRef = useRef<HTMLButtonElement>(null);
  const ownerBtnRef = useRef<HTMLButtonElement>(null);
  const jeboBtnRef = useRef<HTMLButtonElement>(null);
  const ACTION_TOUR_STEPS = [
    { ref: recentBtnRef, text: "새로 등록된 장소를 모아 보여줘요." },
    { ref: recommendBtnRef, text: "취향에 맞는 장소를 AI가 추천해드려요." },
    { ref: routeBtnRef, text: "AI가 산책하기 좋은 코스를 짜드려요." },
    { ref: ownerBtnRef, text: "사장님이시라면 여기서 업장을 등록하세요." },
    { ref: jeboBtnRef, text: "새로운 장소나 정보를 제보할 수 있어요." },
  ];
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourRect, setTourRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(ACTION_TOUR_STORAGE_KEY)) return;
    setTourStep(0);
  }, []);

  useEffect(() => {
    if (tourStep === null) { setTourRect(null); return; }
    const step = ACTION_TOUR_STEPS[tourStep];
    const measure = () => {
      const el = step.ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTourRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  const endActionTour = () => {
    if (typeof window !== "undefined") localStorage.setItem(ACTION_TOUR_STORAGE_KEY, "1");
    setTourStep(null);
  };
  const advanceActionTour = () => {
    if (tourStep === null) return;
    if (tourStep >= ACTION_TOUR_STEPS.length - 1) endActionTour();
    else setTourStep(tourStep + 1);
  };

  // ── 리스트 패널 좌/우 도킹 (웹 전용): 좁은 화면에서는 지도 위에 다른 패널과 겹칠 자리가
  // 없어서 의미가 없으므로 무시하고 항상 좌측 취급합니다. 넓은 화면에서 사용자가 우측으로
  // 옮기면, 신규 장소/추천 장소/AI 코스 패널(모두 우측 고정)과 자리가 겹치지 않도록 그
  // 패널들을 자동으로 반대편(좌측)으로 옮깁니다 — 두 그룹이 항상 서로 반대편에 있도록
  // "리스트 패널의 편"과 "나머지 패널들의 편"을 한 상태에서 함께 계산합니다.
  const [listPanelSide, setListPanelSide] = useState<"left" | "right">("left");
  const effectiveListPanelSide: "left" | "right" = isNarrowScreen ? "left" : listPanelSide;
  const otherPanelsSide: "left" | "right" = effectiveListPanelSide === "right" ? "left" : "right";

  // ── 플로팅 헤더 실제 높이를 측정해서, 리스트/신규/추천 패널의
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

  // ⚠ 마커를 누르면(이름표 pill이든 클러스터 해제 후 개별 마커든 전부 이 함수를
  // 거칩니다) 하단 카드만 뜨고 지도는 그대로였는데, 마커가 화면 가장자리에 걸쳐
  // 있으면 카드에 가려 잘 안 보였습니다. 리스트 항목 클릭 때처럼 지도도 그 위치로
  // 중심 이동시킵니다.
  // ⚠ 하단 중앙 팝업 카드는 항상 하나만 떠 있어야 합니다 — 장소 카드(selectedPlace)와
  // 공원 카드(selectedPark)를 각자 따로 열면, 예전엔 이미 떠 있던 다른 쪽 카드를 닫지
  // 않아서 두 카드가 겹쳐 보이는 문제가 있었습니다. 새로 열 때 반대쪽을 항상 같이
  // 닫도록 openPlacePopup/openParkPopup으로 통일하고, 마커·리스트·정거장 클릭 등
  // 팝업을 여는 모든 자리에서 setSelectedPlace/setSelectedPark를 직접 부르지 않고
  // 이 두 함수만 거치도록 합니다.
  const openPlacePopup = (place: any) => {
    setSelectedPark(null);
    setSelectedPlace(place);
  };
  const openParkPopup = (park: ParkPlace) => {
    setSelectedPlace(null);
    setSelectedPark(park);
    // ⚠ 공원은 장소와 달리 별도 상세페이지가 없어 place_view가 한 번도 기록되지
    // 않았습니다 — 그래서 리스트/팝업의 "최근 조회수" 배지가 공원에는 항상 비어
    // 있었습니다. 장소 상세페이지를 열 때와 동일한 이벤트를 "park-{id}" ID로 남겨서
    // (currentRoute 정거장 등 다른 곳에서도 이미 쓰는 네임스페이스) 같은 집계
    // API(/api/analytics/place-view-counts)에서 그대로 함께 세어지도록 합니다.
    trackEvent("place_view", {
      placeId: `park-${park.id}`,
      placeName: park.name,
      region: extractRegion(park.address),
    });
  };

  selectPlaceRef.current = (id: number) => {
    const found = places.find((p) => p.id === id);
    if (!found) return;
    openPlacePopup(found);
    const lat = parseFloat(found.lat);
    const lng = parseFloat(found.lng);
    if (mapRef.current && window.kakao?.maps && !isNaN(lat) && !isNaN(lng)) {
      mapRef.current.panTo(new window.kakao.maps.LatLng(lat, lng));
    }
  };
  selectParkRef.current = (id: number) => {
    const found = parks.find((p) => p.id === id);
    if (!found) return;
    openParkPopup(found);
    const lat = parseFloat(found.lat);
    const lng = parseFloat(found.lng);
    if (mapRef.current && window.kakao?.maps && !isNaN(lat) && !isNaN(lng)) {
      mapRef.current.panTo(new window.kakao.maps.LatLng(lat, lng));
    }
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
        // ⚠ large_dog/hours/closed_days/parking/entry_fee/website/phone은 추천 점수(대형견 가점),
        // 친화도(정보 완성도), AI 코스(운영시간 판정)에 쓰입니다 — 예전엔 이 컬럼들을 안
        // 불러와서 제보 장소는 대형견 가점이 항상 0이었습니다.
        fetchAllRows(
          "places",
          "id, name, lat, lng, pet_zone, category, address, image_url, created_at, is_premium, premium_expires_at, large_dog, hours, closed_days, parking, entry_fee, website, phone"
        ),
      ]);
      if (cancelled) return;
      setSession(session);
      setPlaces(placesData || []);
      if (session?.user) await createUserProfile(session.user);

      // ⚠ 찜/좋아요 인기도 집계는 지도 첫 렌더를 막지 않도록 await하지 않고 따로 흘려보냅니다
      // — 도착하는 대로 recommend.ts 점수 계산에 반영되면 충분하지, 마커가 뜨는 걸
      // 늦출 이유가 없습니다. place_id만 보고 카운트하므로 실제 places 행이 없는
      // 공공데이터 장소(합성 숫자 id)도 동일하게 집계됩니다.
      // 예전엔 reactions 테이블 전체 행을 브라우저로 내려받아 직접 셌는데, 이제는 서버가
      // 집계한 결과(장소당 숫자 몇 개, 5분 캐시)만 받습니다.
      fetch("/api/recommend/signals")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !data?.signals) return;
          const signals = new Map<string, PlaceSignals>(Object.entries(data.signals as Record<string, PlaceSignals>));
          const counts = new Map<string, { bookmarks: number; likes: number }>();
          for (const [id, s] of signals) counts.set(id, { bookmarks: s.b, likes: s.l });
          setPlaceSignals(signals);
          setPopularityMap(counts);
        })
        .catch(() => {});

      // 내 반응(개인화용). 비로그인 user_key와 로그인 계정 id 둘 다로 남긴 반응을 모두 봅니다
      // (상세페이지가 로그인 여부에 따라 둘 중 하나를 키로 씁니다).
      const myKeys = [getUserKey(), session?.user?.id].filter(Boolean) as string[];
      if (myKeys.length > 0) {
        supabase
          .from("reactions")
          .select("place_id, type")
          .in("user_key", myKeys)
          .then(({ data }) => {
            if (!cancelled && data) setMyReactions(data as UserReaction[]);
          });
      }

      // ⚠ 리스트 패널의 "최근 조회수" 배지도 위와 같은 이유로 지도 첫 렌더를 막지 않고
      // 따로 흘려보냅니다 — 최근 30일 place_view 집계라 도착이 조금 늦어도 무방합니다.
      fetch("/api/analytics/place-view-counts")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setRecentViewCounts(new Map(Object.entries(data.counts || {})));
        })
        .catch(() => {});
      if ((window as any).Kakao && !(window as any).Kakao.isInitialized()) {
        (window as any).Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
      }

      // 느린 공공데이터 3종 + 공원(parks)은 서로 무관한 별개 소스라 순차 await 대신
      // Promise.all로 동시에 요청합니다 — 둘 다 도착하는 데 걸리는 시간이 "가장 느린
      // 쪽 하나" 수준으로 줄어듭니다(예전엔 공공데이터 3종을 다 기다린 뒤에야 공원 fetch를
      // 시작해서 두 대기시간이 그대로 더해졌습니다). 둘 다 기존 DB places 위에 비동기로
      // 덧붙이는 구조라 지도 첫 렌더(위 setPlaces)는 그대로 막지 않습니다.
      //
      // ⚠ 최적화(지역 필터링): 캐시된 위치(localStorage, 아래 다른 useEffect가 매번
      // 최신 GPS로 갱신)가 있으면 그 좌표 반경으로만 서버에서 걸러진 데이터를
      // 받습니다 — 전국 21,000여 건을 매번 받던 것을 사용자 주변 수십~수백 건으로
      // 줄이는 핵심 지점입니다. 아직 위치를 모르는 첫 방문(캐시 없음)이면 인자
      // 없이 호출해 예전과 동일하게 전국 데이터를 받습니다(하위 호환 폴백).
      const cachedLat = parseFloat(localStorage.getItem("user_lat") || "");
      const cachedLng = parseFloat(localStorage.getItem("user_lng") || "");
      const geoOptions = !isNaN(cachedLat) && !isNaN(cachedLng) ? { lat: cachedLat, lng: cachedLng } : {};

      const [publicDataPlaces, parkPlaces] = await Promise.all([
        fetchPublicDataPlaces(geoOptions),
        fetchParks(geoOptions),
      ]);
      if (cancelled) return;
      // ⚠ 중복 렌더 버그 수정: 캐시된 위치가 있으면 이 fetch도 이미 지역 범위(geoOptions)로
      // 걸러진 데이터를 받는데, 아래 "지역 범위로 공공데이터 재요청" 효과가 userLocation이
      // 설정되는 즉시(이 init()과 별개로, 더 일찍) 똑같은 지역 데이터를 따로 받아 먼저
      // setPlaces로 반영해버릴 수 있습니다. 그 뒤에 여기서 filter 없이 그냥 append하면,
      // 같은 장소가 두 번 들어가 React key 중복 경고(place-<id> 중복)가 났습니다. 그
      // 효과와 동일하게 기존 공공데이터부터 걷어내고 넣어서, 어느 쪽이 나중에 끝나도
      // 항상 "교체"가 되도록(추가가 아니라) 맞춥니다.
      setPlaces((prev) => [...prev.filter((p) => p.source !== "public-data"), ...publicDataPlaces]);
      setParks(parkPlaces);
    };
    init();
    // ⚠ 예전엔 이 콜백이 비어 있어서(auth 이벤트를 구독만 하고 아무것도 안 함), 로그인
    // 직후 세션이 비동기로 복원되는 타이밍(토큰 자동 갱신 등)에 이 컴포넌트의 session
    // state가 갱신되지 않는 경우가 있었습니다. 그 결과 실제로는 로그인된 상태인데도
    // "사장님 등록" 버튼이 session을 null로 보고 비회원 가입 폼(이메일/비밀번호 입력)으로
    // 잘못 보내는 문제가 있었습니다. 이제 세션이 바뀔 때마다 실제로 반영합니다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      if (newSession?.user) await createUserProfile(newSession.user);
    });
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
      // ⚠ 이 효과는 mapReady를 기다리지 않고 마운트되자마자 실행됩니다(카카오 SDK
      // 로딩과 병렬로) — 그래서 이 시점엔 아직 지도 객체가 없을 수 있습니다.
      // pendingLocationRef에 담아두면 initializeMap()이 지도를 만드는 순간 바로
      // 이 좌표를 최초 중심으로 씁니다. 이미 지도가 있으면(예: 재검색 등) 그대로
      // 바로 반영합니다.
      pendingLocationRef.current = { lat, lng };
      if (mapRef.current) {
        // ⚠ setBounds(반경 5km 상자)로 맞추면, 상자는 정사각형에 가까운데 화면은
        // 보통 훨씬 가로로 넓어서(특히 데스크톱 모니터) 세로 기준으로 맞추다가
        // 가로로는 실제 10km~20km 이상 보이는 "너무 넓은 지도"가 돼버렸습니다.
        // "내 위치로" 버튼(moveToMyLocation)과 똑같이 고정 레벨 3(골목이 보이는
        // 수준)을 써서 화면 비율과 무관하게 항상 같은 확대 정도로 보여줍니다.
        mapRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
        mapRef.current.setLevel(3, { animate: true });
        mapRef.current.relayout();
      }
      // 캐시가 있으면 "위치 확인 중" 오버레이 없이 바로 그 위치로 보여줍니다.
      setLocating(false);
    }

    // 캐시 유무와 무관하게 항상 최신 GPS 위치를 다시 조회해 갱신(여행지 이동 반영).
    // 권한 거부/조회 실패 시엔 위에서 세팅한 캐시 값이 그대로 유지됩니다.
    if (!navigator.geolocation) { setLocating(false); return; }
    const hadCachedLocation = Boolean(savedLat && savedLng);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        // ⚠ "위치가 가끔 엉뚱한 곳으로 잡히는" 문제의 실제 원인 중 하나 — 데스크톱·실내
        // 등 GPS 신호가 약한 환경에서는 브라우저가 Wi-Fi/IP 기반의 부정확한 좌표를
        // (때로는 accuracy가 수km~수십km인 채로) 그대로 콜백에 넘겨줄 때가 있습니다.
        // 이미 신뢰할 만한 캐시 위치가 있는데 이번 조회의 정확도가 너무 나쁘면(반경
        // 3km 초과), 그 부정확한 값으로 덮어쓰지 않고 기존 캐시 위치를 그대로 둡니다.
        // 캐시가 아예 없는 첫 방문이면 부정확하더라도 없는 것보단 나으므로 그대로 씁니다.
        const ACCURACY_THRESHOLD_M = 3000;
        if (hadCachedLocation && accuracy > ACCURACY_THRESHOLD_M) {
          setLocating(false);
          return;
        }
        setUserLocation({ lat: latitude, lng: longitude });
        setSearchCenter(null); // 실제 위치가 갱신되면 이전 검색 기준 중심은 초기화
        pendingLocationRef.current = { lat: latitude, lng: longitude };
        if (mapRef.current) {
          mapRef.current.setCenter(new window.kakao.maps.LatLng(latitude, longitude));
          mapRef.current.setLevel(3, { animate: true });
          mapRef.current.relayout();
        }
        setLocating(false);
        const region = await reverseGeocode(latitude, longitude);
        setUserRegion(region);
        localStorage.setItem("user_lat", String(latitude));
        localStorage.setItem("user_lng", String(longitude));
        localStorage.setItem("user_region", region);
      },
      () => { setLocating(false); /* 조회 실패/거부 — 캐시(있다면)를 그대로 유지 */ },
      // ⚠ 기본(enableHighAccuracy: false)이면 데스크톱/일부 기기에서 IP·와이파이 기반의
      // 부정확한 위치(가끔 "엉뚱한 곳")를 줄 수 있어 정확도를 우선합니다. maximumAge로
      // 5분 이내 캐시된 OS 위치는 재사용해 첫 확인 속도도 함께 개선합니다.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  // ⚠ 최적화(공공데이터 지역 재요청): 위치를 전혀 모르는 첫 방문(캐시 없음) 순간에는
  // 위 초기 데이터 로드 효과가 fetchPublicDataPlaces()/fetchParks()를 인자 없이 불러
  // "전국 데이터"(문화시설 등 합쳐 2만 건 이상)를 그대로 받습니다 — 그래야 "결과 없음"
  // 화면을 보여주지 않을 수 있기 때문입니다. 하지만 그 상태로 계속 있으면 리스트 패널이
  // 수만 개 카드를 그리려 해서 화면이 멈춘 것처럼 느려집니다. userLocation이 실제로
  // (캐시든 방금 받은 GPS든) 확정되는 즉시, 그 좌표 반경으로 다시 요청해서 공공데이터
  // 부분만 "전국"에서 "내 주변"으로 축소 교체합니다. DB places(source 없음)는 그대로
  // 두고 공공데이터(source==='public-data')만 걷어내고 새 결과로 바꿔치기합니다.
  useEffect(() => {
    if (!userLocation) return;
    const key = `${userLocation.lat.toFixed(1)},${userLocation.lng.toFixed(1)}`;
    if (regionalFetchKeyRef.current === key) return;
    regionalFetchKeyRef.current = key;

    let cancelled = false;
    (async () => {
      const [regionalPublicData, regionalParks] = await Promise.all([
        fetchPublicDataPlaces({ lat: userLocation.lat, lng: userLocation.lng }),
        fetchParks({ lat: userLocation.lat, lng: userLocation.lng }),
      ]);
      if (cancelled) return;
      setPlaces((prev) => [...prev.filter((p) => p.source !== "public-data"), ...regionalPublicData]);
      setParks(regionalParks);
    })();
    return () => { cancelled = true; };
  }, [userLocation]);

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
      // ⚠ 동물병원·동물약국은 문화정보원 원본 CSV의 "실내/실외 여부" 컬럼값을 그대로
      // 받아 pet_zone이 채워져 있어서(예: 동물약국이 indoor로 표기), "실내 가능"
      // 등 실내외 분류 필터에도 중복으로 걸려 나왔습니다. 이 두 카테고리는 애초에
      // "반려동물과 함께 머무는 공간"의 실내외 구분과 성격이 달라 전용 버튼(동물병원/
      // 동물약국)으로만 찾도록 하고, 실내/야외/실내외 모두 필터에서는 제외합니다.
      return places.filter(
        (p) => p.pet_zone === selectedPetZone && p.category !== "동물병원" && p.category !== "동물약국"
      );
    }
    return places;
  }, [places, selectedPetZone]);

  // ── 리스트 패널 전용: 지도를 드래그/확대·축소하면 "지금 화면에 보이는 영역"(mapBounds)
  // 기준으로 갱신됩니다. 지도가 아직 준비되지 않은 아주 짧은 초기 순간에만 예전처럼
  // 검색 좌표 또는 실제 위치 기준 반경 10km로 임시 표시합니다.
  // 너무 축소해서 화면 안에 장소가 수천 개씩 들어오는 경우를 대비해, 기준 좌표(검색
  // 좌표 > 실제 위치 > 화면 중심)에서 가까운 순으로 정렬 후 상위 300개까지만 보여줍니다.
  const MAX_LIST_ITEMS = 300;
  const nearbyPlaces = useMemo(() => {
    // ⚠ 거리순 정렬은 항상 여기(화면/반경으로 이미 좁혀진, 최대 몇백 건짜리 부분집합)에서만
    // 합니다 — filteredPlaces(수만 건일 수 있는 전체 목록)를 통째로 정렬하지 않기 위함입니다.
    // ⚠ 최적화: 예전엔 sort()의 비교 함수 안에서 매번 getDistance를 다시 계산했습니다 —
    // Array.sort는 항목당 한 번이 아니라 O(n log n)번 비교 함수를 호출하므로, 화면을
    // 축소해서 목록이 수백~수천 건으로 늘어나면 같은 장소의 거리를 십수 번씩 다시
    // 계산하는 셈이라 그만큼 느려졌습니다. 거리를 항목당 딱 한 번만 미리 계산해두고
    // (Schwartzian transform) 그 값으로만 비교하도록 바꿨습니다.
    const sortByDistance = (list: any[], center: { lat: number; lng: number }) =>
      list
        .map((place) => ({ place, dist: getDistance(center.lat, center.lng, parseFloat(place.lat), parseFloat(place.lng)) }))
        .sort((a, b) => a.dist - b.dist)
        .map((entry) => entry.place);

    if (!mapBounds) {
      const center = searchCenter || userLocation;
      // ⚠ 성능 안전장치: 지도가 아직 준비되지 않았고(mapBounds 없음) 위치도 모르는
      // 아주 짧은 초기 순간에 filteredPlaces를 그대로 반환하면, 공공데이터 폴백이
      // 전국 데이터(수만 건)를 내려준 경우 그 전체가 카드로 렌더링을 시도해
      // 브라우저 탭이 멈추는 원인이 됩니다. center/mapBounds 둘 다 없을 땐 정렬
      // 기준이 없어 어차피 의미 있는 "가까운 순"을 보여줄 수도 없으므로, 상한만
      // 걸어 안전하게 앞부분만 보여줍니다 — mapBounds가 생기는 즉시(수백ms 내)
      // 이 useMemo가 다시 계산되어 정상적인 화면 기준 목록으로 바뀝니다.
      if (!center) return filteredPlaces.slice(0, MAX_LIST_ITEMS);
      const within10km = filteredPlaces.filter((place) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return getDistance(center.lat, center.lng, lat, lng) <= 10;
      });
      return sortByDistance(within10km, center);
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
    // 반경 10km 이내 장소를 보여주도록 폴백을 추가했습니다.
    if (inView.length === 0) {
      const within10km = filteredPlaces.filter((place) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return getDistance(sortCenter.lat, sortCenter.lng, lat, lng) <= 10;
      });
      const sortedNearby = sortByDistance(within10km, sortCenter);
      return sortedNearby.length <= MAX_LIST_ITEMS ? sortedNearby : sortedNearby.slice(0, MAX_LIST_ITEMS);
    }

    const sorted = sortByDistance(inView, sortCenter);
    return inView.length <= MAX_LIST_ITEMS ? sorted : sorted.slice(0, MAX_LIST_ITEMS);
  }, [filteredPlaces, userLocation, searchCenter, mapBounds]);

  // ── 리스트 카드 배지("TOP n") 순위 — "지역 내 인기 장소"는 지금 화면(또는 반경)에
  // 걸린 장소들(nearbyPlaces) 중 찜+좋아요 점수(recommend.ts의 popularityBonus와 동일한
  // 가중치)가 높은 순으로 매깁니다. 전국 순위가 아니라 "지금 보고 있는 지역 안에서"의
  // 순위라, 지도를 옮기거나 확대/축소하면 랭킹도 그 지역 기준으로 다시 계산됩니다.
  // 점수가 0(찜·좋아요가 전혀 없음)인 장소에는 순위를 매기지 않습니다 — 데이터가 없는
  // 장소까지 TOP10에 억지로 채우면 배지의 신뢰도만 떨어집니다.
  const topPopularityRanks = useMemo(() => {
    const ranked = nearbyPlaces
      .map((place) => {
        const pop = popularityMap.get(String(place.id));
        const score =
          (pop?.bookmarks ?? 0) * RECOMMEND_WEIGHTS.POPULARITY_BOOKMARK_PER +
          (pop?.likes ?? 0) * RECOMMEND_WEIGHTS.POPULARITY_LIKE_PER;
        return { id: place.id, score };
      })
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CARD_BADGE.TOP_RANK_MAX);
    const map = new Map<number, number>();
    ranked.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [nearbyPlaces, popularityMap]);

  // ── 리스트 카드 썸네일 우측 상단 배지 — 카드 하나에 하나만 뜨며 TOP > NEW > HOT
  // 순으로 우선합니다(이미 TOP에 든 장소에 HOT까지 겹쳐 붙이면 정보가 아니라 잡음이라
  // 배타적으로 고릅니다). 공원은 찜/좋아요·등록일 개념이 없어 TOP·NEW 대상에서 빠지고
  // HOT(최근 조회수)만 대상입니다.
  const getCardBadge = (place: any, isPark: boolean): { label: string; color: string } | null => {
    if (!isPark) {
      const rank = topPopularityRanks.get(place.id);
      if (rank) return { label: `TOP ${rank}`, color: "#FFD24C" };

      const createdAtMs = place.created_at ? new Date(place.created_at).getTime() : NaN;
      if (!Number.isNaN(createdAtMs)) {
        const days = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days <= RECOMMEND_WEIGHTS.NEW_PLACE_WINDOW_DAYS) {
          return { label: "NEW", color: "#5CC8FF" };
        }
      }
    }

    const viewCount = recentViewCounts.get(isPark ? `park-${place.id}` : String(place.id)) ?? 0;
    if (viewCount >= CARD_BADGE.HOT_VIEW_MIN) return { label: "HOT", color: "#FF7A5C" };

    return null;
  };

  // ── 리스트 패널에 같이 섞어 보여줄 공원 — 공원 토글(showParks)이 켜져 있을 때만,
  // places와 같은 기준(화면 영역 우선, 없으면 반경 10km)으로 좁힙니다. 공원 데이터는
  // places보다 훨씬 적어서(전국 기준 수천 건 이하) places처럼 300개 상한을 따로 두지
  // 않고 그대로 displayedPlaces에서 합쳐 정렬한 뒤 상한을 적용합니다.
  const nearbyParks = useMemo(() => {
    if (!showParks) return [];
    if (!mapBounds) {
      const center = searchCenter || userLocation;
      if (!center) return [];
      return parks.filter((park) => {
        const lat = parseFloat(park.lat);
        const lng = parseFloat(park.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return getDistance(center.lat, center.lng, lat, lng) <= 10;
      });
    }
    return parks.filter((park) => {
      const lat = parseFloat(park.lat);
      const lng = parseFloat(park.lng);
      if (isNaN(lat) || isNaN(lng)) return false;
      return (
        lat >= mapBounds.swLat &&
        lat <= mapBounds.neLat &&
        lng >= mapBounds.swLng &&
        lng <= mapBounds.neLng
      );
    });
  }, [parks, showParks, mapBounds, userLocation, searchCenter]);

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

  // ── 리스트 패널 상단 고정 "프리미엄 업장" 섹션: 지금 화면(=nearbyPlaces, 이미 거리순
  // 정렬됨)에 활성 프리미엄 업장이 있으면 가까운 순으로 최대 3곳만 보여줍니다. 전국 아무
  // 프리미엄 업장이나 노출하면 무관한 지역 광고가 떠서 리스트 신뢰도만 떨어뜨리므로,
  // 지금 보고 있는 지역 근처에 없으면 섹션 자체를 렌더링하지 않습니다.
  const pinnedPremiumPlaces = useMemo(
    () => nearbyPlaces.filter((p) => isPlacePremiumNow(p)).slice(0, 3),
    [nearbyPlaces]
  );

  // ── 신규 장소 패널(showRecentPanel)에 쓸 "최근 등록순 상위 10개"입니다.
  // ⚠ 최적화: 예전엔 이 정렬([...places].sort(...).slice(0,10))이 JSX 안에 그대로
  // 있어서, 패널이 열려 있는 동안 컴포넌트가 리렌더링될 때마다(지도 팬/줌으로 인한
  // mapBounds 갱신 등 이 패널과 무관한 상태 변화에도) places 전체(공공데이터 병합 후
  // 수천 건)를 매번 복사+정렬했습니다. places가 실제로 바뀔 때만 다시 계산하도록
  // useMemo로 옮겼습니다.
  const recentPlaces = useMemo(() => {
    return [...places]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [places]);

  // ── 리스트 패널에 실제로 표시할 목록: 가게명 검색 결과가 있으면 그걸 우선(공원은
  // 가게명 검색 대상이 아니므로 제외), 없으면(검색어가 없거나 지역명 검색인 경우)
  // 기존 반경 기반 장소 목록에 공원 토글이 켜져 있을 때만 nearbyParks를 함께 섞어서
  // 거리순으로 다시 정렬해 보여줍니다. 공원 항목은 __isPark 플래그로 구분해서, 클릭
  // 시 장소 상세(setSelectedPlace) 대신 지도 위 공원 마커를 눌렀을 때와 동일한 공원
  // 정보 카드(setSelectedPark)로 연결합니다.
  const displayedPlaces = useMemo(() => {
    if (debouncedSearch.trim() && nameSearchResults.length > 0) return nameSearchResults;
    if (nearbyParks.length === 0) return nearbyPlaces;

    const center =
      searchCenter ||
      userLocation ||
      (mapBounds
        ? { lat: (mapBounds.swLat + mapBounds.neLat) / 2, lng: (mapBounds.swLng + mapBounds.neLng) / 2 }
        : null);
    const combined = [...nearbyPlaces, ...nearbyParks.map((park) => ({ ...park, __isPark: true as const }))];
    if (!center) return combined.slice(0, MAX_LIST_ITEMS);

    const sorted = combined
      .map((item) => ({ item, dist: getDistance(center.lat, center.lng, parseFloat(item.lat), parseFloat(item.lng)) }))
      .sort((a, b) => a.dist - b.dist)
      .map((entry) => entry.item);
    return sorted.length <= MAX_LIST_ITEMS ? sorted : sorted.slice(0, MAX_LIST_ITEMS);
  }, [debouncedSearch, nameSearchResults, nearbyPlaces, nearbyParks, searchCenter, userLocation, mapBounds]);

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
        mapRef.current.setLevel(5, { animate: true });
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
  const activeRecVariant: RecVariant = recVariant ?? "v2";

  // 최근 7일 추천 노출 횟수(recFatigue.ts). 패널을 "열 때"만 새로 읽습니다 — 목록을 보여주는
  // 동안 기록이 바뀌어 순서가 계속 흔들리는(노출 기록 → 재정렬 → 또 노출 기록) 일이 없도록.
  const impressionCounts = useMemo(
    () => (showRecommendPanel ? getImpressionCounts() : new Map<string, number>()),
    [showRecommendPanel]
  );

  // 장소 id → 장소 정보(취향 프로필 계산용). 공원은 추천 목록 대상이 아니라 제외합니다.
  const placeById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of places) map.set(String(p.id), p);
    return map;
  }, [places]);

  const preferenceProfile = useMemo(
    () => (myReactions.length === 0 ? EMPTY_PREFERENCE_PROFILE : buildUserPreferenceProfile(myReactions, (id) => placeById.get(id))),
    [myReactions, placeById]
  );

  // 친화도 점수 — 상세페이지(PlaceDetailClient)와 같은 계산식·같은 입력(서버에서 같은 함수로
  // 계산한 리뷰 만족도 포함)이라 목록/코스/상세 어디서 봐도 같은 점수가 나옵니다.
  const affinityOf = useCallback(
    (place: any): number => {
      const id = String(place.id);
      const s = placeSignals.get(id);
      const isPark = id.startsWith("park-");
      const score = calculateAffinityScore({
        reviews: [],
        reviewSatisfactionOverride: s?.rs ?? null,
        likesCount: s?.l ?? 0,
        dislikesCount: s?.d ?? 0,
        bookmarkCount: s?.b ?? 0,
        isPublicDataVerified: isPark || place.source === "public-data",
        amenities: {
          largeDog: place.large_dog,
          petZone: place.pet_zone,
          hours: place.hours,
          phone: place.phone,
          parking: place.parking,
          entryFee: place.entry_fee,
          website: place.website,
        },
      });
      return score;
    },
    [placeSignals]
  );

  const recommendation = useMemo(() => {
    const center = searchCenter || userLocation;

    // ⚠ 성능 안전장치: center(내 위치/검색 중심)가 아직 전혀 없는 상태(위치 권한 대기 중인
    // 첫 방문 등)에서는 "내 주변 추천"이라는 개념 자체가 의미가 없을뿐더러, 이 아래 로직이
    // candidates(최악의 경우 공공데이터 포함 전국 수만 건) × parks(전국 공원)를 그대로
    // 전부 순회하며 점수를 계산해 브라우저 탭이 통째로 멈추는 원인이었습니다(30km 박스
    // 필터는 center가 있을 때만 적용되어, center가 없으면 아무 것도 걸러지지 않았습니다).
    // center가 생기는 즉시(캐시 위치 반영 또는 GPS 수신 직후) 이 useMemo가 다시 계산되어
    // 정상적으로 추천이 채워지므로, 그 전까지는 빈 배열을 반환해 이 무거운 연산 자체를
    // 건너뜁니다.
    if (!center) {
      return {
        list: [] as { place: any; score: number; reason: string | null; distanceKm: number | null }[],
        ad: null as { place: any; score: number } | null,
      };
    }

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

    // ⚠ 공원 후보도 같은 30km 박스로 미리 좁혀둡니다 — 전국 공원 수천 건을 장소 하나마다
    // 매번 전부 순회하면 O(장소 수 × 공원 수)라 느려집니다. 박스 필터로 좁힌 뒤에는
    // 장소 하나당 "근처 공원 중 최단 거리"만 계산하면 되므로 충분히 가볍습니다.
    let nearbyParks = parks;
    if (center) {
      const RADIUS_KM = 30;
      const latDelta = RADIUS_KM / 111;
      const lngDelta = RADIUS_KM / (111 * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
      nearbyParks = parks.filter((park) => {
        const lat = parseFloat(park.lat);
        const lng = parseFloat(park.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return Math.abs(lat - center.lat) <= latDelta && Math.abs(lng - center.lng) <= lngDelta;
      });
    }

    const nearestParkDistanceKm = (lat: number, lng: number): number | null => {
      if (isNaN(lat) || isNaN(lng) || nearbyParks.length === 0) return null;
      let min = Infinity;
      for (const park of nearbyParks) {
        const pLat = parseFloat(park.lat);
        const pLng = parseFloat(park.lng);
        if (isNaN(pLat) || isNaN(pLng)) continue;
        const d = getDistance(lat, lng, pLat, pLng);
        if (d < min) min = d;
      }
      return Number.isFinite(min) ? min : null;
    };

    const distanceOf = (place: any) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);
      return center && !isNaN(lat) && !isNaN(lng) ? getDistance(center.lat, center.lng, lat, lng) : null;
    };
    const matchesFilterOf = (place: any) =>
      selectedPetZone !== "all" &&
      (place.pet_zone === selectedPetZone || (!!filterCategory && place.category === filterCategory));

    // ── v1(기존 규칙): A/B 비교·롤백용으로 그대로 유지 ──
    if (activeRecVariant === "v1") {
      const scoreOf = (place: any) => {
        const popularity = popularityMap.get(String(place.id));
        return calculateRecommendScore({
          distanceKm: distanceOf(place),
          matchesSelectedFilter: matchesFilterOf(place),
          largeDog: place.large_dog,
          createdAt: place.created_at,
          distanceToNearestParkKm: nearestParkDistanceKm(parseFloat(place.lat), parseFloat(place.lng)),
          isPremium: isPlacePremiumNow(place),
          bookmarkCount: popularity?.bookmarks,
          likeCount: popularity?.likes,
        });
      };
      const list = [...candidates]
        .map((place) => ({ place, score: scoreOf(place), reason: null as string | null, distanceKm: distanceOf(place) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return { list, ad: null as { place: any; score: number } | null };
    }

    // ── v2: 점수 계산 → 광고 슬롯 분리 → 다양성 재정렬 ──
    const scored: (ScoredCandidate<any> & { distanceKm: number | null })[] = candidates.map((place) => {
      const id = String(place.id);
      const signals = placeSignals.get(id);
      const distanceKm = distanceOf(place);
      const breakdown = calculateRecommendBreakdownV2({
        distanceKm,
        matchesSelectedFilter: matchesFilterOf(place),
        largeDog: place.large_dog,
        createdAt: place.created_at,
        distanceToNearestParkKm: nearestParkDistanceKm(parseFloat(place.lat), parseFloat(place.lng)),
        bookmarksDecayed: signals?.bd ?? 0,
        likesDecayed: signals?.ld ?? 0,
        affinityScore: affinityOf(place),
        personalMatch: personalMatch(preferenceProfile, place),
        isDisliked: preferenceProfile.disliked.has(id),
        isBookmarked: preferenceProfile.bookmarked.has(id),
        impressionCount: impressionCounts.get(id) ?? 0,
      });
      return {
        place,
        score: breakdown.total,
        rawScore: breakdown.raw,
        category: categoryKey(place.category),
        distanceKm,
        reasons: recommendReasons(breakdown, distanceKm, { reviewCount: signals?.rc ?? 0 }),
      };
    });

    // 프리미엄(유료) 장소는 정렬 점수에 가점을 섞지 않고, 목록 맨 위 "광고" 한 칸으로 분리합니다.
    // 너무 멀거나 사용자가 싫어요한 곳은 광고로도 띄우지 않습니다.
    const adCandidate = scored
      .filter(
        (c) =>
          isPlacePremiumNow(c.place) &&
          c.distanceKm != null &&
          c.distanceKm <= RECOMMEND_V2_WEIGHTS.AD_SLOT_MAX_DISTANCE_KM &&
          !preferenceProfile.disliked.has(String(c.place.id))
      )
      .sort((a, b) => (b.rawScore ?? b.score) - (a.rawScore ?? a.score))[0];
    const organic = adCandidate ? scored.filter((c) => c.place.id !== adCandidate.place.id) : scored;

    const reranked = rerankForDiversity(organic, 10);
    const distinctReasons = pickDistinctReasons(reranked.map((c) => c.reasons ?? []));
    const list = reranked.map(({ place, score, distanceKm }, i) => ({ place, score, reason: distinctReasons[i], distanceKm }));
    return { list, ad: adCandidate ? { place: adCandidate.place, score: adCandidate.score } : null };
  }, [
    filteredPlaces, userLocation, searchCenter, selectedPetZone, parks, popularityMap,
    activeRecVariant, placeSignals, preferenceProfile, impressionCounts, affinityOf,
  ]);
  const recommendedPlaces = recommendation.list;
  const recommendedAd = recommendation.ad;

  // ── 추천 노출 로깅 ──
  // 지도를 움직이는 동안에는 목록이 계속 바뀌므로, 같은 목록이 1.5초 이상 유지됐을 때만
  // "실제로 본 것"으로 보고 한 번 기록합니다(같은 목록은 패널을 다시 열기 전까지 중복 기록 안 함).
  const lastRecImpressionRef = useRef<string>("");
  useEffect(() => {
    if (!showRecommendPanel) {
      lastRecImpressionRef.current = "";
      return;
    }
    if (recommendedPlaces.length === 0 && !recommendedAd) return;
    const signature = [recommendedAd ? `ad:${recommendedAd.place.id}` : "", ...recommendedPlaces.map((r) => r.place.id)].join(",");
    if (signature === lastRecImpressionRef.current) return;
    const timer = setTimeout(() => {
      lastRecImpressionRef.current = signature;
      recordImpressions(recommendedPlaces.map((r) => r.place.id));
      trackEvent("rec_impression", {
        authUserId: session?.user?.id ?? null,
        variant: activeRecVariant,
        meta: {
          algo: RECOMMEND_ALGO_VERSION[activeRecVariant],
          items: recommendedPlaces.map((r, i) => ({ id: String(r.place.id), pos: i + 1, score: r.score })),
          ad: recommendedAd ? String(recommendedAd.place.id) : null,
          filter: selectedPetZone,
        },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [showRecommendPanel, recommendedPlaces, recommendedAd, activeRecVariant, selectedPetZone, session]);

  const handleRecommendClick = (place: any, pos: number, score: number, slot: "organic" | "ad") => {
    clearImpression(place.id);
    trackEvent("rec_click", {
      authUserId: session?.user?.id ?? null,
      placeId: place.id,
      placeName: place.name,
      region: extractRegion(place.address),
      variant: activeRecVariant,
      meta: { algo: RECOMMEND_ALGO_VERSION[activeRecVariant], pos, score, slot },
    });
    openPlaceDetail(place);
  };

  // ── 산책 중심/실내 추천(하드 필터) + 관광 중심(지역 내 우선순위 판정용)일 때 중심
  // 좌표가 속한 읍/면/동을 조회합니다. useMemo는 동기 함수라 fetch를 못 하므로, 별도
  // effect로 미리 구해서 state에 담아두고 currentRoute useMemo는 이 값을 참고만 합니다.
  useEffect(() => {
    if (!showRoutePanel || !(DONG_RESTRICTED_THEMES.includes(routeTheme) || routeTheme === "attraction")) return;
    // AI 코스는 항상 "현재 내 위치"를 출발지로 삼습니다 — searchCenter(검색/지도 이동으로
    // 바뀐 중심)가 있어도 코스 추천 목적에서는 우선순위를 낮춥니다(위치 권한이 없어
    // userLocation을 못 구했을 때만 searchCenter로 대체).
    const center = userLocation || searchCenter;
    if (!center) return;
    let cancelled = false;
    reverseGeocodeDong(center.lat, center.lng).then(({ admin, legal }) => {
      if (cancelled) return;
      setRouteDongName(admin || null);
      setRouteLegalDongName(legal || null);
    });
    return () => { cancelled = true; };
  }, [showRoutePanel, routeTheme, searchCenter, userLocation]);

  // ── AI 맞춤 추천 경로: 현재 위치(또는 검색 중심) 주변 후보를 테마에 맞는 역할
  // 순서(산책/카페/관광/동물병원/동물약국)로 엮어 하나의 코스로 만듭니다. 반경 15km
  // 이내에서 후보를 찾고(아직 지역별로 등록된 장소 수가 적어 너무 좁으면 코스 자체가
  // 안 만들어질 때가 많습니다), 그래도 부족하면 30km까지 한 번 더 넓혀서 재시도합니다.
  // 산책 중심/비 오는 날/실내 추천은 여기서 한 번 더 "같은 읍/면/동" 후보로만 좁힙니다
  // (routeDongName — 위 effect가 미리 조회해둔 값).
  const routeBuild = useMemo<{ route: RouteResult | null; exhausted: boolean }>(() => {
    if (!showRoutePanel) return { route: null, exhausted: false };
    // 코스 출발지는 항상 실제 GPS 기반 현재 위치를 우선합니다(위 dong effect와 동일한
    // 우선순위). searchCenter는 위치 권한이 없을 때만 대체로 씁니다.
    const center = userLocation || searchCenter;
    if (!center) return { route: null, exhausted: false };

    // ⚠ 공원(parks)은 places와 별개 테이블/state라 id 체계가 다릅니다(둘 다 숫자 id라
    // 그대로 합치면 places.id=3과 parks.id=3이 충돌할 수 있음) — `park-${id}` 형태로
    // 네임스페이스를 씌워 RoutablePlace로 변환한 뒤 후보 풀에 합류시킵니다. category가
    // "공원"류라 classifyStopRole이 자동으로 "walk" 역할로 분류해줍니다.
    const parksAsRoutable: RoutablePlace[] = parks.map((park) => ({
      id: `park-${park.id}`,
      name: park.name,
      lat: park.lat,
      lng: park.lng,
      category: park.category,
      address: park.address,
    }));

    const withinRadius = <T extends { lat: string | number; lng: string | number }>(
      list: T[],
      latD: number,
      lngD: number
    ) =>
      list.filter((item) => {
        const lat = typeof item.lat === "number" ? item.lat : parseFloat(item.lat);
        const lng = typeof item.lng === "number" ? item.lng : parseFloat(item.lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        return Math.abs(lat - center.lat) <= latD && Math.abs(lng - center.lng) <= lngD;
      });

    const ROUTE_RADIUS_KM = 15;
    const latDelta = ROUTE_RADIUS_KM / 111;
    const lngDelta = ROUTE_RADIUS_KM / (111 * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
    let nearby: RoutablePlace[] = [
      ...withinRadius(places, latDelta, lngDelta),
      ...withinRadius(parksAsRoutable, latDelta, lngDelta),
    ];
    // 반경 안 후보가 너무 적으면(외곽 지역 등) 반경을 한 번 더 넓혀서 재시도합니다.
    if (nearby.length < 4) {
      const wideKm = 30;
      const wLatDelta = wideKm / 111;
      const wLngDelta = wideKm / (111 * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
      nearby = [
        ...withinRadius(places, wLatDelta, wLngDelta),
        ...withinRadius(parksAsRoutable, wLatDelta, wLngDelta),
      ];
    }

    // 산책 중심/비 오는 날/실내 추천: 같은 읍/면/동 주소를 가진 곳으로만 좁힙니다.
    // routeDongName은 위 effect가 비동기로 조회해오는 값이라, 패널을 막 열었거나 테마를
    // 막 바꾼 순간에는 아직 null일 수 있습니다 — 그 짧은 순간엔 반경 기준 결과를 그대로
    // 보여주다가, 동 이름이 도착하면 자동으로 좁혀서 다시 그립니다(로딩 때문에 패널이
    // 잠깐 비어 보이는 것보다 낫다고 판단했습니다). 좁힌 결과가 2곳 미만이면
    // buildRoute가 null을 반환하고, 패널은 "장소가 충분하지 않습니다" 안내를 보여줍니다.
    if (DONG_RESTRICTED_THEMES.includes(routeTheme) && routeDongName) {
      const dongNames = [routeDongName, routeLegalDongName].filter(Boolean) as string[];
      nearby = nearby.filter(
        (place) => typeof place.address === "string" && dongNames.some((dong) => place.address!.includes(dong))
      );

      // 산책 중심인데 동 이름으로 거른 결과에 공원이 하나도 없으면, 행정동 하나가 여러
      // 법정동에 걸쳐 있어 주소 표기만 달랐을 가능성이 큽니다 — 출발지 1km 이내 공원은
      // 같은 동네로 보고 후보에 다시 넣어서 "산책 코스에 공원이 없는" 상황을 막습니다.
      const hasPark = nearby.some((place) => String(place.id).startsWith("park-"));
      if (routeTheme === "walk" && !hasPark) {
        const WALK_PARK_FALLBACK_KM = 1;
        const closeParks = parksAsRoutable.filter(
          (park) => getDistance(center.lat, center.lng, Number(park.lat), Number(park.lng)) <= WALK_PARK_FALLBACK_KM
        );
        nearby = [...nearby, ...closeParks];
      }
    }

    // 인기도(찜/좋아요)를 후보에 얹어서 buildRoute가 정거장 선정·친화도 점수 계산에
    // 반영할 수 있게 합니다.
    // 친화도(affinityOf)도 같이 얹어서 정거장 친화도가 상세페이지 점수와 같게 나오게 합니다.
    // 내가 싫어요한 장소는 코스 후보에서 뺍니다.
    const nearbyWithPopularity = nearby
      .filter((place) => !preferenceProfile.disliked.has(String(place.id)))
      .map((place) => {
        const popularity = popularityMap.get(String(place.id));
        return {
          ...place,
          bookmarkCount: popularity?.bookmarks ?? 0,
          likeCount: popularity?.likes ?? 0,
          affinityScore: placeSignals.size > 0 ? affinityOf(place) : null,
        };
      });

    const buildOptions = { localAreaName: routeDongName, excludeIds: routeExcludedIds };
    // "다른 코스 보기"로 제외 목록이 쌓였는데 그걸로는 더 이상 코스를 못 만들면(대안
    // 소진), 처음 추천으로 자연스럽게 되돌아갑니다 — 빈 화면보다 낫다는 판단입니다.
    // exhausted=true면 패널에 "다른 조합이 없어요"를 안내해서, 버튼을 눌렀는데 같은 코스가
    // 그대로 나와 고장난 것처럼 보이지 않게 합니다.
    const alternative = buildRoute(nearbyWithPopularity, center, routeTheme, 4, buildOptions);
    if (alternative || routeExcludedIds.size === 0) return { route: alternative, exhausted: false };
    return {
      route: buildRoute(nearbyWithPopularity, center, routeTheme, 4, { localAreaName: routeDongName }),
      exhausted: true,
    };
  }, [
    showRoutePanel, places, parks, userLocation, searchCenter, routeTheme, popularityMap, routeDongName, routeLegalDongName, routeExcludedIds,
    preferenceProfile, placeSignals, affinityOf,
  ]);
  const currentRoute = routeBuild.route;
  const routeAlternativesExhausted = routeBuild.exhausted;

  // ── 실제 도보 경로(TMAP) ──
  // 코스가 확정되면 출발지+정거장 좌표로 /api/route/walk를 한 번 불러 실제 걷는 길의 거리·
  // 시간·경로선을 받아옵니다. 서버에 TMAP 키가 없으면(501) 이번 세션에선 더 부르지 않고
  // 기존 추정치를 그대로 씁니다.
  const routeSignature = useMemo(() => {
    if (!currentRoute) return "";
    return [
      `${currentRoute.origin.lat.toFixed(5)},${currentRoute.origin.lng.toFixed(5)}`,
      ...currentRoute.stops.map((s) => `${Number(s.place.lat).toFixed(5)},${Number(s.place.lng).toFixed(5)}`),
    ].join("|");
  }, [currentRoute]);

  useEffect(() => {
    if (!currentRoute || !routeSignature || walkRoutingDisabledRef.current) return;
    if (walkRouting?.key === routeSignature) return;
    const controller = new AbortController();
    const points = [
      { lat: currentRoute.origin.lat, lng: currentRoute.origin.lng },
      ...currentRoute.stops.map((s) => ({ lat: Number(s.place.lat), lng: Number(s.place.lng) })),
    ];
    fetch("/api/route/walk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
      signal: controller.signal,
    })
      .then(async (res) => {
        // 501 = 서버에 TMAP 키 없음, 429 = 호출 한도 초과 → 이번 세션에선 더 부르지 않고 추정치 사용
        if (res.status === 501 || res.status === 429) {
          walkRoutingDisabledRef.current = true;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const legs: { km: number; minutes: number; path: [number, number][] }[] = data?.legs ?? [];
        if (legs.length !== currentRoute.stops.length) return;
        setWalkRouting({
          key: routeSignature,
          legsKm: legs.map((l) => l.km),
          legsMinutes: legs.map((l) => l.minutes),
          path: legs.flatMap((l) => l.path),
        });
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSignature]);

  // 화면에 보여줄 코스 — 실제 도보 경로가 도착했으면 그 거리·시간으로 갈아끼운 버전
  const displayRoute = useMemo<RouteResult | null>(() => {
    if (!currentRoute) return null;
    if (walkRouting && walkRouting.key === routeSignature) {
      return applyWalkingLegs(currentRoute, walkRouting.legsKm, walkRouting.legsMinutes);
    }
    return currentRoute;
  }, [currentRoute, walkRouting, routeSignature]);
  const walkPath = walkRouting && walkRouting.key === routeSignature ? walkRouting.path : null;

  // 코스 관련 이벤트 공통 부가정보
const courseMeta = (route: RouteResult) => ({
    theme: routeTheme,
    stops: route.stops.map((s) => String(s.place.id)),
    km: route.totalDistanceKm,
    min: route.estimatedMinutes,
    friendliness: route.avgFriendliness,
    distanceSource: route.distanceSource,
    regenerated: routeExcludedIds.size > 0,
  });

  // ── 코스 노출 로깅(추천 목록과 같은 방식: 1.5초 유지된 코스만 1회 기록) ──
  const lastCourseImpressionRef = useRef<string>("");
  useEffect(() => {
    if (!showRoutePanel || !currentRoute) {
      if (!showRoutePanel) lastCourseImpressionRef.current = "";
      return;
    }
    const signature = `${routeTheme}:${currentRoute.stops.map((s) => s.place.id).join(",")}`;
    if (signature === lastCourseImpressionRef.current) return;
    const timer = setTimeout(() => {
      lastCourseImpressionRef.current = signature;
      trackEvent("course_impression", {
        authUserId: session?.user?.id ?? null,
        variant: activeRecVariant,
        meta: courseMeta(currentRoute),
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoutePanel, currentRoute, routeTheme]);


  // 테마를 바꾸거나 패널을 새로 열면 "다른 코스 보기" 제외 목록을 초기화합니다.
  useEffect(() => {
    setRouteExcludedIds(new Set());
  }, [routeTheme, showRoutePanel]);

  // ── 지도 초기화 (SDK는 layout.tsx의 <Script>가 이미 불러오는 중 — 여기선 준비될 때까지 대기만 함)
  useEffect(() => {
    window.selectPlace = (id: number) => selectPlaceRef.current(id);
    window.selectPark = (id: number) => selectParkRef.current(id);
    const initializeMap = () => {
      const container = document.getElementById("map");
      if (!container) return;

      // ⚠ 캐시된 위치(pendingLocationRef, 마운트 시 다른 효과가 동기적으로 채워둠)가
      // 있으면 처음부터 그 좌표로 지도를 그립니다 — 서울 기본 좌표로 잠깐 그렸다가
      // 사용자 위치로 점프하는 깜빡임을 없애기 위함입니다. 캐시가 없는 첫 방문자만
      // 서울(대략 한국 중심부)을 임시로 쓰고, GPS가 확인되는 대로 아래 위치 이펙트가
      // 바로 그 위치로 다시 잡아줍니다.
      const initial = pendingLocationRef.current ?? { lat: 37.5665, lng: 126.978 };

      // ⚠ 예전엔 여기서 setBounds(반경 5km 상자)로 초기 확대 정도를 잡았는데, 상자가
      // 정사각형에 가까운 반면 화면(특히 데스크톱 와이드 모니터)은 가로로 훨씬 넓어서
      // 세로를 기준으로 맞추면 가로로는 10~20km 이상 보이는 "너무 넓은 지도"가
      // 됐습니다. "내 위치로" 버튼(moveToMyLocation)과 똑같이 고정 레벨 3(골목이
      // 보이는 수준)을 써서 화면 비율과 무관하게 항상 같은 확대 정도로 시작합니다.
      mapRef.current = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(initial.lat, initial.lng),
        level: 3,
        scrollwheel: true,
        disableDoubleClickZoom: false,
      });
      mapRef.current.setZoomable(true);
      // ⚠ 지도 컨테이너가 아직 완전히 레이아웃/페인트되기 전에 생성이 실행되면 카카오맵이
      // 컨테이너 크기를 잘못 계산하는 경우가 있었습니다. relayout()으로 실제 크기를
      // 다시 계산시켜 바로잡되, 센터/레벨은 고정값이라 relayout으로 흔들리지 않습니다.
      mapRef.current.relayout();
      mapRef.current.setCenter(new window.kakao.maps.LatLng(initial.lat, initial.lng));
      mapRef.current.setLevel(3);
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

  // ⚠ 실제 거리(m) 기준 대신 카카오맵 "레벨" 숫자로 되돌렸습니다. 실측 거리로 정확히
  // 맞추려던 시도(반경 250m)는 화면 크기에 따라 같은 레벨이라도 실제로 보이는 면적이
  // 달라져서 의도와 다르게 동작했고, 실제로 네이버지도·구글맵 클러스터링 유틸리티도
  // 고정된 실측 km가 아니라 줌 레벨 구간 또는 화면 픽셀 거리 기준으로 전환합니다
  // (참고: navermaps.github.io 마커 클러스터링 가이드, Google Maps 클러스터링 문서 —
  // "일정한 km 기준보다는 줌 레벨/화면상 거리 기준이 일반적"). 카카오맵 레벨 1~5(대략
  // 시내 골목~동 단위)까지는 이름표 pill을, 레벨 6 이상(더 넓게 축소)부터는 클러스터
  // 숫자 마커를 씁니다.
  const CLUSTER_ZOOM_THRESHOLD = 6;
  // MarkerClusterer 자체의 minLevel(카카오 SDK 옵션) — 위 기준으로 이미 "클러스터 모드"에
  // 들어가기로 정한 뒤에도 이 값이 그보다 크면 정작 클러스터러가 "아직 안 뭉쳐도 됨"이라
  // 판단해 낱개 마커를 그대로 그려버립니다. 클러스터러에 마커를 넘기는 시점엔 항상 바로
  // 뭉쳐 보여주길 원하므로 최솟값으로 둡니다.
  const CLUSTER_MIN_LEVEL = 1;

  // ── 줌 레벨에 따라 상세 pill 마커 / 클러스터링 마커를 전환
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;

    const map = mapRef.current;

    // 클러스터러는 한 번만 만들어서 재사용 (libraries=clusterer 파라미터가 SDK 로드 URL에 없으면 undefined)
    if (!clustererRef.current && window.kakao.maps.MarkerClusterer) {
      clustererRef.current = new window.kakao.maps.MarkerClusterer({
        map: null, // 처음엔 지도에 안 붙이고, 모드 전환될 때만 붙임
        averageCenter: true,
        minLevel: CLUSTER_MIN_LEVEL,
        // ⚠ 카카오 기본 클릭 동작(disableClickZoom:false)은 클러스터를 누르면 "그 클러스터가
        // 풀릴 만큼만" 애매하게 몇 단계 확대합니다. 그 대신 아래 clusterclick 리스너에서
        // 항상 초기 기본 레벨(3, 골목이 보이는 수준)로 확실하게 돌아가도록 직접 제어합니다
        // — 화면 중심을 그 클러스터 위치로 옮기는 동작은 그대로 유지됩니다.
        disableClickZoom: true,
        calculator: [10, 50, 100],
        styles: [
          { width: "34px", height: "34px", background: "rgba(76,110,245,0.85)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "34px", fontSize: "12px", fontWeight: "700" },
          { width: "44px", height: "44px", background: "rgba(59,90,220,0.88)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "44px", fontSize: "13px", fontWeight: "700" },
          { width: "54px", height: "54px", background: "rgba(37,70,190,0.9)",  borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "54px", fontSize: "14px", fontWeight: "700" },
        ],
      });
      // 클러스터러를 새로 만들 때 한 번만 붙입니다 — 매 렌더마다 다시 붙이면 리스너가
      // 계속 중복 등록됩니다.
      window.kakao.maps.event.addListener(clustererRef.current, "clusterclick", (cluster: any) => {
        map.setCenter(cluster.getCenter());
        map.setLevel(3, { animate: true });
      });
    }

    const clearDetailMarkers = () => {
      markerMapRef.current.forEach((overlay) => overlay.setMap(null));
      markerMapRef.current.clear();
    };

    const clearClusterMarkers = () => {
      clustererRef.current?.clear();
      // ⚠ 마커 0건 버그 수정: 클러스터러를 map: null로 만들어두고 이후 어디서도
      // setMap()으로 지도에 실제로 붙이지 않아서, addMarkers()로 마커를 아무리
      // 넣어도 화면에 그려지지 않는 경우가 있었습니다(상세 pill 모드로 전환될
      // 때 확실히 떼어냅니다 — 아래 renderClusterMarkers가 다시 붙입니다).
      clustererRef.current?.setMap(null);
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
      clustererRef.current.setMap(map); // clearClusterMarkers()가 setMap(null)로 떼어냈던 것을 다시 붙임

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
            // ⚠ 넓게 축소된 상태에서는 주변에 묶일 장소가 없어 클러스터가 아니라 낱개
            // 마커로 뜨는 경우가 있습니다(예: 외곽의 병원 하나만). 이런 낱개 마커도
            // 클러스터를 눌렀을 때와 동일하게 초기 레벨(3)로 돌아가도록 맞춥니다 —
            // selectPlaceRef.current는 panTo로 중심만 옮기고 확대는 하지 않아서 따로 붙입니다.
            map.setLevel(3, { animate: true });
            selectPlaceRef.current(place.id);
          });
          return marker;
        })
        .filter(Boolean);

      clustererRef.current.addMarkers(markers);
      clusterMarkersRef.current = markers;
    };

    const updateByZoom = () => {
      if (map.getLevel() >= CLUSTER_ZOOM_THRESHOLD) {
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

  // ── 공원 마커 (places와 완전히 별도 레이어) ──
  // ⚠ 공원은 "장소"가 아니라 리뷰/신고/상세페이지 구조가 없어서, 클릭해도 상세 모달을
  // 열지 않고 이름/구분/면적/시설 메모만 보여주는 가벼운 정보 카드(selectedPark)만 띄웁니다.
  // 전국 19,199건 규모라 places와 똑같이 "좁은 줌=이름표 pill / 넓은 줌=클러스터" +
  // 뷰포트 기준 필터링을 그대로 적용해 성능 문제를 피합니다. showParks 토글로 끌 수 있습니다.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    const clearParkDetailMarkers = () => {
      parkMarkerMapRef.current.forEach((overlay) => overlay.setMap(null));
      parkMarkerMapRef.current.clear();
    };
    const clearParkClusterMarkers = () => {
      parkClustererRef.current?.clear();
      parkClustererRef.current?.setMap(null); // 마커 0건 버그 수정 — renderClusterMarkers 쪽과 동일한 이유
      parkClusterMarkersRef.current = [];
    };

    if (!showParks || parks.length === 0) {
      clearParkDetailMarkers();
      clearParkClusterMarkers();
      return;
    }

    if (!parkClustererRef.current && window.kakao.maps.MarkerClusterer) {
      parkClustererRef.current = new window.kakao.maps.MarkerClusterer({
        map: null,
        averageCenter: true,
        minLevel: CLUSTER_MIN_LEVEL,
        // ⚠ places 클러스터러와 동일한 이유(위 clusterclick 리스너 주석 참고) — 카카오
        // 기본 클릭 확대 대신 항상 초기 레벨 3으로 돌아가도록 직접 제어합니다.
        disableClickZoom: true,
        calculator: [10, 50, 100],
        styles: [
          { width: "30px", height: "30px", background: "rgba(76,140,74,0.85)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "30px", fontSize: "11px", fontWeight: "700" },
          { width: "38px", height: "38px", background: "rgba(58,116,56,0.88)", borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "38px", fontSize: "12px", fontWeight: "700" },
          { width: "46px", height: "46px", background: "rgba(43,94,41,0.9)",  borderRadius: "50%", color: "#fff", textAlign: "center", lineHeight: "46px", fontSize: "13px", fontWeight: "700" },
        ],
      });
      window.kakao.maps.event.addListener(parkClustererRef.current, "clusterclick", (cluster: any) => {
        map.setCenter(cluster.getCenter());
        map.setLevel(3, { animate: true });
      });
    }

    const renderParkDetailMarkers = () => {
      clearParkClusterMarkers();
      const bounds = map.getBounds();
      clearParkDetailMarkers();

      parks.forEach((park) => {
        const lat = parseFloat(park.lat);
        const lng = parseFloat(park.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        const position = new window.kakao.maps.LatLng(lat, lng);
        if (!bounds.contain(position)) return;

        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content: `
            <div
              onclick="window.selectPark(${park.id})"
              style="
                background:#eef6ec;
                border-radius:999px;
                padding:4px 9px;
                font-size:10px;
                font-weight:600;
                font-family:'Noto Sans KR',sans-serif;
                box-shadow:0 2px 6px rgba(0,0,0,0.12);
                cursor:pointer;
                white-space:nowrap;
                user-select:none;
                border:1px solid rgba(58,116,56,0.25);
                color:#2b5e29;
              "
            >
              🌳 ${park.name}
            </div>
          `,
          yAnchor: 1,
          zIndex: 2,
        });
        overlay.setMap(map);
        parkMarkerMapRef.current.set(park.id, overlay);
      });
    };

    const renderParkClusterMarkers = () => {
      clearParkDetailMarkers();
      clearParkClusterMarkers();
      if (!parkClustererRef.current) return;
      parkClustererRef.current.setMap(map);

      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const latPad = ne.getLat() - sw.getLat();
      const lngPad = ne.getLng() - sw.getLng();
      const minLat = sw.getLat() - latPad;
      const maxLat = ne.getLat() + latPad;
      const minLng = sw.getLng() - lngPad;
      const maxLng = ne.getLng() + lngPad;

      const markers = parks
        .map((park) => {
          const lat = parseFloat(park.lat);
          const lng = parseFloat(park.lng);
          if (isNaN(lat) || isNaN(lng)) return null;
          if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) return null;

          const marker = new window.kakao.maps.Marker({
            position: new window.kakao.maps.LatLng(lat, lng),
          });
          window.kakao.maps.event.addListener(marker, "click", () => {
            // ⚠ places 클러스터러 쪽과 동일한 이유 — 낱개 공원 마커도 클러스터 클릭과
            // 동일하게 초기 레벨(3)로 돌아가도록 맞춥니다.
            map.setLevel(3, { animate: true });
            window.selectPark(park.id);
          });
          return marker;
        })
        .filter(Boolean);

      parkClustererRef.current.addMarkers(markers);
      parkClusterMarkersRef.current = markers;
    };

    const updateParksByZoom = () => {
      if (map.getLevel() >= CLUSTER_ZOOM_THRESHOLD) {
        renderParkClusterMarkers();
      } else {
        renderParkDetailMarkers();
      }
    };

    updateParksByZoom();
    window.kakao.maps.event.addListener(map, "idle", updateParksByZoom);
    return () => {
      window.kakao.maps.event.removeListener(map, "idle", updateParksByZoom);
      clearParkDetailMarkers();
      clearParkClusterMarkers();
    };
  }, [parks, mapReady, showParks]);

  // ── AI 맞춤 추천 경로: 정거장을 잇는 점선 폴리라인 + 번호 배지를 지도 위에 그립니다.
  // 패널이 닫히거나 코스가 바뀌면(테마 변경 등) 이전에 그린 것들을 지우고 다시 그립니다.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    // 이전 렌더 결과 정리
    routePolylineRef.current?.setMap(null);
    routePolylineRef.current = null;
    routeMarkerOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    routeMarkerOverlaysRef.current = [];

    if (!showRoutePanel || !currentRoute || currentRoute.stops.length < 2) return;

    // 점선은 정거장1이 아니라 출발지(내 위치 — 파란 점 오버레이가 표시된 지점)부터
    // 시작해야 실제로 "여기서 출발해서 이 순서로 걷는다"는 코스가 보입니다.
    const path = [
      new window.kakao.maps.LatLng(currentRoute.origin.lat, currentRoute.origin.lng),
      ...currentRoute.stops.map((stop) => {
        const lat = parseFloat(String(stop.place.lat));
        const lng = parseFloat(String(stop.place.lng));
        return new window.kakao.maps.LatLng(lat, lng);
      }),
    ];

    // 실제 도보 경로(TMAP)가 있으면 그 길을 따라 실선으로, 없으면 정거장끼리 잇는 점선(추정)으로 그립니다.
    const hasWalkPath = !!walkPath && walkPath.length >= 2;
    const polyline = new window.kakao.maps.Polyline({
      path: hasWalkPath ? walkPath!.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)) : path,
      strokeWeight: hasWalkPath ? 5 : 4,
      strokeColor: "#7c3aed",
      strokeOpacity: 0.85,
      strokeStyle: hasWalkPath ? "solid" : "shortdot",
    });
    polyline.setMap(map);
    routePolylineRef.current = polyline;

    currentRoute.stops.forEach((stop, idx) => {
      const lat = parseFloat(String(stop.place.lat));
      const lng = parseFloat(String(stop.place.lng));
      if (isNaN(lat) || isNaN(lng)) return;
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(lat, lng),
        content: `
          <div
            onclick="window.selectPlace(${typeof stop.place.id === "number" ? stop.place.id : `'${stop.place.id}'`})"
            style="
              width:26px; height:26px; border-radius:50%;
              background:linear-gradient(135deg,#a78bfa,#7c3aed);
              color:white; display:flex; align-items:center; justify-content:center;
              font-size:12px; font-weight:800; font-family:'Noto Sans KR',sans-serif;
              box-shadow:0 2px 8px rgba(124,58,237,0.45); border:2px solid white;
              cursor:pointer; user-select:none;
            "
          >${idx + 1}</div>
        `,
        yAnchor: 0.5,
        zIndex: 15,
      });
      overlay.setMap(map);
      routeMarkerOverlaysRef.current.push(overlay);
    });

    // 코스 전체가 한 화면에 들어오도록 범위를 맞춥니다.
    const bounds = new window.kakao.maps.LatLngBounds();
    path.forEach((p: any) => bounds.extend(p));
    map.setBounds(bounds, 80, 80, 80, 80);

    return () => {
      routePolylineRef.current?.setMap(null);
      routePolylineRef.current = null;
      routeMarkerOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      routeMarkerOverlaysRef.current = [];
    };
  }, [showRoutePanel, currentRoute, mapReady, walkPath]);

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
        mapRef.current.setLevel(3, { animate: true });
        setUserLocation({ lat: latitude, lng: longitude });
        setSearchCenter(null); // 내 위치로 이동하면 검색 기준은 초기화
        setSearchQuery("");
        const region = await reverseGeocode(latitude, longitude);
        setUserRegion(region);
        localStorage.setItem("user_lat", String(latitude));
        localStorage.setItem("user_lng", String(longitude));
        localStorage.setItem("user_region", region);
      },
      () => { alert("위치 정보를 가져올 수 없습니다.\n브라우저 위치 권한을 확인해주세요."); },
      // ⚠ 예전엔 옵션 없이(기본값 enableHighAccuracy:false) 호출해서, 자동 위치 확인
      // 효과(위쪽)와 정확도 기준이 서로 달랐습니다 — 같은 사용자가 자동 감지 때는
      // 정확한 위치를, 이 버튼을 눌렀을 땐 부정확한 Wi-Fi/IP 기반 위치를 받는 식으로
      // 결과가 들쭉날쭉했던 원인 중 하나입니다. 자동 감지와 동일한 기준으로 맞췄고,
      // 사용자가 지금 직접 누른 액션이라 maximumAge:0으로 캐시 없이 매번 새로 조회합니다.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
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

  // ── "이 코스로 길찾기" ──
  // ⚠ 예전에 쓰던 map.kakao.com/link/route/이름,위도,경도/... 형식은 카카오가 공식
  // 문서화한 URL이 아니어서 실제로 "존재하지 않는 URL"로 떴습니다. 카카오가 공식
  // 지원하는 다중 경유지 길찾기는 URL Scheme 방식(출발지 sp·경유지 vp/vp2~vp5(최대
  // 5개)·도착지 ep를 좌표로 지정, by=foot으로 도보 지정)이라 이걸로 교체했습니다.
  // (참고: https://apis.map.kakao.com/ios_v2/docs/getting-started/urlscheme/)
  // 네이버 지도도 같은 방식(nmap://route/walk, 경유지 v1~v5)의 공식 URL Scheme을
  // 제공해서 함께 지원합니다 — 다만 네이버 쪽은 네이버지도 앱이 기기에 설치돼 있어야만
  // 열립니다(네이버 공식 문서에 명시된 제약이라, 앱이 없는 PC/미설치 환경을 위한 순수
  // 웹 대체 경로는 네이버가 별도로 제공하지 않습니다).
  const buildRouteWaypoints = (route: RouteResult) => {
    const origin = {
      lat: userLocation?.lat ?? route.origin.lat,
      lng: userLocation?.lng ?? route.origin.lng,
      name: "현재 위치",
    };
    const stopPoints = route.stops
      .map((stop) => {
        const lat = parseFloat(String(stop.place.lat));
        const lng = parseFloat(String(stop.place.lng));
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat, lng, name: stop.place.name };
      })
      .filter((p): p is { lat: number; lng: number; name: string } => p !== null);
    return [origin, ...stopPoints];
  };

  const handleRouteDirectionsKakao = (route: RouteResult) => {
    const points = buildRouteWaypoints(route);
    if (points.length < 2) return;
    trackEvent("course_start", {
      authUserId: session?.user?.id ?? null,
      variant: activeRecVariant,
      meta: { ...courseMeta(route), app: "kakao" },
    });
    const sp = points[0];
    const ep = points[points.length - 1];
    const viaPoints = points.slice(1, -1).slice(0, 5); // 카카오 경유지 상한: 5개(vp, vp2~vp5)
    const params = new URLSearchParams();
    params.set("sp", `${sp.lat},${sp.lng}`);
    viaPoints.forEach((p, idx) => params.set(idx === 0 ? "vp" : `vp${idx + 1}`, `${p.lat},${p.lng}`));
    params.set("ep", `${ep.lat},${ep.lng}`);
    params.set("by", "foot");
    window.open(`https://m.map.kakao.com/scheme/route?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  const handleRouteDirectionsNaver = (route: RouteResult) => {
    const points = buildRouteWaypoints(route);
    if (points.length < 2) return;
    trackEvent("course_start", {
      authUserId: session?.user?.id ?? null,
      variant: activeRecVariant,
      meta: { ...courseMeta(route), app: "naver" },
    });
    const sp = points[0];
    const ep = points[points.length - 1];
    const viaPoints = points.slice(1, -1).slice(0, 5); // 네이버 경유지 상한: 5개(v1~v5)
    const params = new URLSearchParams();
    params.set("slat", String(sp.lat));
    params.set("slng", String(sp.lng));
    params.set("sname", sp.name);
    params.set("dlat", String(ep.lat));
    params.set("dlng", String(ep.lng));
    params.set("dname", ep.name);
    viaPoints.forEach((p, idx) => {
      params.set(`v${idx + 1}lat`, String(p.lat));
      params.set(`v${idx + 1}lng`, String(p.lng));
      params.set(`v${idx + 1}name`, p.name);
    });
    params.set("appname", window.location.origin);
    window.open(`nmap://route/walk?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  // ── 사장님 등록 버튼 클릭 ──
  // 비로그인: 이메일 중복확인이 있는 /signup-owner(OwnerSignupForm)로 보냅니다.
  // 로그인: 이미 사장님(승인완료/심사중)이면 안내만 하고, 아니면 사업장 정보만
  // 받는 OwnerUpgradeForm 모달을 띄웁니다(이메일/비밀번호/약관은 이미 처리됨).
  const handleOwnerRegisterClick = async () => {
    if (!session?.user) {
      router.push("/signup-owner");
      return;
    }
    setOwnerCheckLoading(true);
    const { data: profile } = await supabase
      .from("users")
      .select("owner_status")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    setOwnerCheckLoading(false);

    if (profile?.owner_status === "verified") {
      alert("이미 인증된 사장님 계정입니다.");
      return;
    }
    if (profile?.owner_status === "pending") {
      alert("이미 사장님 전환 신청이 접수되어 관리자 확인을 기다리고 있습니다.");
      return;
    }
    setShowOwnerRegisterModal(true);
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
        @keyframes locatingSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── 지도 영역 */}
      <div style={{ position: "fixed", inset: 0, width: "100%", height: "100vh", zIndex: 0 }}>
        <div id="map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

        {/* 위치 확인 중 오버레이 — 캐시된 위치가 없는 첫 방문자만 잠깐 뜹니다.
            이게 없으면 GPS가 확인되기 전 임시로 그려진(서울 기준) 화면을 보다가
            갑자기 실제 위치로 지도가 점프해서 "엉뚱한 곳/너무 넓은 지도"처럼
            보였습니다 — 그 대기 시간을 로딩 상태로 명확히 보여줍니다. */}
        {locating && (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,0.92)", padding: "18px 26px", borderRadius: 18,
            boxShadow: "0 8px 28px rgba(0,0,0,0.12)", pointerEvents: "none",
            fontFamily: "'Noto Sans KR', sans-serif",
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: "2.5px solid #dbe4d5", borderTopColor: "#5C7A4A",
              animation: "locatingSpin 0.7s linear infinite",
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>내 위치를 확인하고 있어요</span>
          </div>
        )}

        {/* 공유·내 위치 버튼 — 넓은 화면에서는 탭바가 가운데 450px 폭으로만 떠 있어서
            오른쪽에 여유가 많아, 내 위치 버튼을 탭바와 세로 중앙이 맞도록 내렸습니다
            (탭바 bottom 20px + 높이 58px → 중심 49px = 버튼 bottom 29px). 공유 버튼은
            그 위로 기존 간격(54px)을 그대로 유지합니다.
            ⚠ 좁은 화면(모바일)에서는 탭바 폭이 화면 거의 전체(calc(100vw - 28px))로 늘어나
            오른쪽 끝이 화면 우측 14px 지점까지 와서, 같은 높이로 내리면 탭바와 겹칩니다.
            그래서 좁은 화면에서는 기존처럼 탭바 위로 띄운 위치를 그대로 유지합니다. */}
        <button
          onClick={() => setShowShareModal(true)}
          title="공유하기"
          style={{
            position: "absolute",
            bottom: isNarrowScreen ? "138px" : "83px",
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
            bottom: isNarrowScreen ? "84px" : "29px",
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

        {/* ⚠ 공원은 리뷰/신고/상세페이지 같은 장소 엔티티 구조가 없어서, "자세히 보기"로
            이동할 곳이 없습니다 — API가 실제로 제공하는 필드(구분/면적/시설 메모)만
            딱 보여주는 가벼운 카드입니다. 화장실·개수대 여부처럼 원본에 없는 정보는
            구조화해서 있는 척 만들어 넣지 않았습니다. */}
        {selectedPark && (
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
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSelectedPark(null)}
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
                🌳 {selectedPark.name}
              </div>
              <div style={{ fontSize: "11px", color: "#666", marginTop: "3px" }}>
                {selectedPark.category}
                {selectedPark.area && !isNaN(Number(selectedPark.area))
                  ? ` · 약 ${Number(selectedPark.area).toLocaleString()}㎡`
                  : ""}
              </div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px", display: "flex", alignItems: "flex-start", gap: "3px" }}>
                <MapPin size={10} color="#bbb" style={{ marginTop: "2px", flexShrink: 0 }} />
                {selectedPark.address || "주소 정보 없음"}
              </div>
              {selectedPark.facilityNote && (
                <div style={{ fontSize: "11px", color: "#7a7a7a", marginTop: "8px", padding: "8px 10px", background: "#f7f7f5", borderRadius: "10px", lineHeight: 1.6 }}>
                  {/* facilityNote는 import-parks.mjs의 buildFacilityNote()가 "운동시설: ... · 편익시설: ..."
                      처럼 " · "로 이어붙여 저장합니다 — 한 줄로 뭉쳐 있으면 시설이 여러 개일 때 읽기 어려워서,
                      시설 종류별로 한 줄씩 줄바꿈해서 보여줍니다. */}
                  {selectedPark.facilityNote.split(" · ").map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
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
            <Image
              src="/icons/header_logo_final.png"
              alt="같이가개"
              width={141}
              height={60}
              priority
              style={{ height: "60px", width: "auto", display: "block", objectFit: "contain" }}
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
              {/* ⚠ 공원 버튼 자체가 눌림/안눌림 상태를 통째로 표현합니다(다른 필터 버튼과
                  같은 톤) — 텍스트는 "🌳 공원"으로 고정, 켜져 있으면 진한 초록으로 채워지고
                  꺼지면 옅은 외곽선만 남는 식으로 버튼 전체가 토글됩니다. */}
              <button
                onClick={() => setShowParks((v) => !v)}
                aria-pressed={showParks}
                style={{
                  padding: "4px 9px",
                  fontSize: "11px",
                  borderRadius: "999px",
                  border: showParks ? "none" : "1px solid #d8dcd6",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: showParks ? "#3a7438" : "white",
                  color: showParks ? "white" : "#666",
                  boxShadow: showParks ? "0 1px 6px rgba(0,0,0,0.22)" : "0 1px 3px rgba(0,0,0,0.07)",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                  fontFamily: "'Noto Sans KR', sans-serif",
                }}
              >
                🌳 공원
              </button>
            </div>
          </div>

          {/* 우측: (좁은 화면 전용) 목록 + 신규 장소 + 추천 장소 + 제보하기 —
              목록/신규/추천 세 패널은 좁은 화면에서 동시에 펼치면 자리가 없으므로
              하나를 열면 나머지 둘은 자동으로 닫습니다. */}
          <div style={{ display: "flex", gap: "5px", flexShrink: 0, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            {isNarrowScreen && (
              <button
                onClick={() => { setShowListPanelMobile((v) => !v); setShowRecentPanel(false); setShowRecommendPanel(false); setShowRoutePanel(false); }}
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

            <button
              ref={recentBtnRef}
              title="신규 장소"
              aria-label="신규 장소"
              onClick={() => { setShowRecentPanel(!showRecentPanel); setShowRecommendPanel(false); setShowListPanelMobile(false); setShowRoutePanel(false); }}
              className="ggk-body"
              style={{
                padding: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(210,160,45,0.4)",
                background: "linear-gradient(145deg, #FCEDB0, #F5C840)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7A5300",
                boxShadow: "0 1px 5px rgba(240,195,60,0.22)",
              }}
            >
              <MapPinPlus size={15} />
            </button>

            <button
              ref={recommendBtnRef}
              title="추천 장소"
              aria-label="추천 장소"
              onClick={() => { setShowRecommendPanel(!showRecommendPanel); setShowRecentPanel(false); setShowListPanelMobile(false); setShowRoutePanel(false); }}
              className="ggk-body"
              style={{
                padding: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(92,122,74,0.35)",
                background: "linear-gradient(145deg, #DCE7CD, #A9C48A)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#3F5230",
                boxShadow: "0 1px 5px rgba(92,122,74,0.22)",
              }}
            >
              <Bot size={15} />
            </button>

            <button
              ref={routeBtnRef}
              title="AI 코스"
              aria-label="AI 코스"
              onClick={() => { setShowRoutePanel(!showRoutePanel); setShowRecentPanel(false); setShowRecommendPanel(false); setShowListPanelMobile(false); }}
              className="ggk-body"
              style={{
                padding: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(139,92,246,0.35)",
                background: showRoutePanel
                  ? "linear-gradient(145deg, #a78bfa, #7c3aed)"
                  : "linear-gradient(145deg, #EDE7FE, #C9B6FB)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: showRoutePanel ? "white" : "#5b21b6",
                boxShadow: "0 1px 5px rgba(139,92,246,0.22)",
              }}
            >
              <RouteIcon size={15} />
            </button>

            <button
              ref={ownerBtnRef}
              title="사장님 등록"
              aria-label="사장님 등록"
              onClick={handleOwnerRegisterClick}
              disabled={ownerCheckLoading}
              className="ggk-body"
              style={{
                padding: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(184,134,11,0.35)",
                background: "linear-gradient(145deg, #FFF3D6, #F0D28A)",
                cursor: ownerCheckLoading ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7A5300",
                opacity: ownerCheckLoading ? 0.7 : 1,
              }}
            >
              <Store size={15} />
            </button>

            <button
              ref={jeboBtnRef}
              title="제보하기"
              aria-label="제보하기"
              onClick={() => router.push("/jebo")}
              className="ggk-body"
              style={{
                padding: "7px",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#f5f6f8",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#444",
              }}
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── 액션 버튼 첫 방문 안내 투어: position:fixed라 트리 안 위치는 상관없습니다. ── */}
      {tourStep !== null && tourRect && (
        <>
          <div onClick={endActionTour} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)" }} />
          <div
            style={{
              position: "fixed",
              top: tourRect.top - 4,
              left: tourRect.left - 4,
              width: tourRect.width + 8,
              height: tourRect.height + 8,
              borderRadius: 10,
              boxShadow: "0 0 0 3px white, 0 0 0 5px #3a7438",
              zIndex: 2001,
              pointerEvents: "none",
              transition: "top 0.2s ease, left 0.2s ease",
            }}
          />
          <div
            className="ggk-body"
            style={{
              position: "fixed",
              top: tourRect.top + tourRect.height + 12,
              left: Math.max(12, Math.min(tourRect.left, (typeof window !== "undefined" ? window.innerWidth : 400) - 222)),
              width: 210,
              zIndex: 2002,
              background: "white",
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
              transition: "top 0.2s ease, left 0.2s ease",
            }}
          >
            <div style={{ fontSize: 12, color: "#333", lineHeight: 1.5, marginBottom: 10 }}>
              {ACTION_TOUR_STEPS[tourStep].text}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                onClick={endActionTour}
                style={{ border: "none", background: "transparent", color: "#999", fontSize: 11, cursor: "pointer", padding: 0, fontFamily: "'Noto Sans KR', sans-serif" }}
              >
                건너뛰기
              </button>
              <div style={{ display: "flex", gap: 4 }}>
                {ACTION_TOUR_STEPS.map((_, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i === tourStep ? "#3a7438" : "#ddd" }} />
                ))}
              </div>
              <button
                onClick={advanceActionTour}
                style={{
                  border: "none", background: "#3a7438", color: "white", fontSize: 11, fontWeight: 700,
                  padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
                }}
              >
                {tourStep >= ACTION_TOUR_STEPS.length - 1 ? "완료" : "다음"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── 리스트 패널 (검색 중이면 가게명 매칭 결과, 아니면 현재 지도 화면 영역: displayedPlaces 사용)
          좁은 화면에서는 헤더의 "목록" 토글을 켰을 때만 보이고, 폭도 clamp()로 화면 크기에
          비례해서 줄어듭니다(고정 210px이면 좁은 화면에서 지도 대부분을 가려버립니다).
          ⚠ 리디자인(2026.08): 예전엔 헤더 없이 바로 카드 목록만 있었습니다 — 다른 패널
          (신규 장소/추천 장소/AI 코스)은 전부 제목이 있는 헤더 바를 갖고 있어서 상대적으로
          이 패널만 밋밋해 보였습니다. 제목+개수 헤더를 추가하고, 활성 프리미엄 업장이 있으면
          그 위에 고정 노출 섹션을 얹었습니다. */}
      {showListPanel && (
      <div
        className="ggk-body"
        style={{
          position: "fixed",
          top: panelTop,
          ...(effectiveListPanelSide === "left" ? { left: "14px" } : { right: "14px" }),
          width: isNarrowScreen ? "clamp(160px, 46vw, 210px)" : "222px",
          height: "60vh",
          background: "#ffffff",
          border: "1px solid #e8eaed",
          borderRadius: "20px",
          overflow: "hidden",
          zIndex: 20,
          boxShadow: "0 10px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.05)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 13px 10px",
            borderBottom: "1px solid #f0f1f3",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", minWidth: 0 }}>
            <div className="ggk-logo" style={{ fontSize: "13px", fontWeight: 800, color: "#111" }}>
              주변 장소
            </div>
            <div style={{ fontSize: "10px", color: "#aaa", fontWeight: 600, flexShrink: 0 }}>
              {displayedPlaces.length}곳
            </div>
          </div>
          {/* ⚠ 웹 전용 좌/우 도킹 토글: 좁은 화면에서는 지도 대부분을 패널이 차지해서
              반대편으로 옮겨도 의미가 없고, 다른 좁은 화면 UI와 자리 다툼만 생기므로
              !isNarrowScreen일 때만 노출합니다. */}
          {!isNarrowScreen && (
            <button
              onClick={() => setListPanelSide((s) => (s === "left" ? "right" : "left"))}
              title={listPanelSide === "left" ? "패널을 오른쪽으로 이동" : "패널을 왼쪽으로 이동"}
              style={{
                border: "1px solid #eee", background: "#fafafa", borderRadius: "50%",
                width: "20px", height: "20px", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
              }}
            >
              {listPanelSide === "left"
                ? <ChevronRight size={12} color="#888" />
                : <ChevronLeft size={12} color="#888" />}
            </button>
          )}
        </div>

        {/* ⚠ 프리미엄 고정 섹션: 지금 보이는 지역 근처에 활성 프리미엄 업장이 있을 때만
            나타납니다(pinnedPremiumPlaces가 빈 배열이면 렌더링 자체를 안 함) — 관련 없는
            지역 업장을 노출하지 않기 위해서입니다. */}
        {pinnedPremiumPlaces.length > 0 && (
          <div
            style={{
              flexShrink: 0,
              padding: "9px 10px 8px",
              background: "linear-gradient(135deg,#fffaf1,#fdf1da)",
              borderBottom: "1px solid #f5e6c4",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "9.5px", fontWeight: 800, color: "#9a6b1f", marginBottom: "6px", letterSpacing: "0.2px" }}>
              <Crown size={10} color="#c8952e" />
              프리미엄 업장
            </div>
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", paddingBottom: "1px" }}>
              {pinnedPremiumPlaces.map((place) => (
                <div
                  key={`premium-${place.id}`}
                  onClick={() => {
                    openPlacePopup(place);
                    const lat = parseFloat(place.lat);
                    const lng = parseFloat(place.lng);
                    if (mapRef.current && window.kakao?.maps && !isNaN(lat) && !isNaN(lng)) {
                      mapRef.current.panTo(new window.kakao.maps.LatLng(lat, lng));
                    }
                  }}
                  style={{
                    flexShrink: 0, width: "84px", cursor: "pointer", borderRadius: "10px",
                    overflow: "hidden", border: "1px solid rgba(212,162,76,0.4)", background: "white",
                  }}
                >
                  <div style={{ position: "relative", width: "84px", height: "56px" }}>
                    <Image
                      src={place.image_url || "/images/default-place.png"}
                      alt={place.name}
                      fill
                      sizes="84px"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/images/default-place.png"; }}
                      style={{ objectFit: "cover" }}
                    />
                    <div style={{
                      position: "absolute", top: 3, left: 3, display: "inline-flex", alignItems: "center", gap: 2,
                      padding: "1px 5px", borderRadius: 999, fontSize: 7.5, fontWeight: 800,
                      background: "linear-gradient(135deg,#F0D28A,#D4A24C)", color: "#5C4106",
                    }}>
                      <Sparkles size={7} />AD
                    </div>
                  </div>
                  <div style={{ padding: "5px 6px 6px", fontSize: "9.5px", fontWeight: 700, color: "#5C4106", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {place.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            overflowY: "auto",
            flex: 1,
            marginTop: "6px",
            marginBottom: "6px",
            paddingLeft: "10px",
            paddingRight: "8px",
            scrollbarWidth: "thin",
          }}
        >
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
          {displayedPlaces.map((place) => {
            // ⚠ 공원 토글이 켜져 있으면 displayedPlaces에 공원이 __isPark 플래그를 달고
            // 섞여 들어옵니다. 공원은 image_url/pet_zone 등 장소 전용 필드가 없어서
            // 카드 내용과 클릭 동작(장소 상세 대신 지도 위 공원 마커와 동일한 공원
            // 정보 카드)을 분기합니다.
            const isPark = (place as any).__isPark === true;
            const isSelected = isPark ? selectedPark?.id === place.id : selectedPlace?.id === place.id;
            return (
            <div key={`${isPark ? "park" : "place"}-${place.id}`}>
              <div
                onClick={() => {
                  const lat = parseFloat(place.lat);
                  const lng = parseFloat(place.lng);
                  if (isPark) {
                    // 지도 위 공원 마커를 눌렀을 때(selectParkRef.current)와 동일하게 동작을 통일합니다.
                    openParkPopup(place as unknown as ParkPlace);
                  } else {
                    // ⚠ 예전엔 리스트 항목을 누르면 바로 상세 모달로 넘어갔는데, 지도 위
                    // 마커를 누를 때는 먼저 하단 중앙에 "자세히 보기" 미리보기 카드가 뜨는
                    // 것과 동작이 달랐습니다. 마커를 눌렀을 때(setSelectedPlace)와 똑같이
                    // 동작을 통일합니다 — 실제 상세 모달 진입은 그 카드의 "자세히 보기"
                    // 버튼에서 이루어집니다.
                    openPlacePopup(place);
                  }
                  // 리스트에서 고른 장소/공원이 화면 중심에 오도록 지도도 함께 이동합니다.
                  if (mapRef.current && window.kakao?.maps && !isNaN(lat) && !isNaN(lng)) {
                    mapRef.current.panTo(new window.kakao.maps.LatLng(lat, lng));
                  }
                }}
                style={{
                  marginBottom: "7px",
                  background: isSelected ? "#eef6ff" : "white",
                  borderRadius: "14px",
                  cursor: "pointer",
                  border: isSelected ? "1.5px solid #93c5fd" : "1px solid #eee",
                  boxShadow: isSelected ? "0 2px 10px rgba(59,130,246,0.14)" : "0 1px 3px rgba(0,0,0,0.03)",
                  overflow: "hidden",
                  transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                }}
              >
                <div style={{ position: "relative" }}>
                  {isPark ? (
                    <div style={{ width: "100%", height: "88px", background: "linear-gradient(145deg,#DCE7CD,#A9C48A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "26px" }}>🌳</span>
                    </div>
                  ) : (
                    // lazy loading + 기본 이미지 fallback
                    <div style={{ position: "relative", width: "100%", height: "88px" }}>
                    <Image
                      src={place.image_url || "/images/default-place.png"}
                      alt={place.name}
                      fill
                      sizes="(max-width: 720px) 100vw, 320px"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/images/default-place.png"; }}
                      style={{ objectFit: "cover" }}
                    />
                    </div>
                  )}
                  {(() => {
                    const badge = getCardBadge(place, isPark);
                    if (!badge) return null;
                    return (
                      <span
                        style={{
                          position: "absolute", top: "6px", right: "6px",
                          padding: "2px 7px", borderRadius: "6px",
                          fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.2px",
                          background: "rgba(0,0,0,0.72)", color: badge.color,
                          lineHeight: 1.4,
                        }}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ padding: "7px 9px 8px" }}>
                  <div style={{ fontWeight: 700, fontSize: "11px", color: "#111", display: "flex", alignItems: "center", gap: 4 }}>
                    {place.name}
                    {!isPark && isPlacePremiumNow(place) && (
                      <span title="프리미엄 등록 업장" style={{
                        display: "inline-flex", alignItems: "center", padding: "1px 5px", borderRadius: 999, flexShrink: 0,
                        background: "linear-gradient(135deg,#F0D28A,#D4A24C)",
                      }}>
                        <Crown size={8} color="#5C4106" />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "10px", color: "#666", marginTop: "3px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: "3px",
                      background: "#f5f6f8", padding: "2px 6px", borderRadius: "999px",
                    }}>
                      {isPark ? (
                        <>🌳 {place.category}</>
                      ) : (
                        <>
                          {getPlaceEmoji(place)
                            ? <span>{getPlaceEmoji(place)}</span>
                            : <PawPrint size={10} color="#888" />}
                          {getPlaceLabel(place)}
                        </>
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#999",
                      marginTop: "4px",
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
            );
          })}
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
            // ⚠ 리스트 패널이 우측으로 도킹되면(listPanelSide) 이 패널들과 자리가
            // 겹치므로, 항상 리스트 패널의 반대편(otherPanelsSide)에 붙습니다.
            ...(otherPanelsSide === "left" ? { left: "14px" } : { right: "14px" }),
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
            {recentPlaces
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
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{place.name}</span>
                      {isPlacePremiumNow(place) && (
                        <span title="프리미엄 등록 업장" style={{
                          display: "inline-flex", alignItems: "center", padding: "1px 5px", borderRadius: 999, flexShrink: 0,
                          background: "linear-gradient(135deg,#F0D28A,#D4A24C)",
                        }}>
                          <Crown size={8} color="#5C4106" />
                        </span>
                      )}
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
            // ⚠ 리스트 패널이 우측으로 도킹되면(listPanelSide) 이 패널들과 자리가
            // 겹치므로, 항상 리스트 패널의 반대편(otherPanelsSide)에 붙습니다.
            ...(otherPanelsSide === "left" ? { left: "14px" } : { right: "14px" }),
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
                  {activeRecVariant === "v2"
                    ? "거리·취향·평판·편의시설 기반 맞춤 추천순"
                    : "위치·선호·편의시설 기반 AI 추천순"}
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
            {recommendedPlaces.length === 0 && !recommendedAd && (
              <div style={{ textAlign: "center", padding: "30px 10px", color: "#bbb", fontSize: "11px" }}>
                추천할 장소가 없습니다
              </div>
            )}
            {/* 광고 슬롯 — 프리미엄 업장은 추천 순위에 섞지 않고 여기 한 칸에만, "광고"로
                명확히 구분해 보여줍니다(추천 목록의 신뢰도 유지). */}
            {recommendedAd && (
              <div
                onClick={() => handleRecommendClick(recommendedAd.place, 0, recommendedAd.score, "ad")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  padding: "10px 11px",
                  borderRadius: "14px",
                  marginBottom: "8px",
                  cursor: "pointer",
                  border: "1px solid rgba(212,162,76,0.35)",
                  background: "#fffaf0",
                }}
              >
                <div
                  style={{
                    width: "28px", height: "28px", borderRadius: "9px", flexShrink: 0,
                    background: "linear-gradient(135deg,#F0D28A,#D4A24C)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Crown size={13} color="#5C4106" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="ggk-logo"
                    style={{ fontWeight: 700, fontSize: "13px", color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {recommendedAd.place.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "#8a6d2b", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span
                      style={{
                        fontSize: "9px", fontWeight: 800, padding: "1px 5px", borderRadius: 4,
                        border: "1px solid #D4A24C", color: "#8a6d2b", lineHeight: "12px",
                      }}
                    >
                      광고
                    </span>
                    <span>{getPlaceLabel(recommendedAd.place)}</span>
                  </div>
                </div>
                <div style={{ color: "#d9c28f", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}>›</div>
              </div>
            )}
            {recommendedPlaces.map(({ place, score, reason, distanceKm }, idx) => (
              <div
                key={place.id}
                onClick={() => handleRecommendClick(place, idx + 1, score, "organic")}
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
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{place.name}</span>
                    {isPlacePremiumNow(place) && (
                      <span title="프리미엄 등록 업장" style={{
                        display: "inline-flex", alignItems: "center", padding: "1px 5px", borderRadius: 999, flexShrink: 0,
                        background: "linear-gradient(135deg,#F0D28A,#D4A24C)",
                      }}>
                        <Crown size={8} color="#5C4106" />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "10px", color: "#777", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>
                      {getPlaceEmoji(place)
                        ? getPlaceEmoji(place)
                        : <PawPrint size={10} color="#777" />}
                    </span>
                    <span>{getPlaceLabel(place)}</span>
                    <span style={{ color: "#A9C48A" }}>·</span>
                    {activeRecVariant === "v2" ? (
                      // v2는 다양성 재정렬 때문에 점수가 순서와 꼭 일치하지 않아서, 숫자 대신
                      // 거리와 "왜 추천됐는지"를 보여줍니다(점수는 마우스를 올리면 확인).
                      <span title={`추천점수 ${score}`} style={{ color: "#5C7A4A", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {distanceKm != null && (distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`)}
                        {distanceKm != null && reason && " · "}
                        {reason}
                      </span>
                    ) : (
                      <span style={{ color: "#5C7A4A", fontWeight: 700 }}>추천점수 {score}</span>
                    )}
                  </div>
                </div>
                <div style={{ color: "#c8ccd4", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}>›</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI 맞춤 추천 경로(산책 코스) 패널 ── */}
      {showRoutePanel && (
        <div
          className="ggk-body"
          style={{
            position: "fixed",
            top: panelTop,
            // ⚠ 리스트 패널이 우측으로 도킹되면(listPanelSide) 이 패널들과 자리가
            // 겹치므로, 항상 리스트 패널의 반대편(otherPanelsSide)에 붙습니다.
            ...(otherPanelsSide === "left" ? { left: "14px" } : { right: "14px" }),
            width: isNarrowScreen ? "clamp(240px, 82vw, 320px)" : "320px",
            maxHeight: "76vh",
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
              background: "linear-gradient(135deg, #EDE7FE 0%, #C9B6FB 100%)",
              padding: "16px 18px 14px",
              flexShrink: 0,
              borderBottom: "1px solid rgba(124,58,237,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div
                  className="ggk-logo"
                  style={{ fontSize: "15px", fontWeight: 800, color: "#4c1d95", letterSpacing: "-0.2px" }}
                >
                  AI 맞춤 추천 경로
                </div>
                <div style={{ fontSize: "10px", color: "#5b21b6", marginTop: "3px", fontWeight: 500 }}>
                  {searchQuery.trim() ? `${searchQuery.trim()} 기준 추천 코스` : "현재 위치 기준 추천 코스"}
                </div>
              </div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(124,58,237,0.18)",
                  color: "#5b21b6",
                  letterSpacing: "0.5px",
                }}
              >
                베타
              </div>
            </div>

            {displayRoute && (
              <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                {[
                  { icon: <PawPrint size={11} />, label: "친화도", value: `${displayRoute.avgFriendliness}점` },
                  { icon: <Navigation size={11} />, label: "총 거리", value: `${displayRoute.totalDistanceKm}km` },
                  { icon: <Footprints size={11} />, label: "예상 시간", value: formatEstimatedTime(displayRoute.estimatedMinutes) },
                ].map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.6)",
                      borderRadius: "10px",
                      padding: "6px 4px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", color: "#5b21b6" }}>
                      {stat.icon}
                      <span style={{ fontSize: "9px", fontWeight: 700 }}>{stat.label}</span>
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#3b0764", marginTop: "2px" }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "5px", marginTop: "10px", overflowX: "auto", paddingBottom: "2px" }}>
              {(Object.keys(ROUTE_THEME_LABEL) as RouteTheme[]).map((theme) => {
                const ThemeIcon = ROUTE_THEME_ICON[theme];
                return (
                  <button
                    key={theme}
                    onClick={() => setRouteTheme(theme)}
                    className="ggk-body"
                    style={{
                      flexShrink: 0,
                      padding: "5px 10px",
                      borderRadius: "999px",
                      border: "none",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      background: routeTheme === theme ? "#5b21b6" : "rgba(255,255,255,0.7)",
                      color: routeTheme === theme ? "white" : "#5b21b6",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <ThemeIcon size={10} />
                    {ROUTE_THEME_LABEL[theme]}
                  </button>
                );
              })}
            </div>

            {displayRoute && (
              <button
                onClick={() => {
                  // 지금 보이는 코스의 정거장들을 제외 목록에 더해서 다른 조합이
                  // 나오도록 만듭니다. 대안이 바닥나면 useMemo 쪽에서 자동으로
                  // 처음 추천으로 되돌립니다.
                  trackEvent("course_regenerate", {
                    authUserId: session?.user?.id ?? null,
                    variant: activeRecVariant,
                    meta: courseMeta(displayRoute),
                  });
                  setRouteExcludedIds((prev) => {
                    const next = new Set(prev);
                    displayRoute.stops.forEach((s) => next.add(s.place.id));
                    return next;
                  });
                }}
                className="ggk-body"
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "7px 0",
                  borderRadius: "10px",
                  border: "1px dashed rgba(91,33,182,0.4)",
                  background: "rgba(255,255,255,0.5)",
                  color: "#5b21b6",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <RefreshCw size={11} />이 조합 말고 다른 코스 보기
              </button>
            )}
            {displayRoute && routeAlternativesExhausted && (
              <div style={{ marginTop: "6px", fontSize: "10px", color: "#6d28d9", textAlign: "center" }}>
                이 근처에서 만들 수 있는 다른 조합이 없어 처음 코스를 다시 보여드려요
              </div>
            )}
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
            {!displayRoute && (
              <div style={{ textAlign: "center", padding: "30px 10px", color: "#bbb", fontSize: "11px" }}>
                {(userLocation || searchCenter)
                  ? "이 근처에서 코스를 만들 만큼 장소가 충분하지 않습니다"
                  : "위치 정보를 확인하는 중입니다"}
              </div>
            )}
            {displayRoute && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 3px 10px 3px", color: "#7c3aed", fontSize: "10.5px", fontWeight: 700 }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563eb", border: "2px solid white", boxShadow: "0 0 0 1px rgba(37,99,235,0.4)", flexShrink: 0 }} />
                출발: 현재 위치
                <span style={{ color: "#bbb", fontWeight: 500 }}>
                  · 첫 정거장까지 도보 약{" "}
                  {displayRoute.distanceFromOriginKm < 1
                    ? `${Math.round(displayRoute.distanceFromOriginKm * 1000)}m`
                    : `${displayRoute.distanceFromOriginKm.toFixed(1)}km`}
                  {" "}({Math.max(1, Math.round((displayRoute.distanceFromOriginKm / 4) * 60))}분)
                </span>
              </div>
            )}
            {displayRoute?.stops.map((stop, idx) => (
              <div key={stop.place.id}>
                <div
                  onClick={() => {
                    // 목록 패널·마커 클릭과 동일하게: 바로 상세 모달로 넘어가지 않고
                    // 하단 중앙에 "자세히 보기" 미리보기 카드를 띄우면서 지도를 이
                    // 정거장 중심으로 이동합니다.
                    // ⚠ 정거장이 공원(`park-${id}` 네임스페이스)이면 places 테이블에
                    // 없는 place라 일반 상세 모달(openPlaceDetail)을 열 수 없습니다 —
                    // 공원 전용 가벼운 정보 카드(selectedPark)를 대신 띄웁니다.
                    trackEvent("course_stop_click", {
                      authUserId: session?.user?.id ?? null,
                      placeId: String(stop.place.id),
                      placeName: stop.place.name,
                      variant: activeRecVariant,
                      meta: { theme: routeTheme, pos: idx + 1, role: stop.role },
                    });
                    const rawId = String(stop.place.id);
                    if (rawId.startsWith("park-")) {
                      selectParkRef.current(Number(rawId.slice("park-".length)));
                    } else {
                      openPlacePopup(stop.place);
                    }
                    const lat = parseFloat(String(stop.place.lat));
                    const lng = parseFloat(String(stop.place.lng));
                    if (mapRef.current && window.kakao?.maps && !isNaN(lat) && !isNaN(lng)) {
                      mapRef.current.panTo(new window.kakao.maps.LatLng(lat, lng));
                    }
                  }}
                  style={{
                    display: "flex",
                    gap: "10px",
                    padding: "10px 11px",
                    borderRadius: "14px",
                    cursor: "pointer",
                    border: "1px solid rgba(0,0,0,0.05)",
                    background: "#faf7ff",
                    transition: "background 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#f3ebff";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#faf7ff";
                  }}
                >
                  <div
                    style={{
                      width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 800, marginTop: "2px",
                    }}
                  >
                    {idx + 1}
                  </div>

                  {stop.place.image_url ? (
                    <Image
                      src={stop.place.image_url}
                      alt={stop.place.name}
                      width={56}
                      height={56}
                      loading="lazy"
                      style={{ width: "56px", height: "56px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: "56px", height: "56px", borderRadius: "10px", flexShrink: 0, background: "#ece4fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                      {getPlaceEmoji(stop.place) || "🐾"}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <div
                        className="ggk-logo"
                        style={{ fontWeight: 700, fontSize: "12.5px", color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {stop.place.name}
                      </div>
                      {isPlacePremiumNow(stop.place) && (
                        <span title="프리미엄 등록 업장" style={{ display: "inline-flex", alignItems: "center", padding: "1px 5px", borderRadius: 999, flexShrink: 0, background: "linear-gradient(135deg,#F0D28A,#D4A24C)" }}>
                          <Crown size={7} color="#5C4106" />
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "9.5px", color: "#8b5cf6", fontWeight: 700, marginTop: "2px" }}>
                      {stop.tags.join(" · ")}
                      <span style={{ color: "#c4b5fd" }}> · </span>
                      <span style={{ color: "#5b21b6" }}>반려견 친화도 {stop.friendliness}점</span>
                    </div>
                    <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "1px" }}>
                      {stop.bullets.map((b, bi) => (
                        <div key={bi} style={{ fontSize: "10px", color: "#666", display: "flex", alignItems: "center", gap: "3px" }}>
                          <span style={{ color: "#8b5cf6", fontWeight: 800 }}>✓</span>{b}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {stop.distanceToNextKm != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 0 5px 22px", color: "#aaa", fontSize: "10px" }}>
                    <Footprints size={10} />
                    {stop.distanceToNextKm < 1
                      ? `${Math.round(stop.distanceToNextKm * 1000)}m`
                      : `${stop.distanceToNextKm.toFixed(1)}km`}
                    {" "}
                    (도보 약 {Math.max(1, Math.round((stop.distanceToNextKm / 4) * 60))}분)
                  </div>
                )}
              </div>
            ))}
          </div>

          {displayRoute && (
            <div style={{ padding: "10px 12px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => handleRouteDirectionsKakao(displayRoute)}
                  className="ggk-body"
                  style={{
                    flex: 1, padding: "11px 0", borderRadius: "12px", border: "none",
                    background: "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "white",
                    fontWeight: 700, fontSize: "12px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                    boxShadow: "0 3px 10px rgba(124,58,237,0.3)",
                  }}
                >
                  <Navigation size={12} />카카오맵
                </button>
                <button
                  onClick={() => handleRouteDirectionsNaver(displayRoute)}
                  className="ggk-body"
                  style={{
                    flex: 1, padding: "11px 0", borderRadius: "12px", border: "1px solid #03C75A",
                    background: "white", color: "#03C75A",
                    fontWeight: 700, fontSize: "12px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                  }}
                >
                  <Navigation size={12} />네이버지도
                </button>
              </div>
              <div style={{ fontSize: "9px", color: "#bbb", textAlign: "center", marginTop: "6px", lineHeight: 1.4 }}>
                ※ 추천 코스는 AI가 반려견 친화도, 거리, 이용 후기 등을 기반으로 생성했어요.
                <br />※ 네이버지도는 앱이 설치되어 있어야 열립니다(모바일 전용).
              </div>
            </div>
          )}
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

      {/* ── 사장님 등록(전환) 모달 — 로그인 상태에서만 뜹니다(비로그인은 /signup-owner로 이동). */}
      {showOwnerRegisterModal && session?.user && (
        <>
          <div
            onClick={() => setShowOwnerRegisterModal(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", zIndex: 99999 }}
          />
          <div
            className="ggk-body"
            style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: "min(460px, 92vw)", background: "white", borderRadius: "24px",
              padding: "28px", boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
              zIndex: 100000,
            }}
          >
            <button
              onClick={() => setShowOwnerRegisterModal(false)}
              style={{ position: "absolute", top: 18, right: 18, width: 36, height: 36, borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: 16, fontWeight: 700 }}
            >
              ✕
            </button>
            <OwnerUpgradeForm
              userId={session.user.id}
              onDone={() => { setShowOwnerRegisterModal(false); window.location.reload(); }}
            />
          </div>
        </>
      )}
    </>
  );
}