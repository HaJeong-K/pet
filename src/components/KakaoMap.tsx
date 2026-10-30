"use client";

import HomeNoticeBar from "@/components/HomeNoticeBar";
import Image from "next/image";
import { isLodgingCategory } from "@/lib/ownerKind";
import { buildNearestGrid } from "@/lib/nearestGrid";
import LogoLoader from "@/components/LogoLoader";
import { parseSearchIntent, describeIntent, looksLikeRegion, looksLikeLandmark, nameMatchesQuery, SIDO } from "@/lib/searchIntent";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toHttps } from "@/lib/imageUrl";
import { fetchPublicDataPlaces } from "@/lib/publicDataPlaces";
import { fetchParks, type ParkPlace } from "@/lib/parkPlaces";
import { ensureMapTiles, fetchCountBlocks, placeTiles, parkTiles, searchPlacesByName } from "@/lib/mapData";
import { blocksForBounds, bubblesFromPoints, bubblesFromRows, cellDegForCloseLevel, cellDegForLevel, COUNT_MIN_LEVEL, formatBubbleCount, type CountFilter } from "@/lib/tileCounts";
import { countTilesForBounds, expandBounds, tileKey, tilesForBounds, tilesForRadius, type TileXY } from "@/lib/placeTiles";
import { tileQuery } from "@/lib/mapTile";
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
  type RouteTheme, type RouteResult, type RoutablePlace, type StopHighlight,
} from "@/lib/routeRecommend";
import { openKakaoWalk, openNaverWalk, type DirectionPoint } from "@/lib/directions";
import { watchBestPosition } from "@/lib/preciseLocation";
import { rememberPlaces } from "@/lib/placeCache";
import { getPetZoneLabel } from "@/lib/placeConstants";
import { openPlaceDetail as openPlaceDetailShared } from "@/lib/openPlace";
import { trackEvent, extractRegion, getUserKey } from "@/lib/analytics";
import { rememberInterest } from "@/lib/interestRegions";
import { parkToPlace } from "@/lib/parkPlace";
import WelcomeIntro, { shouldShowWelcomeIntro } from "@/components/WelcomeIntro";
import PageGuide from "@/components/PageGuide";
import { saveCourse, deleteSavedCourse, courseTitle, toSavedStops } from "@/lib/savedCourses";
import { MAP_GUIDE_KEY, MAP_GUIDE_STEPS } from "@/lib/pageGuides";
import { assignRecVariant, type RecVariant } from "@/lib/experiment";
import { getImpressionCounts, recordImpressions, clearImpression } from "@/lib/recFatigue";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LocateFixed, Share, MapPin, MapPinPlus, Pencil,
  Link, Upload, MessageCircle, PawPrint, X,
  Search, List, Crown, Store, Route as RouteIcon,
  Footprints, Landmark, Navigation, RefreshCw, ChevronLeft, ChevronRight, Sparkles,
  Stethoscope, Pill, MapPinned, Maximize2, Pin, Menu, SlidersHorizontal, ChevronDown, Bookmark,
  Home, Trees, HousePlus, BedDouble, Sprout,
} from "lucide-react";

// 리스트/신규 장소/추천 장소 패널이 겹치지 않고 화면 폭에 비례해 배치되도록 하는 기준선.
// 이보다 좁은 화면(모바일 세로, 웹 분할화면 등)에서는 리스트·신규·추천 패널을 동시에
// 펼치지 않고 하나씩만(토글) 보여줍니다 — 세 패널을 동시에 다 펼치기엔 가로 폭이
// 부족해서 그대로 두면 서로 겹치거나 화면 밖으로 밀려납니다.
const NARROW_BREAKPOINT = "(max-width: 720px)";

// ── 지도 데이터를 받는 범위(칸 단위 — src/lib/placeTiles.ts) ──
// 지도에 보이는 범위(+여유)와 내 위치 주변의 칸만 받습니다. 예전에는 내 위치 반경 30km(서울은 1만 2천여 곳)를
// 한 번에 받아 두고, 화면이 다시 그려질 때마다 그 전부를 훑었습니다.
/**
 * 이 확대 단계부터(넓게 볼 때)는 장소를 하나하나 그리지 않고 "구역별 장소 수" 동그라미로 보여 줍니다(src/lib/tileCounts.ts).
 * 아래 CLUSTER_ZOOM_THRESHOLD(이름표 대신 묶음으로 바꾸는 단계)와 같은 값이어야 합니다.
 */
const SUMMARY_MIN_LEVEL = COUNT_MIN_LEVEL;
/**
 * 가까이 보는 단계(이름표 단계)라도 화면 안의 장소가 이보다 많으면 이름표 대신 숫자 동그라미로 보여 줍니다.
 * 서울 한복판은 5단계에서 이름표가 500개 넘게 그려져, 지도를 한 번 끌 때마다 PC에서도 3초쯤 멈췄습니다.
 * 한적한 지역은 같은 단계에서도 수십 곳이라 이름표가 그대로 보입니다(이름표가 더 쓸모 있으므로 많을 때만 바꿉니다).
 */
const DENSE_VIEW_LIMIT = 200;
/** 프리미엄 업장을 목록 맨 위에 보여 주는 범위 — 보고 있는 곳(지도 중심)이나 내 위치에서 이 거리(km) 안 */
const PREMIUM_AREA_KM = 3;
/** 프리미엄 업장을 AI 코스에 넣는 범위 — 출발지에서 이 거리(km) 안(걸어서 다녀올 만한 곳만) */
const PREMIUM_COURSE_KM = 2;
/** 이름표를 한 번에(화면 한 장에) 몇 개씩 붙일지 — 한꺼번에 붙이면 그동안 화면이 멈춥니다 */
const PILL_CHUNK = 10;
/** "우리동네·내주변·근처" 검색이 보여 주는 반경(km) — 중심은 내 위치, "경북대 근처"는 그곳 */
const NEAR_ZONE_KM = 2;
/** 그 안에 하나도 없을 때 넓혀 보는 반경(km) */
const NEAR_ZONE_WIDE_KM = 5;
/** "우리동네"에서 읍·면·동을 확인해 볼 후보 수(내 위치에서 가까운 순) */
const DONG_MAX_CANDIDATES = 149;
/** 범위 안에 없어 가장 가까운 곳을 대신 보여 줄 때의 개수 */
const FAR_MATCH_COUNT = 10;
/** 이름으로 찾은 가장 가까운 곳이 이보다 멀면 목록 위에 "가까운 곳이 없어요" 안내를 붙입니다(km) */
const FAR_NOTICE_KM = 5;
/** 화면 범위에 더하는 여유(km) — 지도를 조금 끌어도 바로 보이게 */
const DATA_VIEW_MARGIN_KM = 0.7;
/** 내 위치 주변으로 항상 갖고 있는 반경(km) */
const DATA_HOME_KM = 1.5;
/** 화면 안에 장소가 하나도 없을 때 넓혀서 찾는 반경(km) — 목록의 "반경 10km 안" 대체 표시와 같은 값 */
const DATA_FALLBACK_KM = 10;
/**
 * 화면에 걸치는 칸이 이보다 많으면(지도를 넓게 축소) 칸 대신 예전 방식(반경 30km 한 번)으로 받습니다.
 * 칸이 12개를 넘으면(대략 가로세로 15km 이상) 요청 수십 개로 나눠 받는 것보다 한 번에 받는 편이 빠릅니다.
 */
const DATA_MAX_VIEW_TILES = 12;
/** 넓은 범위(반경 30km)를 이미 받아 뒀다면, 기준점이 이만큼 움직이기 전에는 다시 받지 않습니다(가운데 기준 약 23km가 보장되므로). */
const DATA_WIDE_REUSE_KM = 12;
/** 갖고 있는 칸의 상한 — 넘으면 지금 필요 없는 칸을 먼 것부터 버립니다(오래 돌아다녀도 불어나지 않게). */
const DATA_MAX_TILES = 90;

// 휴대폰 바텀시트: 떠 있는 하단 탭바(아래 20px + 높이 약 62px)를 피하는 여백과, 가장 낮게
// 내렸을 때 보이는 내용 높이(손잡이 + 제목 한 줄)
type SheetSnap = "peek" | "half" | "full";
const SHEET_TAB_SPACE_PX = 92;
const SHEET_PEEK_CONTENT_PX = 64;
// 휴대폰 필터 칩 — 손가락으로 누르기 편한 크기(높이 약 32px)
const MOBILE_CHIP_STYLE: React.CSSProperties = { padding: "7px 12px", fontSize: "12.5px", flexShrink: 0 };
// 지도 필터 — 이모지 대신 같은 모양의 선 아이콘
const ZONE_FILTERS: { key: string; label: string; Icon?: typeof Home }[] = [
  { key: "all", label: "전체" },
  { key: "indoor", label: "실내 동반", Icon: Home },
  { key: "terrace", label: "야외 동반", Icon: Trees },
  { key: "both", label: "실내·야외", Icon: HousePlus },
  { key: "lodging", label: "숙소", Icon: BedDouble },
  { key: "vet", label: "동물병원", Icon: Stethoscope },
  { key: "pharmacy", label: "동물약국", Icon: Pill },
];

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

// 숙소(펜션·호텔·캠핑 등)는 침대 마커 — 분류 이름이 여러 가지라 isLodgingCategory로 판단합니다
const LODGING_EMOJI = "🛏️";
const getPlaceEmoji = (place: any) =>
  CATEGORY_EMOJI[place?.category] || (isLodgingCategory(place?.category) ? LODGING_EMOJI : null) || PET_ZONE_EMOJI[place?.pet_zone] || null;

// ── AI 맞춤 추천 경로 테마 탭 아이콘
// ⚠ 카페 중심/비 오는 날 테마는 제거했습니다(요청) — 남은 테마는 산책 중심/관광 중심/
// 실내 추천 3개입니다.
const ROUTE_THEME_ICON: Record<RouteTheme, typeof Footprints> = {
  walk: Footprints,
  attraction: Landmark,
  indoor: Store,
};

// 관광 중심 코스의 필수 정거장 배지 — 왜 이 정거장이 들어갔는지 보여줍니다.
// "pick"은 근처에 요즘 인기인 곳이 아직 없어 대신 넣은 곳이라 인기 장소처럼 보이지 않게 구분합니다.
const ROUTE_HIGHLIGHT_BADGE: Record<StopHighlight, { label: string; title: string; color: string }> = {
  famous: { label: "유명 관광지", title: "근방의 대표 관광지(관광공사 선정지 우선)", color: "#2563eb" },
  // ⚠ 예전 이름 "후기 HOT"은 후기가 0개인 곳에도 붙었습니다 — 판정이 후기 수뿐 아니라 최근 찜·좋아요,
  // 조회 수까지 합친 점수라서요(2026-09-30 사용자 지적). 기준은 그대로 두고 이름을 실제 의미에 맞게 바꿨습니다.
  hot: { label: "요즘 인기", title: "최근 후기·찜·조회가 많은 곳", color: "#FF7A5C" },
  pick: { label: "추천", title: "근처에 요즘 인기인 곳이 아직 없어 친화도가 높은 곳을 추천했어요", color: "#7c3aed" },
};

// 지도 검색어 — 같은 페이지 세션 안에서만 유지(새로고침하면 초기화). 아래 KakaoMap 참고.
let lastSearchQuery = "";

// ── 저장된 내 위치의 부가정보(정확도·저장 시각·출처) ──
// ⚠ 예전엔 좌표만 기한 없이 저장해서, PC처럼 인터넷(IP) 기반으로 수 km 틀린 위치가 한 번 저장되면
// 그 뒤로 계속 "현재 위치"로 쓰였습니다(새 측정값이 오차 3km를 넘으면 무시하는 규칙까지 겹쳐서).
const LOCATION_META_KEY = "user_loc_meta";
/** 저장된 GPS 위치를 "지금 위치"로 믿는 시간 — 지나면 새 측정값으로 무조건 교체 */
const CACHED_LOCATION_FRESH_MS = 30 * 60 * 1000;
/** 지도에서 직접 지정한 위치를 유지하는 시간 */
const MANUAL_LOCATION_VALID_MS = 24 * 60 * 60 * 1000;
/** 직접 지정한 위치를 이길 만큼 정확한 GPS 측정값(오차 m) */
const MANUAL_OVERRIDE_ACCURACY_M = 100;
/** 이 오차(m)를 넘으면 "위치가 정확하지 않을 수 있어요" 안내를 띄웁니다 */
const UNCERTAIN_LOCATION_M = 1000;

type LocationSource = "gps" | "cache" | "manual";
interface LocationMeta {
  accuracy: number | null;
  at: number;
  source: "gps" | "manual";
}

const readLocationMeta = (): LocationMeta | null => {
  try {
    const meta = JSON.parse(localStorage.getItem(LOCATION_META_KEY) || "null");
    return meta && typeof meta.at === "number" ? meta : null;
  } catch {
    return null;
  }
};

// 지도 오버레이(CustomOverlay)는 HTML 문자열로 그려서, 사용자가 제보한 장소 이름 등을 그대로 넣으면
// 이름에 섞인 태그·스크립트가 실행될 수 있습니다. 오버레이에 넣는 텍스트는 항상 이걸로 감쌉니다.
const escapeHtml = (text: unknown) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const formatAccuracy = (m: number) => (m >= 1000 ? `약 ${Math.round(m / 100) / 10}km` : `약 ${Math.round(m)}m`);

// AI 코스 "동물병원/동물약국 포함" 토글 저장 키(브라우저별 선호 — 다음 방문에도 유지)
const ROUTE_MEDICAL_STORAGE_KEY = "ggk_route_medical";

const readRouteMedicalPref = (): { vet: boolean; pharmacy: boolean } => {
  if (typeof window === "undefined") return { vet: false, pharmacy: false };
  try {
    const saved = JSON.parse(localStorage.getItem(ROUTE_MEDICAL_STORAGE_KEY) || "{}");
    return { vet: saved.vet === true, pharmacy: saved.pharmacy === true };
  } catch {
    return { vet: false, pharmacy: false };
  }
};

// 숙소는 원래 분류 이름(펜션·호텔·게스트하우스 등)을 그대로 보여 줍니다 — "숙소"는 마커·필터용 큰 묶음일 뿐입니다
const getPlaceLabel = (place: any) =>
  CATEGORY_EMOJI[place?.category] || isLodgingCategory(place?.category)
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

// 지도를 특정 위치·확대 수준으로 옮깁니다 — 확대(레벨 변경)를 먼저 한 번에 끝낸 뒤 가운데를 맞춥니다.
// ⚠ 예전엔 곳곳에서 "setCenter → setLevel(animate)" 순서로 옮겼는데, 넓게 축소해 둔 상태처럼 레벨 차이가
// 클 때는 확대 애니메이션 도중에 다른 이동(더 정확한 위치값, 장소 선택 panTo 등)이 겹치면서 목표 지점이
// 화면 가운데에서 벗어나고 이전 축척의 지도 조각이 겹쳐 보였습니다(내 위치 버튼·묶음 마커·검색 공통).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jumpMapTo = (map: any, latLng: any, level: number) => {
  if (!map) return;
  map.setLevel(level);
  map.setCenter(latLng);
};

const tryKakaoAddressSearch = async (
  query: string
): Promise<{ lat: number; lng: number } | null> => {
  try {
    // 카카오 REST 키는 서버에만 있어서 우리 서버(/api/kakao/local)를 거칩니다.
    const res = await fetch(`/api/kakao/local?type=address&query=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
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
      // "OO구 OO동"처럼 세부 단위면 좁게, 시/도 단위면 넓게
      const isDetailed = /\s/.test(trimmed) || /(동|읍|면)$/.test(trimmed);
      jumpMapTo(mapInstance, new window.kakao.maps.LatLng(result.lat, result.lng), isDetailed ? 5 : 8);
      return result;
    }
  }

  return null;
};

/** 지역 이름을 좌표로 바꿉니다(지도는 움직이지 않음). "대구"처럼 뒤 글자가 없으면 시·구·동 등을 붙여 가며 찾습니다. */
const findRegion = async (query: string): Promise<{ lat: number; lng: number; level: number } | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const alreadyHasSuffix = /(시|도|군|구|읍|면|동|리|가|로|길)$/.test(trimmed);
  // 흔한 것부터: 그대로 → 시·구·군·동·읍·면 → 나머지(광역시·도 등)
  const candidates = alreadyHasSuffix ? [trimmed] : [trimmed, ...["시", "구", "군", "동", "읍", "면"].map((suf) => `${trimmed}${suf}`), ...REGION_SUFFIXES.filter((suf) => suf.length > 1 || suf === "도").map((suf) => `${trimmed}${suf}`)];
  for (const candidate of candidates) {
    const result = await tryKakaoAddressSearch(candidate);
    if (result) {
      // 지도 크기: 동·읍·면이나 "OO구 OO동"처럼 자세하면 동네 크기(5), 시·도 이름이면 넓게(8),
      // "성수"·"수원"처럼 뒤 글자 없이 찾은 이름은 그 사이(6).
      const detailed = /\s/.test(trimmed) || /(동|읍|면|리|가|로|길)$/.test(candidate);
      const bareName = candidate === trimmed && !alreadyHasSuffix && !SIDO.includes(trimmed);
      return { ...result, level: detailed ? 5 : bareName ? 6 : 8 };
    }
  }
  return null;
};

/** 학교·역·시장 같은 곳 이름을 좌표로 바꿉니다("경북대 근처 카페"의 "경북대"). 지도 이동에만 씁니다. */
const findLandmark = async (query: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const res = await fetch(`/api/kakao/local?type=keyword&query=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
  } catch {
    return null;
  }
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
    const res = await fetch(`/api/kakao/local?type=region&lat=${lat}&lng=${lng}`);
    if (res.ok) return (await res.json()).result?.sigungu || "";
  } catch {}
  return "";
};

/** 지도 위쪽 도구 버튼 — 흰 바탕·짙은 글씨, 열려 있으면 브랜드 초록으로 채움. inBar면 도구 막대 안(테두리 없음) */
function toolButton(active: boolean, inBar = false): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5, padding: inBar ? "6px 10px" : "6px 11px",
    borderRadius: inBar ? 9 : 10, border: inBar ? "none" : "1px solid rgba(30,30,20,0.1)",
    background: active ? "#5C7A4A" : inBar ? "transparent" : "white", color: active ? "white" : "#3a3a32",
    fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Noto Sans KR', sans-serif",
    boxShadow: inBar ? "none" : "0 2px 8px rgba(30,30,20,0.07)", transition: "background 0.15s ease, color 0.15s ease",
  };
}

export default function KakaoMap() {
  const router = useRouter();

  // ── 장소 상세로 이동: 동물병원·동물약국은 새 창(팝업)으로, 그 외는 기존 인앱 모달로
  const openPlaceDetail = (place: any) => openPlaceDetailShared(router, place);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mapReady, setMapReady] = useState(false);
  const focusRequestedRef = useRef(searchParams.has("focusLat"));
  const mapRef = useRef<any>(null);
  const [session, setSession] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // ── 사장님 등록(전환) 버튼 — 사장님 가입·전환 페이지(/signup-owner)로 이동합니다.
  const [ownerCheckLoading, setOwnerCheckLoading] = useState(false);

  // ── 마커: Map 객체로 관리 (증분 업데이트) — 상세 pill 마커(CustomOverlay)용
  const markerMapRef = useRef<Map<number, any>>(new Map());
  // ── 클러스터링용: 넓은 줌에서 쓰는 경량 Marker + MarkerClusterer
  const clustererRef = useRef<any>(null);
  const clusterMarkersRef = useRef<any[]>([]);
  // ── 공원 마커: places와 완전히 별도 레이어라 refs/클러스터러도 따로 둡니다
  // (places 마커 로직을 건드리지 않고 독립적으로 켜고 끌 수 있도록).
  const parkMarkerMapRef = useRef<Map<number, any>>(new Map());
  // 이름표를 나눠 그리는 작업의 번호 — 새로 그리기가 시작되면 올려서, 앞서 예약한 나머지 그리기를 멈춥니다.
  const pillJobRef = useRef(0);
  const parkPillJobRef = useRef(0);
  /** 이름표에 적힌 이름(장소 정보가 바뀌었는지 확인용) */
  const pillNameRef = useRef<Map<number, string>>(new Map());
  const parkClustererRef = useRef<any>(null);
  const parkClusterMarkersRef = useRef<any[]>([]);
  const [selectedPark, setSelectedPark] = useState<ParkPlace | null>(null);
  const [showParks, setShowParks] = useState(true);
  // ── 현위치 오버레이
  const locationOverlayRef = useRef<any>(null);
  // "내 위치로" 버튼의 위치 보정 측정 중단 함수 — 다시 누르거나 화면을 떠나면 이전 측정을 멈춥니다.
  const stopMyLocationWatchRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopMyLocationWatchRef.current?.(), []);

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
  // 현재 위치의 오차(m)·출처 — 오차 원과 "위치가 정확하지 않을 수 있어요" 안내에 씁니다.
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  // 처음 위치 측정이 끝났는지(성공·실패 무관) — 저장된 위치를 그대로 쓰게 됐는지 판단할 때 씁니다.
  const [gpsSettled, setGpsSettled] = useState(false);
  const [locationNoticeDismissed, setLocationNoticeDismissed] = useState(false);
  // "지도에서 내 위치 지정" 모드 — 지도 가운데 핀을 옮겨 내 위치를 직접 찍습니다.
  const [pickingLocation, setPickingLocation] = useState(false);
  // 직접 지정한 위치(유효 시간 안이면 부정확한 GPS 값으로 덮어쓰지 않음). 콜백 안에서 최신 값을 봐야 해서 ref.
  const manualLocationRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const accuracyCircleRef = useRef<any>(null);
  // 아래 "지역 범위로 공공데이터 재요청" 효과가 이미 어느 좌표로 재요청했는지 기록해서,
  // GPS 좌표가 미세하게(수백m 이내) 흔들릴 때마다 매번 네트워크를 다시 타지 않도록 합니다.
  // ⚠ 속도: 지도 그림(타일)이 화면에 처음 그려졌는지. 장소 데이터(서울은 1만 곳 이상)를 화면에 반영하는 계산이
  // 0.5초쯤 걸리는데, 데이터가 지도보다 먼저 도착하면 그 계산이 끝날 때까지 지도 자체가 뜨지 못했습니다.
  // 지도를 먼저 그리고 나서 장소를 올리도록, 데이터 반영 쪽이 이 값을 기다립니다(waitForMapPaint).
  const mapPaintedRef = useRef(false);
  const waitForMapPaint = async () => {
    // 지도가 끝내 안 뜨는 경우(지도 엔진을 못 받음 등)에도 목록은 보여야 하므로 최대 3초만 기다립니다.
    for (let waited = 0; waited < 3000 && !mapPaintedRef.current; waited += 40) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  };
  // ── 검색으로 지도를 이동시켰을 때의 중심 좌표 (리스트 패널 반경 기준 우선순위: 검색 > 실제 위치)
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  // 검색으로 찾아간 곳을 "관심 지역"으로 이 기기에만 기억합니다(src/lib/interestRegions.ts — 배너 광고 고르기에만 씀).
  useEffect(() => {
    if (searchCenter) rememberInterest(searchCenter.lat, searchCenter.lng, "search");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCenter?.lat, searchCenter?.lng]);
  // ── 현재 지도 화면(뷰포트)의 경계. 지도를 드래그/확대·축소할 때마다 갱신되고,
  // 리스트 패널(nearbyPlaces)이 고정 반경 대신 "지금 화면에 보이는 영역"을 기준으로
  // 장소를 보여주는 데 씁니다.
  const [mapBounds, setMapBounds] = useState<{ swLat: number; swLng: number; neLat: number; neLng: number } | null>(null);
  // 지도 확대 단계(카카오맵 level — 클수록 넓게 봄). 지도가 멈출 때마다 mapBounds와 함께 갱신됩니다.
  const [mapLevel, setMapLevel] = useState<number | null>(null);

  // ── 검색: 입력값 / 디바운스값 분리 (새로고침해도 마지막 검색어 유지)
  // 검색어는 모듈 메모리(lastSearchQuery)에만 기억합니다 — 커뮤니티 등 다른 탭에 갔다 돌아오면
  // 그대로 유지되고, 새로고침하면 비워져서 현재 위치 기준 지도로 돌아옵니다(요청사항).
  // ⚠ 예전엔 localStorage에 저장해서 새로고침해도 이전 검색 지역이 계속 기준이 됐습니다.
  // (KakaoMapLoader가 ssr:false로 불러오므로 첫 렌더부터 이 값을 써도 하이드레이션 불일치가 없습니다.)
  const [searchQuery, setSearchQuery] = useState(lastSearchQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(lastSearchQuery);

  useEffect(() => {
    lastSearchQuery = searchQuery;
  }, [searchQuery]);

  // 예전 버전이 저장해 둔 검색어가 남아 있으면 지웁니다.
  useEffect(() => {
    try {
      localStorage.removeItem("ggk_search_query");
    } catch {}
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
        toHttps(
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          user.user_metadata?.profile_image || null,
        );
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
      toHttps(
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        user.user_metadata?.profile_image || null,
      );
    const { error } = await supabase.from("users").upsert([
      { auth_user_id: user.id, email: user.email || "", nickname, avatar_url: avatarUrl },
    ], { onConflict: "auth_user_id" });
    if (error) console.error("유저 프로필 생성 오류:", JSON.stringify(error));
  };

  const selectPlaceRef = useRef<(id: number) => void>(() => {});
  const selectParkRef = useRef<(id: number) => void>(() => {});
  const [places, setPlaces] = useState<any[]>([]);
  // 지도가 받은 장소 데이터를 상세 팝업과 나눠 씁니다 — 팝업이 서버 응답을 기다리지 않고 바로 뜹니다.
  useEffect(() => { rememberPlaces(places); }, [places]);
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
  // 마지막으로 화면을 맞춘(setBounds) 코스 — 같은 코스를 다시 그릴 땐 화면을 다시 맞추지 않습니다.
  const routeFittedSignatureRef = useRef<string>("");
  // 지도가 애니메이션 줌(setLevel animate) 중인지 — zoom_start ~ idle 구간
  const mapZoomingRef = useRef(false);

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

  // ── AI 코스에 동물병원/동물약국을 넣을지(패널 토글). 켜면 각각 1곳씩 코스 자리를 차지합니다.
  // 토글은 패널(처음엔 닫혀 있음) 안에만 보여서 저장값으로 초기화해도 하이드레이션 불일치가 없습니다.
  const [routeIncludeVet, setRouteIncludeVet] = useState(() => readRouteMedicalPref().vet);
  const [routeIncludePharmacy, setRouteIncludePharmacy] = useState(() => readRouteMedicalPref().pharmacy);
  // AI 코스를 보는 동안 코스와 무관한 장소·공원 마커도 함께 볼지(기본 끔 — 코스 장소만 표시)
  const [showNearbyInCourse, setShowNearbyInCourse] = useState(false);
  // AI 코스 패널의 옵션(병원·약국 포함, 주변 장소 표시)은 평소엔 접어 두어 정거장 목록 자리를 넓힙니다.
  const [showRouteOptions, setShowRouteOptions] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(ROUTE_MEDICAL_STORAGE_KEY, JSON.stringify({ vet: routeIncludeVet, pharmacy: routeIncludePharmacy }));
    } catch {}
  }, [routeIncludeVet, routeIncludePharmacy]);

  // ── "다른 코스 보기": 클릭 시 직전 코스에 나온 정거장들을 제외하고 재계산합니다.
  // 테마를 바꾸거나 패널을 새로 열면 초기화됩니다.
  const [routeExcludedIds, setRouteExcludedIds] = useState<Set<string | number>>(new Set());
  // 사용자가 핀으로 고정한 정거장 — "다른 코스 보기"를 눌러도 코스에 계속 남습니다.
  const [pinnedStopIds, setPinnedStopIds] = useState<Set<string | number>>(new Set());
  // 코스 계산에 실제로 쓰는 고정 목록 — "다른 코스 보기"를 누를 때만 갱신합니다.
  // (핀을 누를 때마다 바로 반영하면 고정 슬롯이 생기면서 나머지 정거장까지 재배치돼, 핀만
  //  눌렀는데 코스가 바뀌어 버렸습니다.)
  const [appliedPinnedIds, setAppliedPinnedIds] = useState<Set<string | number>>(new Set());
  const togglePinnedStop = (id: string | number) =>
    setPinnedStopIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── 반응형: 리스트/신규 장소/추천 장소 패널이 화면 폭에 맞게 겹치지 않도록.
  // 좁은 화면(모바일 세로, 분할화면 등)에서는 리스트 패널을 기본으로 숨기고 토글로만
  // 보여주며, 신규/추천 패널을 열면 리스트 패널은 자동으로 닫힙니다(반대도 마찬가지).
  // 넓은 화면에서는 예전처럼 리스트 패널이 항상 보입니다.
  const isNarrowScreen = useMediaQuery(NARROW_BREAKPOINT);
  // 도구 막대에 이름까지 넣을 만큼 넓은지 — 좁으면 같은 막대에 아이콘만(마우스를 올리면 이름)
  const toolbarLabels = useMediaQuery("(min-width: 1240px)");
  const [showListPanelMobile, setShowListPanelMobile] = useState(false);
  // 휴대폰에서는 목록이 바텀시트로 항상 깔려 있고(지도 앱 공통 패턴), 신규·추천·AI 코스를
  // 열면 그 시트가 목록 자리를 대신합니다. (showListPanelMobile은 예전 "목록" 버튼용 — 지금은 안 씀)
  const showListPanel = !isNarrowScreen || (!showRecentPanel && !showRecommendPanel && !showRoutePanel);
  void showListPanelMobile;

  // ── 첫 방문 안내 ── 화면의 버튼·영역을 하나씩 짚어 주는 안내는 공용 PageGuide가 맡습니다
  // (문구: src/lib/pageGuides.ts). 아이콘만 있는 버튼이 많아서 처음 온 사용자에게 한 번 보여 줍니다.
  const recentBtnRef = useRef<HTMLButtonElement>(null);
  const recommendBtnRef = useRef<HTMLButtonElement>(null);
  const routeBtnRef = useRef<HTMLButtonElement>(null);
  const ownerBtnRef = useRef<HTMLButtonElement>(null);
  const jeboBtnRef = useRef<HTMLButtonElement>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement>(null);
  // 휴대폰 전용 기능 메뉴(아래에서 올라오는 시트)
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  // 기능 메뉴 시트를 손가락으로 아래로 끌어 닫기(지도 앱·OS 공통 동작)
  const [menuDragY, setMenuDragY] = useState(0);
  const menuDragRef = useRef<{ startY: number } | null>(null);
  const onMenuPointerDown = (e: React.PointerEvent) => {
    menuDragRef.current = { startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMenuPointerMove = (e: React.PointerEvent) => {
    if (!menuDragRef.current) return;
    setMenuDragY(Math.max(0, e.clientY - menuDragRef.current.startY));
  };
  const onMenuPointerUp = () => {
    if (!menuDragRef.current) return;
    menuDragRef.current = null;
    if (menuDragY > 70) setShowMobileMenu(false);
    setMenuDragY(0);
  };
  // 첫 방문 소개(서비스가 무엇을 해 주는지 네 장으로 — src/components/WelcomeIntro.tsx). 앱을 새로 열 때마다 한 번 뜨고,
  // "다시 보지 않기"를 누르면 더 뜨지 않습니다. 떠 있는 동안에는 화면 안내를 미루고, 닫으면 이어서 시작합니다.
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const [demoNoticeChecked, setDemoNoticeChecked] = useState(false);
  useEffect(() => {
    if (shouldShowWelcomeIntro()) setShowDemoNotice(true);
    setDemoNoticeChecked(true);
  }, []);

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
  // 공지 줄이 붙어 헤더가 길어지면 넓은 화면에서도 그만큼 아래로 내립니다.
  const panelTop = isNarrowScreen ? `${headerHeight + 12}px` : `${Math.max(122, headerHeight + 42)}px`;

  // ── 휴대폰 바텀시트 ──
  // 네이버·카카오·구글 지도처럼 목록/신규/추천/AI 코스 패널을 화면 아래에서 올라오는 시트로
  // 보여줍니다. 손잡이를 끌어 3단계(낮게: 제목만 · 반: 목록 · 전체)로 조절하고, 지도를 움직이면
  // 자동으로 낮게 내려가 지도를 가리지 않습니다. 시트는 화면 맨 아래까지 깔리고, 떠 있는
  // 하단 탭바 높이만큼 안쪽 여백을 둬서 내용이 탭바에 가리지 않게 합니다.
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [sheetDragPx, setSheetDragPx] = useState<number | null>(null);
  const [viewportH, setViewportH] = useState(800);
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const sheetSnapPx: Record<SheetSnap, number> = {
    peek: SHEET_TAB_SPACE_PX + SHEET_PEEK_CONTENT_PX,
    half: Math.max(SHEET_TAB_SPACE_PX + 180, Math.round(viewportH * 0.5)),
    full: Math.max(SHEET_TAB_SPACE_PX + 200, viewportH - headerHeight - 18),
  };
  const sheetPx = sheetDragPx ?? sheetSnapPx[sheetSnap];
  // 시트 위에 떠야 하는 것들(내 위치·공유 버튼, 장소 카드 등)의 기준 높이
  const mobileBottomInset = sheetPx;

  // 패널을 열면 반쯤, 장소 카드·위치 지정처럼 지도를 봐야 할 때는 낮게 내립니다.
  useEffect(() => {
    if (!isNarrowScreen) return;
    if (showRecentPanel || showRecommendPanel || showRoutePanel) setSheetSnap("half");
    else setSheetSnap("peek");
  }, [isNarrowScreen, showRecentPanel, showRecommendPanel, showRoutePanel]);
  useEffect(() => {
    if (isNarrowScreen && (selectedPlace || selectedPark || pickingLocation)) setSheetSnap("peek");
  }, [isNarrowScreen, selectedPlace, selectedPark, pickingLocation]);

  const sheetDragRef = useRef<{ startY: number; startPx: number; moved: boolean } | null>(null);
  // 목록 대신 떠 있는 패널(신규·추천·AI 코스)은 아래로 끝까지 끌어내리면 닫힙니다.
  const sheetClosable = showRecentPanel || showRecommendPanel || showRoutePanel;
  const SHEET_CLOSE_DRAG_PX = 60;
  const closeSheetPanel = () => {
    setShowRecentPanel(false);
    setShowRecommendPanel(false);
    setShowRoutePanel(false);
  };
  const onSheetPointerDown = (e: React.PointerEvent) => {
    sheetDragRef.current = { startY: e.clientY, startPx: sheetPx, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSheetPointerMove = (e: React.PointerEvent) => {
    const d = sheetDragRef.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const minPx = sheetClosable ? SHEET_TAB_SPACE_PX : sheetSnapPx.peek;
    setSheetDragPx(Math.min(sheetSnapPx.full, Math.max(minPx, d.startPx + dy)));
  };
  const onSheetPointerUp = (e: React.PointerEvent) => {
    const d = sheetDragRef.current;
    sheetDragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      // 손잡이를 톡 누르면: 낮게 → 반 → 전체 → 반
      setSheetSnap((cur) => (cur === "peek" ? "half" : cur === "half" ? "full" : "half"));
      return;
    }
    const cur = d.startPx + (d.startY - e.clientY);
    if (sheetClosable && cur < sheetSnapPx.peek - SHEET_CLOSE_DRAG_PX) {
      setSheetDragPx(null);
      closeSheetPanel();
      return;
    }
    // 가장 가까운 단계로 붙이되, 빠르게 튕긴 방향도 반영(20px 이상 움직였으면 그쪽으로 한 단계)
    const order: SheetSnap[] = ["peek", "half", "full"];
    let best: SheetSnap = order.reduce((a, b) => (Math.abs(sheetSnapPx[b] - cur) < Math.abs(sheetSnapPx[a] - cur) ? b : a));
    const startSnap = order.reduce((a, b) => (Math.abs(sheetSnapPx[b] - d.startPx) < Math.abs(sheetSnapPx[a] - d.startPx) ? b : a));
    if (best === startSnap && Math.abs(cur - d.startPx) > 20) {
      const i = order.indexOf(startSnap) + (cur > d.startPx ? 1 : -1);
      best = order[Math.min(2, Math.max(0, i))];
    }
    setSheetSnap(best);
    setSheetDragPx(null);
  };

  // 휴대폰에서 패널 바깥 틀을 바텀시트로 바꾸는 스타일(PC 스타일 뒤에 덮어씀)
  const mobileSheetStyle = (zIndex: number): React.CSSProperties => ({
    position: "fixed",
    top: "auto",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: `${sheetPx}px`,
    maxHeight: "none",
    borderRadius: "20px 20px 0 0",
    border: "none",
    boxShadow: "0 -6px 24px rgba(0,0,0,0.12)",
    zIndex,
    display: "block",
    overflowX: "hidden",
    overflowY: sheetSnap === "peek" && sheetDragPx == null ? "hidden" : "auto",
    overscrollBehavior: "contain",
    paddingBottom: `calc(${SHEET_TAB_SPACE_PX}px + env(safe-area-inset-bottom))`,
    boxSizing: "border-box",
    transition: sheetDragPx == null ? "height 0.25s ease" : "none",
  });
  const renderSheetHandle = () => (
    <div
      onPointerDown={onSheetPointerDown}
      onPointerMove={onSheetPointerMove}
      onPointerUp={onSheetPointerUp}
      onPointerCancel={() => { sheetDragRef.current = null; setSheetDragPx(null); }}
      role="button"
      aria-label={sheetSnap === "full" ? "목록 줄이기" : "목록 더 보기"}
      title={sheetClosable ? "끌어서 크기 조절 · 끝까지 내리면 닫혀요" : "끌어서 크기 조절"}
      style={{
        position: "sticky", top: 0, zIndex: 3, height: 22, background: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        touchAction: "none", cursor: "grab",
      }}
    >
      <div style={{ width: 40, height: 5, borderRadius: 3, background: "#d9dce1" }} />
    </div>
  );

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
    // 미리보기 카드가 뜨는 순간 상세 팝업 화면을 미리 받아둡니다 — "자세히 보기"를 누르면
    // 화면 전환을 기다리지 않고 바로 열립니다.
    if (place?.id != null) router.prefetch(`/place/${place.id}`);
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
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
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
      // 전국 장소 데이터는 Supabase `places` 테이블 조회 한 번으로 가져옵니다
      // (옛 AWS DynamoDB 데이터는 2026-08-03에 이 테이블로 이관 완료).
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
      await waitForMapPaint();
      if (cancelled) return;
      // ⚠ 공공데이터 장소(칸 단위)가 이보다 먼저 들어와 있을 수 있습니다(다른 탭에 갔다 돌아오면 이미 받아 둔 칸이 바로
      // 반영됩니다). 통째로 바꾸면 그게 지워져 지도가 텅 비므로, 우리 DB 장소만 바꿔 끼웁니다.
      setPlaces((prev) => [...(placesData || []), ...prev.filter((p) => p.source === "public-data")]);
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

      // 공공데이터 장소·공원은 아래 "지도 데이터 받기" 효과가 칸 단위로 받습니다(지도에 보이는 범위만).
    };
    init();
    // ⚠ 예전엔 이 콜백이 비어 있어서(auth 이벤트를 구독만 하고 아무것도 안 함), 로그인
    // 직후 세션이 비동기로 복원되는 타이밍(토큰 자동 갱신 등)에 이 컴포넌트의 session
    // state가 갱신되지 않는 경우가 있었습니다. 그 결과 실제로는 로그인된 상태인데도
    // "사장님 등록" 버튼이 session을 null로 보고 비회원 가입 폼(이메일/비밀번호 입력)으로
    // 잘못 보내는 문제가 있었습니다. 이제 세션이 바뀔 때마다 실제로 반영합니다.
    // ⚠ 이 콜백 안에서 supabase 호출을 await하면 안 됩니다. 콜백은 인증 잠금을 쥔 채 실행돼서,
    // 토큰이 갱신되는 순간(로그인 약 1시간 뒤·탭 복귀 시) 교착에 빠지고 그 뒤 모든 supabase
    // 호출이 영영 멈춥니다(마이페이지 흰 화면의 원인). 조회는 setTimeout으로 잠금이 풀린 뒤에 합니다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      const user = newSession?.user;
      if (user) setTimeout(() => { if (!cancelled) createUserProfile(user); }, 0);
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
  // 위치 저장(좌표 + 지역명 + 정확도·시각·출처). 지역명 조회 API는 저장할 때 한 번만 부릅니다.
  const saveLocation = async (loc: { lat: number; lng: number }, meta: LocationMeta) => {
    const region = await reverseGeocode(loc.lat, loc.lng);
    setUserRegion(region);
    try {
      localStorage.setItem("user_lat", String(loc.lat));
      localStorage.setItem("user_lng", String(loc.lng));
      localStorage.setItem("user_region", region);
      localStorage.setItem(LOCATION_META_KEY, JSON.stringify(meta));
    } catch {}
  };

  /** 직접 지정한 위치가 아직 유효한지 */
  const manualLocationActive = () =>
    !!manualLocationRef.current && Date.now() - manualLocationRef.current.at < MANUAL_LOCATION_VALID_MS;

  useEffect(() => {
    const savedLat    = localStorage.getItem("user_lat");
    const savedLng    = localStorage.getItem("user_lng");
    const savedRegion = localStorage.getItem("user_region");
    const savedMeta   = readLocationMeta();

    if (savedLat && savedLng && savedRegion) {
      const lat = parseFloat(savedLat);
      const lng = parseFloat(savedLng);
      setUserLocation({ lat, lng });
      setUserRegion(savedRegion);
      // 정확도 정보가 없는 예전 저장값은 오차를 모르는 것으로 둡니다(측정이 끝나도 못 바꾸면 안내 표시).
      setLocationAccuracy(savedMeta?.accuracy ?? null);
      if (savedMeta?.source === "manual" && Date.now() - savedMeta.at < MANUAL_LOCATION_VALID_MS) {
        manualLocationRef.current = { lat, lng, at: savedMeta.at };
        setLocationSource("manual");
      } else {
        setLocationSource("cache");
      }
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
        jumpMapTo(mapRef.current, new window.kakao.maps.LatLng(lat, lng), 3);
        mapRef.current.relayout();
      }
      // 캐시가 있으면 "위치 확인 중" 오버레이 없이 바로 그 위치로 보여줍니다.
      setLocating(false);
    }

    // 캐시 유무와 무관하게 항상 최신 GPS 위치를 다시 조회해 갱신(여행지 이동 반영).
    // 권한 거부/조회 실패 시엔 위에서 세팅한 캐시 값이 그대로 유지됩니다.
    // ⚠ 예전엔 getCurrentPosition을 한 번만(그것도 5분 전 위치 재사용 허용으로) 불러서,
    // 휴대폰이 GPS를 잡기 전에 주는 대략적인 위치(와이파이·기지국, 오차 수십~수백 m)가 그대로
    // 쓰여 매번 위치가 조금씩 어긋났습니다. 이제 최대 12초 동안 측정값을 계속 받아 더 정확한
    // 값이 올 때마다 갈아끼웁니다(lib/preciseLocation.ts).
    // 저장된 GPS 위치가 최근(30분 이내)이고 오차도 알 때만 "믿을 만한 저장 위치"로 봅니다.
    const trustedCache =
      savedLat && savedLng && savedMeta?.source === "gps" && savedMeta.accuracy != null &&
      Date.now() - savedMeta.at < CACHED_LOCATION_FRESH_MS
        ? savedMeta.accuracy
        : null;
    let applied: { lat: number; lng: number } | null = null;
    let appliedAccuracy = Infinity;
    const stopWatching = watchBestPosition(
      async (fix, final) => {
        // 직접 지정한 위치는 그보다 확실히 정확한 GPS 값이 아니면 덮어쓰지 않습니다(PC 등 GPS가 없는 환경).
        const keepManual = manualLocationActive() && fix.accuracy > MANUAL_OVERRIDE_ACCURACY_M;
        // 최근에 저장한 정확한 위치보다 훨씬 나쁜(IP 기반, 오차 3km 초과) 값으로는 덮어쓰지 않습니다.
        // ⚠ 예전엔 저장 위치가 오래됐거나 원래 부정확해도 이 규칙으로 계속 지켜져서 틀린 위치가 고착됐습니다.
        const keepCache = !applied && trustedCache != null && fix.accuracy > 3000 && fix.accuracy > trustedCache;
        if (keepManual || keepCache) {
          setLocating(false);
          if (final) setGpsSettled(true);
          return;
        }
        const map = mapRef.current;
        const isFirst = applied === null;
        // 보정값이 이전 값과 거의 같으면(15m 이내) 화면 전체를 다시 계산할 필요가 없습니다.
        const movedM = applied ? getDistance(applied.lat, applied.lng, fix.lat, fix.lng) * 1000 : Infinity;
        if (movedM > 15) {
          // 사용자가 그사이 지도를 옮기지 않았을 때만(지도 중심이 직전 위치 그대로일 때만) 따라갑니다.
          const center = map?.getCenter?.();
          const mapStillOnMe =
            !focusRequestedRef.current && (isFirst || !center || !applied || getDistance(center.getLat(), center.getLng(), applied.lat, applied.lng) * 1000 < 30);
          applied = { lat: fix.lat, lng: fix.lng };
          setUserLocation(applied);
          pendingLocationRef.current = applied;
          if (isFirst) setSearchCenter(null); // 실제 위치를 처음 받으면 이전 검색 기준 중심은 초기화
          if (map && mapStillOnMe) {
            if (isFirst) {
              jumpMapTo(map, new window.kakao.maps.LatLng(fix.lat, fix.lng), 3);
              map.relayout();
            } else {
              map.setCenter(new window.kakao.maps.LatLng(fix.lat, fix.lng));
            }
          }
        }
        appliedAccuracy = fix.accuracy;
        setLocationAccuracy(fix.accuracy);
        setLocationSource("gps");
        setLocating(false);
        // 지역명 조회·저장은 측정이 끝났을 때 한 번만(보정될 때마다 API를 부르지 않게)
        if (final) {
          setGpsSettled(true);
          if (applied) saveLocation(applied, { accuracy: appliedAccuracy, at: Date.now(), source: "gps" });
        }
      },
      () => { setLocating(false); setGpsSettled(true); /* 조회 실패/거부 — 캐시(있다면)를 그대로 유지 */ }
    );
    return stopWatching;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // 오차 범위 원 — 파란 점이 "이 범위 어딘가"라는 걸 보여줍니다. 너무 크면(IP 기반, 수 km)
    // 지도 전체를 덮기만 해서 그리지 않고 상단 안내로 대신 알립니다.
    accuracyCircleRef.current?.setMap(null);
    accuracyCircleRef.current = null;
    if (locationSource !== "manual" && locationAccuracy != null && locationAccuracy >= 30 && locationAccuracy <= 3000) {
      const circle = new window.kakao.maps.Circle({
        center: position,
        radius: locationAccuracy,
        strokeWeight: 1,
        strokeColor: "#2563eb",
        strokeOpacity: 0.35,
        fillColor: "#2563eb",
        fillOpacity: 0.08,
      });
      circle.setMap(mapRef.current);
      accuracyCircleRef.current = circle;
    }
  }, [userLocation, mapReady, locationAccuracy, locationSource]);

  // 숙소 화면의 "지도에서 근처 동반 장소 보기" — 그 숙소를 가운데 두고 지도를 보여 줍니다(/?focusLat=&focusLng=&focusName=).
  // 숙소가 지도 목록에 없어도 좌표로 옮기고, 이름표를 띄웁니다. 내 위치(GPS)가 나중에 잡혀도 지도를 끌고 가지 않습니다.
  useEffect(() => {
    const lat = Number(searchParams.get("focusLat")), lng = Number(searchParams.get("focusLng"));
    if (!mapReady || !mapRef.current || !window.kakao?.maps || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
    const position = new window.kakao.maps.LatLng(lat, lng);
    jumpMapTo(mapRef.current, position, 5);
    mapRef.current.relayout();
    setSearchCenter({ lat, lng });
    const name = searchParams.get("focusName");
    if (!name) return;
    const label = document.createElement("div");
    label.textContent = name;
    label.style.cssText = "padding:7px 12px;border-radius:999px;background:#1D4F91;color:white;font-size:13px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;font-family:inherit";
    const overlay = new window.kakao.maps.CustomOverlay({ position, content: label, yAnchor: 1.4, zIndex: 20 });
    overlay.setMap(mapRef.current);
    return () => overlay.setMap(null);
  }, [mapReady, searchParams]);

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
  const baseFilteredPlaces = useMemo(() => {
    if (selectedPetZone === "vet") {
      return places.filter((p) => p.category === "동물병원");
    } else if (selectedPetZone === "pharmacy") {
      return places.filter((p) => p.category === "동물약국");
    } else if (selectedPetZone === "lodging") {
      return places.filter((p) => isLodgingCategory(p.category));
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

  // ── 검색어 풀이: "우리동네 핫플", "대구 삼덕동 카페", "우리동네 스타벅스" 같은 말을 "어디에서 · 무엇을"로 풉니다 ──
  // 규칙은 src/lib/searchIntent.ts에 있습니다. 아는 낱말이 없는 검색어("스타벅스", "대구 중구")는 예전 방식 그대로
  // (가게 이름 → 없으면 지역 이름) 동작합니다.
  const searchIntent = useMemo(() => parseSearchIntent(debouncedSearch), [debouncedSearch]);
  // 아는 낱말을 빼고 남은 말(rest)이 지역인지 가게 이름인지 확인한 결과. 확인은 아래 "지도 이동" 효과가 합니다.
  const [intentRest, setIntentRest] = useState<{ query: string; where: string | null; keyword: string | null; anchorId?: string | null } | null>(null);
  const intentRestNow = intentRest && intentRest.query === debouncedSearch.trim() ? intentRest : null;
  // "우리동네 OO"의 OO는 지역일 리 없으니 바로 가게 이름으로 봅니다.
  const intentKeyword = !searchIntent.structured ? null : searchIntent.nearMe ? (searchIntent.rest || null) : intentRestNow?.keyword ?? null;
  const intentWhere = searchIntent.structured && !searchIntent.nearMe ? intentRestNow?.where ?? null : null;
  /** "올리브영 경북대점 근처 카페"처럼 우리 지도의 특정 가게를 기준으로 삼았을 때 그 가게의 id */
  const anchorId = searchIntent.structured && searchIntent.around ? intentRestNow?.anchorId ?? null : null;

  /** 요즘 많이 찾는 정도 — HOT 배지 기준(최근 30일 조회수)과 찜·좋아요를 합친 값. "핫플" 검색의 기준·정렬에 씁니다. */
  const heatOf = useCallback((id: string | number, isPark = false) => {
    const views = recentViewCounts.get(isPark ? `park-${id}` : String(id)) ?? 0;
    const pop = isPark ? undefined : popularityMap.get(String(id));
    const liked = (pop?.bookmarks ?? 0) * RECOMMEND_WEIGHTS.POPULARITY_BOOKMARK_PER + (pop?.likes ?? 0) * RECOMMEND_WEIGHTS.POPULARITY_LIKE_PER;
    return { views, liked, hot: views >= CARD_BADGE.HOT_VIEW_MIN || liked > 0 };
  }, [recentViewCounts, popularityMap]);

  // ── "근처" 검색의 범위 ──
  // "우리동네 카페"·"내주변 카페"는 내 위치, "경북대 근처 카페"는 찾은 곳(searchCenter)을 중심으로 반경 NEAR_ZONE_KM 안만 보여 줍니다.
  // 지도를 다른 데로 옮겨도 이 범위 밖의 마커는 뜨지 않고, 목록도 화면이 아니라 중심에서 가까운 순으로 고정됩니다.
  // 그 안에 하나도 없으면(한적한 지역) NEAR_ZONE_WIDE_KM까지 넓혀 가장 가까운 곳들을 보여 줍니다.
  const zoneCenter = useMemo(() => {
    if (!searchIntent.structured) return null;
    if (searchIntent.nearMe) return userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null;
    if (searchIntent.around && intentWhere && searchCenter) return { lat: searchCenter.lat, lng: searchCenter.lng };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIntent, userLocation?.lat, userLocation?.lng, intentWhere, searchCenter?.lat, searchCenter?.lng]);

  const intentMatches = useMemo(() => {
    if (!searchIntent.structured) return null;
    // 종류를 말했으면(카페·동물병원 등) 위쪽 실내/야외 버튼과 상관없이 그 종류에서 찾습니다. 공원만 찾으면 장소는 비웁니다.
    let list: any[];
    if (searchIntent.categories.length > 0) {
      const wanted = new Set(searchIntent.categories);
      list = places.filter((p) => wanted.has(p.category));
    } else if (searchIntent.parks) {
      list = [];
    } else {
      list = baseFilteredPlaces;
    }
    if (searchIntent.zone === "indoor") list = list.filter((p) => p.pet_zone === "indoor" || p.pet_zone === "both");
    if (searchIntent.zone === "outdoor") list = list.filter((p) => p.pet_zone === "terrace" || p.pet_zone === "both");
    if (searchIntent.largeDog) list = list.filter((p) => !!p.large_dog);
    if (searchIntent.badge === "new") {
      // NEW 배지와 같은 기준(등록한 지 NEW_PLACE_WINDOW_DAYS일 이내)
      const since = Date.now() - RECOMMEND_WEIGHTS.NEW_PLACE_WINDOW_DAYS * 86400000;
      list = list.filter((p) => { const at = p.created_at ? new Date(p.created_at).getTime() : NaN; return !Number.isNaN(at) && at >= since && at <= Date.now(); });
    }
    if (searchIntent.badge === "hot") list = list.filter((p) => heatOf(p.id).hot);
    if (intentKeyword) {
      const q = intentKeyword.toLowerCase();
      list = list.filter((p) => nameMatchesQuery(p.name, q) || p.category?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q));
    }
    return list;
  }, [searchIntent, places, baseFilteredPlaces, heatOf, intentKeyword]);

  /** 공원도 같은 조건으로 거릅니다(범위 적용 전) */
  const intentParkMatches = useMemo(() => {
    let list = parks;
    if (searchIntent.badge === "hot") list = list.filter((park) => heatOf(park.id, true).hot);
    if (intentKeyword) { const q = intentKeyword.toLowerCase(); list = list.filter((park) => park.name?.toLowerCase().includes(q) || park.address?.toLowerCase().includes(q)); }
    return list;
  }, [parks, searchIntent, heatOf, intentKeyword]);

  // ── "우리동네": 내 위치와 읍·면·동이 같은 곳만 ──
  // 후보(조건에 맞는 장소·공원 중 내 위치에서 가까운 것들)의 좌표를 서버에 보내 읍·면·동을 받아 옵니다
  // (/api/kakao/local?type=dongs — 맨 앞에 내 위치를 넣어 내 동네 이름도 함께 받음). 못 받으면 반경 방식으로 돌아갑니다.
  const neighborhoodMode = searchIntent.structured && searchIntent.nearMe && searchIntent.saidNeighborhood && !!zoneCenter;
  const dongCandidates = useMemo(() => {
    if (!neighborhoodMode || !zoneCenter || !intentMatches) return null;
    const near = (list: any[], isPark: boolean) => list
      .map((item) => ({ key: (isPark ? "park-" : "") + item.id, lat: parseFloat(item.lat), lng: parseFloat(item.lng) }))
      .filter((c) => !isNaN(c.lat) && !isNaN(c.lng))
      .map((c) => ({ ...c, dist: getDistance(zoneCenter.lat, zoneCenter.lng, c.lat, c.lng) }))
      .filter((c) => c.dist <= NEAR_ZONE_WIDE_KM);
    const parksWanted = searchIntent.parks || (searchIntent.categories.length === 0 && searchIntent.badge !== "new" && !searchIntent.zone && !searchIntent.largeDog);
    const list = [...near(intentMatches, false), ...(parksWanted ? near(intentParkMatches, true) : [])].sort((a, b) => a.dist - b.dist).slice(0, DONG_MAX_CANDIDATES);
    return { list, key: `${zoneCenter.lat.toFixed(4)},${zoneCenter.lng.toFixed(4)}|${list.map((c) => c.key).join(",")}` };
  }, [neighborhoodMode, zoneCenter, intentMatches, intentParkMatches, searchIntent]);
  const [dongResult, setDongResult] = useState<{ key: string; name: string; keys: Set<string> } | null>(null);
  useEffect(() => {
    if (!dongCandidates || !zoneCenter) return;
    if (dongResult?.key === dongCandidates.key) return;
    let cancelled = false;
    const { list, key } = dongCandidates;
    const pts = [zoneCenter, ...list].map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).join(";");
    fetch(`/api/kakao/local?type=dongs&pts=${pts}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return;
        const names: string[] = body?.result ?? [];
        const mine = names[0] || "";
        const keys = new Set<string>();
        if (mine) list.forEach((c, i) => { if (names[i + 1] === mine) keys.add(c.key); });
        setDongResult({ key, name: mine, keys });
      })
      .catch(() => { if (!cancelled) setDongResult({ key, name: "", keys: new Set() }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dongCandidates?.key]);
  const dongNow = dongCandidates && dongResult?.key === dongCandidates.key ? dongResult : null;
  /** 우리 동네(읍·면·동)를 확인하는 중 */
  const zonePending = neighborhoodMode && !!dongCandidates && !dongNow;

  // 범위 적용. 순서: (우리동네) 같은 읍·면·동 → (그 밖) 반경 2km → 5km → 이름으로 찾는 중이면 가장 가까운 곳.
  const { intentPlaces, zoneParks, zoneKm, zoneName, farKm } = useMemo(() => {
    type Out = { intentPlaces: any[] | null; zoneParks: ParkPlace[] | null; zoneKm: number | null; zoneName: string | null; farKm: number | null };
    if (!intentMatches || !zoneCenter) return { intentPlaces: intentMatches, zoneParks: null, zoneKm: null, zoneName: null, farKm: null } as Out;
    const distOf = (item: { lat: any; lng: any }) => getDistance(zoneCenter.lat, zoneCenter.lng, parseFloat(item.lat), parseFloat(item.lng));
    const within = <T extends { lat: any; lng: any }>(list: T[], km: number) => list.filter((item) => { const d = distOf(item); return !isNaN(d) && d <= km; });
    const parkList = intentParkMatches as ParkPlace[];
    let out: Out;
    if (zonePending) return { intentPlaces: [], zoneParks: [], zoneKm: null, zoneName: null, farKm: null } as Out;
    if (neighborhoodMode && dongNow?.name) {
      const dongLabel = dongNow.name.split(" ").pop() || dongNow.name;
      out = { intentPlaces: intentMatches.filter((p) => dongNow.keys.has(String(p.id))), zoneParks: parkList.filter((p) => dongNow.keys.has("park-" + p.id)), zoneKm: null, zoneName: dongLabel, farKm: null };
    } else {
      // 2km 안을 먼저 보고, 하나도 없으면 5km까지 넓힙니다(그 이상은 넓히지 않음). 넓혔을 때는 목록 위에 안내가 붙습니다.
      const steps = [NEAR_ZONE_KM, NEAR_ZONE_WIDE_KM];
      // 장소를 찾는 검색이면 장소가, 공원만 찾는 검색이면 공원이 있어야 "있다"고 봅니다.
      const parksOnly = searchIntent.parks && searchIntent.categories.length === 0;
      let km = steps[0];
      let inPlaces = within(intentMatches, km), inParks = within(parkList, km);
      for (const step of steps.slice(1)) {
        if (parksOnly ? inParks.length > 0 : inPlaces.length > 0) break;
        const nextPlaces = within(intentMatches, step), nextParks = within(parkList, step);
        // 넓혀도 없으면 "5km 안에 없음"으로 보여 줍니다.
        km = step; inPlaces = nextPlaces; inParks = nextParks;
      }
      // 기준이 된 가게도 지도·목록 맨 앞에 함께 보여 줍니다(어디 근처인지 알 수 있게).
      if (anchorId) {
        const anchorPlace = places.find((p) => String(p.id) === anchorId);
        if (anchorPlace) inPlaces = [anchorPlace, ...inPlaces.filter((p) => String(p.id) !== anchorId)];
      }
      out = { intentPlaces: inPlaces, zoneParks: inParks, zoneKm: km, zoneName: null, farKm: null };
    }
    // 가게 이름으로 찾는데("우리동네 스타벅스") 범위 안에 없으면, 가장 가까운 곳들을 대신 보여 줍니다(목록 위에 안내).
    const nothing = (out.intentPlaces?.length ?? 0) === 0 && (out.zoneParks?.length ?? 0) === 0;
    if (nothing && intentKeyword && intentMatches.length > 0) {
      const nearest = intentMatches.map((place) => ({ place, d: distOf(place) })).filter((e) => !isNaN(e.d)).sort((a, b) => a.d - b.d).slice(0, FAR_MATCH_COUNT);
      if (nearest.length > 0) out = { ...out, intentPlaces: nearest.map((e) => e.place), zoneParks: [], farKm: nearest[0].d };
    }
    return out;
  }, [intentMatches, intentParkMatches, zoneCenter, searchIntent, neighborhoodMode, dongNow, zonePending, intentKeyword, anchorId, places]);

  // ⚠ "스타벅스커피", "카페베네"처럼 가게 이름에 종류 낱말이 붙어 있어 풀이가 엉뚱하게 된 경우: 풀이한 결과는 없는데
  // 이름 그대로 찾으면 있는 곳이 있으면 예전 방식(이름 검색)으로 돌아갑니다. "우리동네"·"핫플"·"새장소"를 쓴
  // 검색은 결과가 없어도 그대로 "없음"을 보여 줍니다(다른 뜻으로 바꾸지 않음).
  const intentActive = useMemo(() => {
    if (!intentPlaces) return false;
    if (intentPlaces.length > 0 || searchIntent.nearMe || searchIntent.around || searchIntent.badge || searchIntent.parks) return true;
    const q = debouncedSearch.trim().toLowerCase();
    return !baseFilteredPlaces.some((p) => nameMatchesQuery(p.name, q));
  }, [intentPlaces, searchIntent, debouncedSearch, baseFilteredPlaces]);

  // 가게 이름으로 찾는 중("올리브영")이면 지도에도 그 이름의 장소만 보여 줍니다(목록과 같게).
  // 이름이 맞는 곳이 하나도 없으면 지역 이름 검색("대구 중구")일 수 있으니 평소처럼 전부 보여 줍니다.
  const nameQuery = intentActive ? "" : debouncedSearch.trim().toLowerCase();
  const nameMatches = useMemo(() => (nameQuery ? baseFilteredPlaces.filter((p) => nameMatchesQuery(p.name, nameQuery)) : null), [nameQuery, baseFilteredPlaces]);
  const nameFiltering = !!nameMatches && nameMatches.length > 0;
  const filteredPlaces = intentActive && intentPlaces ? intentPlaces : nameFiltering ? nameMatches! : baseFilteredPlaces;
  const nameParks = useMemo(() => (nameFiltering ? parks.filter((park) => nameMatchesQuery(park.name, nameQuery)) : null), [nameFiltering, parks, nameQuery]);

  // 공원: 평소에는 공원 버튼(showParks)대로. 검색 풀이 중에는 — "공원"을 찾으면 버튼이 꺼져 있어도 보여 주고,
  // 다른 종류·새장소·실내외·대형견을 찾으면 숨기고, "핫플"이면 많이 본 공원만, 이름을 함께 썼으면 그 이름의 공원만.
  const parksVisible = !intentActive ? showParks
    : searchIntent.parks ? true
    : showParks && searchIntent.categories.length === 0 && searchIntent.badge !== "new" && !searchIntent.zone && !searchIntent.largeDog;
  const mapParks = !intentActive ? nameParks ?? parks : zoneParks ?? intentParkMatches;
  /** 지금 "근처" 범위로 좁혀 보여 주는 중인지(중심·반경) */
  const zone = useMemo(() => (intentActive && zoneCenter ? { center: zoneCenter, km: zoneKm } : null), [intentActive, zoneCenter, zoneKm]);
  /** 목록 위에 보여 줄 검색 풀이 한 줄. 예: "우리동네 · HOT" */
  const intentLabel = intentActive ? describeIntent(searchIntent, zoneName ?? intentWhere, intentKeyword) + (zone?.km && farKm == null ? ` · ${zone.km}km 안` : "") : "";

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

    // "근처" 검색 중: 지도를 어디로 옮기든 범위 안의 장소 전체를 중심에서 가까운 순으로 고정해 보여 줍니다.
    if (zone) return sortByDistance(filteredPlaces, zone.center).slice(0, MAX_LIST_ITEMS);

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
  }, [filteredPlaces, userLocation, searchCenter, mapBounds, zone]);

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
      if (rank) return { label: `TOP ${rank}`, color: "#B4690E" };

      const createdAtMs = place.created_at ? new Date(place.created_at).getTime() : NaN;
      if (!Number.isNaN(createdAtMs)) {
        const days = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days <= RECOMMEND_WEIGHTS.NEW_PLACE_WINDOW_DAYS) {
          return { label: "NEW", color: "#1E78D2" };
        }
      }
    }

    const viewCount = recentViewCounts.get(isPark ? `park-${place.id}` : String(place.id)) ?? 0;
    if (viewCount >= CARD_BADGE.HOT_VIEW_MIN) return { label: "HOT", color: "#E5392B" };

    return null;
  };

  // ── 리스트 패널에 같이 섞어 보여줄 공원 — 공원 토글(showParks)이 켜져 있을 때만,
  // places와 같은 기준(화면 영역 우선, 없으면 반경 10km)으로 좁힙니다. 공원 데이터는
  // places보다 훨씬 적어서(전국 기준 수천 건 이하) places처럼 300개 상한을 따로 두지
  // 않고 그대로 displayedPlaces에서 합쳐 정렬한 뒤 상한을 적용합니다.
  const nearbyParks = useMemo(() => {
    const parks = mapParks; // 검색 풀이 중에는 걸러진 공원만
    if (!parksVisible) return [];
    if (zone) return mapParks; // "근처" 검색 중에는 범위 안의 공원 전체(화면과 무관)
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
  }, [mapParks, parksVisible, mapBounds, userLocation, searchCenter, zone]);

  // ── 가게명 검색 결과: 검색어가 가게명에 일부라도 포함되면 매칭하고, 실제 위치
  // 기준으로 가까운 순으로 정렬합니다. 반경 5km 제한 없이(찾는 가게가 멀리 있어도
  // 나오도록) 전체 매칭 결과를 보여줍니다.
  const nameSearchResults = useMemo(() => {
    // 검색어를 "어디에서 · 무엇을"로 풀이한 경우에는 filteredPlaces가 이미 걸러져 있으므로 이름 통째 검색은 하지 않습니다.
    const q = intentActive ? "" : debouncedSearch.trim().toLowerCase();
    if (!q) return [];
    // filteredPlaces에는 화면 주변의 칸과, 서버가 이름으로 찾아 준 장소(remoteMatches — 화면 밖 포함)가 들어 있습니다.
    return [...filteredPlaces]
      .filter((p) => nameMatchesQuery(p.name, q))
      .sort((a, b) => {
        if (!userLocation) return 0;
        const distA = getDistance(userLocation.lat, userLocation.lng, parseFloat(a.lat), parseFloat(a.lng));
        const distB = getDistance(userLocation.lat, userLocation.lng, parseFloat(b.lat), parseFloat(b.lng));
        return distA - distB;
      });
  }, [filteredPlaces, debouncedSearch, userLocation, intentActive]);

  // ── 리스트 패널 상단 고정 "프리미엄 업장" 섹션: 지금 화면(=nearbyPlaces, 이미 거리순
  // 정렬됨)에 활성 프리미엄 업장이 있으면 가까운 순으로 최대 3곳만 보여줍니다. 전국 아무
  // 프리미엄 업장이나 노출하면 무관한 지역 광고가 떠서 리스트 신뢰도만 떨어뜨리므로,
  // 지금 보고 있는 지역 근처에 없으면 섹션 자체를 렌더링하지 않습니다.
  // ⚠ 예전에는 "지금 화면 안의 목록"에 프리미엄 업장이 걸렸을 때만 보였습니다. 그래서 지도를 조금만 옮기거나 필터·검색을
  // 쓰면 사라졌습니다(광고 상품의 "목록 상단 노출"이 지켜지지 않음). 이제는 필터·검색과 상관없이, 보고 있는 곳(지도 중심)이나
  // 내 위치에서 PREMIUM_AREA_KM 안에 있는 프리미엄 업장을 가까운 순으로 항상 보여 줍니다.
  const pinnedPremiumPlaces = useMemo(() => {
    const viewCenter = mapBounds ? { lat: (mapBounds.swLat + mapBounds.neLat) / 2, lng: (mapBounds.swLng + mapBounds.neLng) / 2 } : null;
    const centers = [viewCenter, userLocation].filter(Boolean) as { lat: number; lng: number }[];
    if (centers.length === 0) return [];
    return places
      .filter((p) => isPlacePremiumNow(p))
      .map((p) => {
        const lat = parseFloat(p.lat), lng = parseFloat(p.lng);
        return { p, d: isNaN(lat) || isNaN(lng) ? Infinity : Math.min(...centers.map((c) => getDistance(c.lat, c.lng, lat, lng))) };
      })
      .filter((e) => e.d <= PREMIUM_AREA_KM)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((e) => e.p);
  }, [places, mapBounds, userLocation]);

  // ── 신규 장소 패널(showRecentPanel)에 쓸 "최근 등록순 상위 10개"입니다.
  // ⚠ 최적화: 예전엔 이 정렬([...places].sort(...).slice(0,10))이 JSX 안에 그대로
  // 있어서, 패널이 열려 있는 동안 컴포넌트가 리렌더링될 때마다(지도 팬/줌으로 인한
  // mapBounds 갱신 등 이 패널과 무관한 상태 변화에도) places 전체(공공데이터 병합 후
  // 수천 건)를 매번 복사+정렬했습니다. places가 실제로 바뀔 때만 다시 계산하도록
  // useMemo로 옮겼습니다.
  const recentPlaces = useMemo(() => {
    // ⚠ 속도: 등록일이 있는 장소(제보로 등록된 곳)만 정렬합니다. 공공데이터 장소 1만여 곳은 등록일이 없어 어차피
    // 맨 뒤로 가는데, 예전에는 그것까지 전부 날짜로 바꿔 가며 정렬했습니다(장소 목록이 바뀔 때마다).
    return places
      .filter((p) => p.created_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [places]);

  // ── 리스트 패널에 실제로 표시할 목록: 가게명 검색 결과가 있으면 그걸 우선(공원은
  // 가게명 검색 대상이 아니므로 제외), 없으면(검색어가 없거나 지역명 검색인 경우)
  // 기존 반경 기반 장소 목록에 공원 토글이 켜져 있을 때만 nearbyParks를 함께 섞어서
  // 거리순으로 다시 정렬해 보여줍니다. 공원 항목은 __isPark 플래그로 구분해서, 클릭
  // 시 장소 상세(setSelectedPlace) 대신 지도 위 공원 마커를 눌렀을 때와 동일한 공원
  // 정보 카드(setSelectedPark)로 연결합니다.
  // ⚠ 성능: 목록은 최대 300곳인데, 지도를 조금만 움직여도 카드 300장(사진 포함)을 전부 새로 그려서
  // 끌 때마다 화면이 멈칫했습니다. 처음에는 LIST_PAGE장만 그리고, 목록을 끝까지 내리면 그만큼씩 더 그립니다.
  // 지도를 움직여 목록이 바뀌면 다시 처음 분량으로 돌아갑니다.
  const LIST_PAGE = 30;
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  const listMoreRef = useRef<HTMLDivElement | null>(null);

  const displayedPlacesByDistance = useMemo(() => {
    if (debouncedSearch.trim() && nameSearchResults.length > 0) return nameSearchResults;
    if (nearbyParks.length === 0) return nearbyPlaces;

    const center =
      zone?.center ||
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
  }, [debouncedSearch, nameSearchResults, nearbyPlaces, nearbyParks, searchCenter, userLocation, mapBounds, zone]);

  // ── 목록 위 한 줄 안내: 가까이에 없어 범위를 넓혔거나 먼 곳을 보여 줄 때 ──
  const displayedCount = displayedPlacesByDistance.length;
  const searchNotice = useMemo(() => {
    const fmt = (km: number) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)}m` : `${km < 10 ? km.toFixed(1) : Math.round(km)}km`);
    // 받침이 있으면 "이", 없으면 "가"
    const iGa = (word: string) => { const code = word.charCodeAt(word.length - 1); return code >= 0xac00 && code <= 0xd7a3 ? ((code - 0xac00) % 28 ? "이" : "가") : "이(가)"; };
    if (intentActive && farKm != null && intentKeyword) {
      return `${zoneName ? `${zoneName}에는` : `${NEAR_ZONE_WIDE_KM}km 안에는`} "${intentKeyword}"${iGa(intentKeyword)} 없어요. 가장 가까운 곳(${fmt(farKm)})을 보여 드려요.`;
    }
    // 2km 안에 없어 5km까지 넓혀 찾았을 때
    if (zone?.km === NEAR_ZONE_WIDE_KM && farKm == null && displayedCount > 0) {
      return `근방 ${NEAR_ZONE_KM}km 안에는 해당하는 장소가 없어, ${NEAR_ZONE_WIDE_KM}km 안에서 찾은 곳을 보여 드려요.`;
    }
    const q = debouncedSearch.trim();
    if (!intentActive && q && nameSearchResults.length > 0 && userLocation) {
      const first = nameSearchResults[0];
      const d = getDistance(userLocation.lat, userLocation.lng, parseFloat(first.lat), parseFloat(first.lng));
      if (!isNaN(d) && d > FAR_NOTICE_KM) return `${FAR_NOTICE_KM}km 안에는 "${q}"${iGa(q)} 없어요. 가장 가까운 곳(${fmt(d)})을 보여 드려요.`;
    }
    return "";
  }, [intentActive, farKm, intentKeyword, zoneName, debouncedSearch, nameSearchResults, userLocation, zone, displayedCount]);

  // 범위 안에 없어 가장 가까운 곳을 보여 줄 때는 지도도 그곳으로 옮깁니다.
  const farTargetId = intentActive && farKm != null && intentPlaces?.[0] ? String(intentPlaces[0].id) : "";
  useEffect(() => {
    if (!farTargetId || !mapRef.current || !mapReady) return;
    const target = intentPlaces?.[0];
    const lat = parseFloat(target?.lat), lng = parseFloat(target?.lng);
    if (!isNaN(lat) && !isNaN(lng)) jumpMapTo(mapRef.current, new window.kakao.maps.LatLng(lat, lng), 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farTargetId, mapReady]);

  // "핫플" 검색은 가까운 순이 아니라 많이 찾는 순(최근 조회수 → 찜·좋아요)으로 보여 줍니다.
  const displayedPlaces = useMemo(() => {
    if (!intentActive || searchIntent.badge !== "hot") return displayedPlacesByDistance;
    return displayedPlacesByDistance
      .map((item: any) => ({ item, heat: heatOf(item.id, !!item.__isPark) }))
      .sort((a, b) => b.heat.views - a.heat.views || b.heat.liked - a.heat.liked)
      .map((entry) => entry.item);
  }, [displayedPlacesByDistance, intentActive, searchIntent, heatOf]);

  // 목록 내용이 바뀌면 처음 분량부터 다시 그립니다.
  useEffect(() => { setListLimit(LIST_PAGE); }, [displayedPlaces]);

  // ══ 지도 데이터 받기(칸 단위) ══
  // 무엇을 받을지(dataNeed)를 지금 화면 상태에서 정하고, 아래 효과가 그만큼만 받아 places/parks에 반영합니다.
  //  - 평소: 지도에 보이는 범위(+여유) + 내 위치 주변의 칸.
  //  - 화면 안에 장소가 하나도 없으면: 반경 10km의 칸(목록이 "10km 안" 장소를 대신 보여 주므로).
  //  - 넓은 범위가 필요한 때(AI 코스·추천 패널을 열었을 때, 지도를 아주 넓게 축소했을 때): 예전 방식(반경 30km 한 번).
  //    이때만 장소가 많아지고, 패널을 닫거나 다시 확대하면 칸 데이터만 남아 가벼워집니다.
  const inViewEmpty = useMemo(() => {
    if (!mapBounds) return false;
    // 화면 범위의 칸을 아직 받는 중이면 "비었다"고 보지 않습니다(처음 열 때마다 반경 10km를 받게 됩니다).
    if (!placeTiles.has(tilesForBounds(mapBounds))) return false;
    return !filteredPlaces.some((place) => {
      const lat = parseFloat(place.lat), lng = parseFloat(place.lng);
      return lat >= mapBounds.swLat && lat <= mapBounds.neLat && lng >= mapBounds.swLng && lng <= mapBounds.neLng;
    });
  }, [filteredPlaces, mapBounds]);

  // 가까이 보는데도 화면 안에 장소가 너무 많은지(DENSE_VIEW_LIMIT) — 이때는 이름표 대신 숫자 동그라미를 씁니다.
  const denseView = useMemo(() => {
    if (!mapBounds || mapLevel == null || mapLevel >= SUMMARY_MIN_LEVEL) return false;
    let count = 0;
    for (const place of filteredPlaces) {
      const lat = parseFloat(place.lat), lng = parseFloat(place.lng);
      if (lat >= mapBounds.swLat && lat <= mapBounds.neLat && lng >= mapBounds.swLng && lng <= mapBounds.neLng && ++count > DENSE_VIEW_LIMIT) return true;
    }
    return false;
  }, [filteredPlaces, mapBounds, mapLevel]);

  // 넓게 보는 중인지 — 이때는 장소를 받지 않고 구역별 수만 동그라미로 보여 줍니다(아래 "구역별 장소 수 동그라미" 효과).
  // 풀이한 검색("대구 카페" 등)은 조건에 맞는 장소를 실제로 골라야 해서 예전 방식(장소를 받아 묶음 마커)으로 둡니다.
  const summaryView = mapLevel != null && mapLevel >= SUMMARY_MIN_LEVEL && !intentActive;

  const dataNeed = useMemo(() => {
    const tiles = new Map<string, TileXY>();
    const add = (list: TileXY[]) => { for (const tile of list) tiles.set(tileKey(tile), tile); };
    const viewCenter = mapBounds ? { lat: (mapBounds.swLat + mapBounds.neLat) / 2, lng: (mapBounds.swLng + mapBounds.neLng) / 2 } : null;
    let wide: { lat: number; lng: number } | null = null;

    if (zoneCenter) add(tilesForRadius(zoneCenter, NEAR_ZONE_WIDE_KM));
    if (mapBounds && !summaryView && !zoneCenter) {
      const view = expandBounds(mapBounds, DATA_VIEW_MARGIN_KM);
      if (countTilesForBounds(view) <= DATA_MAX_VIEW_TILES) add(tilesForBounds(view));
      else wide = viewCenter;
    }
    if (userLocation) add(tilesForRadius(userLocation, DATA_HOME_KM));
    // 코스는 내 위치 우선, 추천은 검색한 곳 우선(각 계산의 기준점과 같게)
    if (showRoutePanel && (userLocation || searchCenter)) wide = userLocation || searchCenter;
    else if (showRecommendPanel && (searchCenter || userLocation)) wide = searchCenter || userLocation;

    const focus = searchCenter || userLocation || viewCenter;
    if (!wide && !summaryView && !zoneCenter && inViewEmpty && focus) add(tilesForRadius(focus, DATA_FALLBACK_KM));

    const list = [...tiles.values()];
    const wideKey = wide ? tileQuery(wide.lat, wide.lng) : "";
    return { tiles: list, wide, wideKey, focus, key: `${[...tiles.keys()].sort().join(",")}|${wideKey}` };
  }, [mapBounds, userLocation, searchCenter, showRoutePanel, showRecommendPanel, inViewEmpty, summaryView, zoneCenter]);

  // 넓은 범위(반경 30km) 데이터 — 필요할 때만 들고 있습니다.
  const wideDataRef = useRef<{ center: { lat: number; lng: number }; places: any[]; parks: ParkPlace[] } | null>(null);
  const [wideReadyKey, setWideReadyKey] = useState("");
  /** 넓은 범위 데이터를 받는 중인지 — 그동안 코스·추천은 "모으는 중"으로 보여 줍니다(일부 데이터로 만든 결과가 잠깐 나왔다 바뀌지 않게). */
  const wideLoading = !!dataNeed.wide && wideReadyKey !== dataNeed.wideKey;
  // 이름 검색으로 서버에서 찾아온 장소(화면 밖의 가게) — 눌러서 열 수 있도록 장소 목록에 함께 넣어 둡니다.
  const [remoteMatches, setRemoteMatches] = useState<{ query: string; list: any[] }>({ query: "", list: [] });
  const appliedDataRef = useRef<{ tilePlaces: any[] | null; tileParks: ParkPlace[] | null; wide: unknown; remote: unknown }>({ tilePlaces: null, tileParks: null, wide: null, remote: null });
  const dataNeedRef = useRef(dataNeed);
  useEffect(() => { dataNeedRef.current = dataNeed; }, [dataNeed]);

  /** 받아 둔 것(칸 + 넓은 범위 + 이름 검색 결과)을 places/parks에 반영합니다. 바뀐 게 없으면 아무것도 하지 않습니다. */
  const applyMapData = useCallback(() => {
    const tilePlaces = placeTiles.all(), tileParks = parkTiles.all();
    const wide = wideDataRef.current, remote = remoteMatches.list;
    const last = appliedDataRef.current;
    if (last.tilePlaces === tilePlaces && last.tileParks === tileParks && last.wide === wide && last.remote === remote) return;
    appliedDataRef.current = { tilePlaces, tileParks, wide, remote };

    let publicList = tilePlaces, parkList = tileParks;
    if (wide || remote.length > 0) {
      // 여러 묶음에 같은 장소가 있을 수 있어 id로 한 번만 담습니다.
      const byId = new Map<any, any>();
      for (const p of tilePlaces) byId.set(p.id, p);
      for (const p of wide?.places ?? []) if (!byId.has(p.id)) byId.set(p.id, p);
      for (const p of remote) if (!byId.has(p.id)) byId.set(p.id, p);
      publicList = [...byId.values()];
    }
    if (wide) {
      const byId = new Map<any, ParkPlace>();
      for (const p of tileParks) byId.set(p.id, p);
      for (const p of wide.parks) if (!byId.has(p.id)) byId.set(p.id, p);
      parkList = [...byId.values()];
    }
    setPlaces((prev) => [...prev.filter((p) => p.source !== "public-data"), ...publicList]);
    setParks(parkList);
  }, [remoteMatches]);

  const firstDataLoadRef = useRef(true);
  useEffect(() => {
    if (dataNeed.tiles.length === 0 && !dataNeed.wide) return;
    let cancelled = false;
    // 지도를 끄는 동안 연달아 요청하지 않도록 잠깐 기다립니다(처음 한 번은 바로).
    // 넓은 범위(1만여 곳)를 새로 받아야 할 때는 더 오래 기다립니다 — 확대·축소를 이어서 하는 동안 단계마다 받지 않게.
    const heldWide = wideDataRef.current;
    const needsNewWide = !!dataNeed.wide && !(heldWide && getDistance(heldWide.center.lat, heldWide.center.lng, dataNeed.wide.lat, dataNeed.wide.lng) < DATA_WIDE_REUSE_KM);
    const panelOpen = showRoutePanel || showRecommendPanel; // 패널을 열었을 때는 기다리지 않고 바로
    const delay = firstDataLoadRef.current ? 0 : needsNewWide && !panelOpen ? 700 : 250;
    firstDataLoadRef.current = false;
    const timer = setTimeout(async () => {
      const need = dataNeed;
      const wideCenter = need.wide;
      const held = wideDataRef.current;
      // 이미 받아 둔 넓은 범위가 지금 필요한 곳을 덮고 있으면(기준점이 조금만 움직였으면) 그대로 씁니다 —
      // 지도를 넓게 축소한 채 조금씩 움직일 때마다 1만여 곳을 다시 받지 않게.
      const wideJob = !wideCenter ? Promise.resolve(null)
        : held && getDistance(held.center.lat, held.center.lng, wideCenter.lat, wideCenter.lng) < DATA_WIDE_REUSE_KM ? Promise.resolve(held)
        : Promise.all([fetchPublicDataPlaces(wideCenter), fetchParks(wideCenter)]).then(([wp, wk]) => ({ center: wideCenter, places: wp, parks: wk }));
      const [, wide] = await Promise.all([ensureMapTiles(need.tiles), wideJob]);
      await waitForMapPaint();
      if (cancelled) return;
      wideDataRef.current = wide;
      // 칸이 너무 많이 쌓였으면 지금 필요 없는 칸을 먼 것부터 버립니다.
      if (need.focus) { placeTiles.trim(need.tiles, need.focus, DATA_MAX_TILES); parkTiles.trim(need.tiles, need.focus, DATA_MAX_TILES); }
      applyMapData();
      setWideReadyKey(need.wideKey);
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataNeed.key]);

  // 이름 검색 결과가 바뀌면 장소 목록에 반영합니다.
  useEffect(() => { applyMapData(); }, [applyMapData]);

  // ── 가게 이름으로 전국에서 찾기 ──
  // 받아 둔 칸(화면 주변)에 없는 가게도 찾도록 서버에 묻습니다. 풀이한 검색("우리동네 카페" 등)은 화면 범위에서 찾으므로 묻지 않습니다.
  useEffect(() => {
    const query = !searchIntent.structured ? debouncedSearch.trim() : searchIntent.nearMe ? searchIntent.rest : "";
    if (query.length < 2) {
      setRemoteMatches((prev) => (prev.list.length === 0 ? prev : { query: "", list: [] }));
      return;
    }
    let cancelled = false;
    const near = userLocation || dataNeedRef.current.focus;
    searchPlacesByName(query, near).then((list) => { if (!cancelled) setRemoteMatches({ query, list }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, searchIntent.structured, searchIntent.nearMe, searchIntent.rest]);
  // 목록 끝 표시가 화면에 들어오면 더 그립니다.
  useEffect(() => {
    const el = listMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setListLimit((n) => n + LIST_PAGE);
    }, { rootMargin: "300px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [listLimit, displayedPlaces]);

  // ── debouncedSearch 변경 시 지도 이동 + searchCenter 갱신
  // 1순위: 가게명이 일부라도 일치하는 곳이 있으면 그중 가장 가까운 곳을 지도
  //        중심으로 이동시킵니다(실제 위치 기준 거리순 정렬 결과의 맨 앞).
  // 2순위: 이름 매칭이 없으면 기존처럼 지역명(주소) 검색을 시도합니다.
  // ⚠ 같은 검색어로는 지도를 한 번만 옮깁니다. 이 효과는 nameSearchResults(장소 목록·내 위치가 바뀔 때마다
  // 새 배열)에도 반응해서, 예전엔 검색 후 "내 위치로" 버튼을 누르면 — 검색어가 지워지기 전 0.3초 사이에
  // 위치가 바뀌며 — 옛 검색어로 한 번 더 실행돼 지도가 검색했던 곳으로 되돌아갔습니다. 보고 있는 지역의
  // 장소를 추가로 불러올 때도 같은 이유로 지도가 다시 끌려갔습니다.
  // 키에 "이름 일치 결과가 있는지"를 넣어, 데이터가 늦게 도착해 결과가 생긴 경우에는 다시 옮깁니다.
  const lastSearchMoveKeyRef = useRef<string | null>(null);
  const debouncedSearchRef = useRef(debouncedSearch);
  useEffect(() => { debouncedSearchRef.current = debouncedSearch; }, [debouncedSearch]);
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      lastSearchMoveKeyRef.current = null;
      // 이미 null이면 다시 set하지 않음 (불필요한 렌더링 방지)
      setSearchCenter((prev) => (prev === null ? prev : null));
      return;
    }
    if (!mapRef.current || !mapReady) return;
    // 검색창이 이미 비워졌으면(내 위치 버튼 등) 지연 중인 옛 검색어로는 움직이지 않습니다.
    if (!searchQuery.trim()) return;
    // ── 풀이한 검색("우리동네 핫플", "대구 삼덕동 카페" 등) ──
    if (searchIntent.structured) {
      const query = debouncedSearch.trim();
      // 내 위치를 아직 모르면, 알게 됐을 때 한 번 더 실행되도록 키에 넣습니다.
      const intentKey = `intent|${query}|${searchIntent.nearMe ? (userLocation ? "loc" : "noloc") : ""}`;
      if (lastSearchMoveKeyRef.current === intentKey) return;
      lastSearchMoveKeyRef.current = intentKey;
      if (searchIntent.nearMe) {
        // "우리동네": 내 위치로 가서 동네가 보이는 크기로 맞춥니다. 목록은 내 위치에서 가까운 순.
        setSearchCenter((prev) => (prev === null ? prev : null));
        if (userLocation) jumpMapTo(mapRef.current, new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng), 5);
        return;
      }
      if (!searchIntent.rest) return; // "핫플", "카페"만 쓴 경우: 지금 보고 있는 곳에서 찾습니다.
      (async () => {
        // 남은 말이 지역인지 확인합니다. "대구 스타벅스"처럼 지역+이름이면 앞에서부터 지역으로 읽히는 데까지만 지역으로 봅니다.
        const tokens = searchIntent.rest.split(" ");
        let found: { lat: number; lng: number; level: number } | null = null;
        let where: string | null = null, keyword: string | null = searchIntent.rest;
        // "경북대", "서울역"처럼 학교·역으로 보이는 이름은 지역 이름으로 물어보지 않습니다(헛된 조회 여러 번을 아낌).
        const skipRegion = looksLikeLandmark(searchIntent.rest) && !looksLikeRegion(searchIntent.rest);
        let anchor: string | null = null;
        // 곳 이름(가게·학교·역 등)을 좌표로: 학교·역처럼 생긴 이름은 바로 찾고, 그 밖의 이름("올리브영 경북대점 근처")은
        // 우리 지도에 있는 가게 중 내 위치에서 가장 가까운 곳을 먼저 찾습니다.
        const findSpot = async () => {
          let spot: { lat: number; lng: number } | null = null;
          if (!looksLikeLandmark(searchIntent.rest)) {
            const base = userLocation || dataNeedRef.current.focus;
            const own = (await searchPlacesByName(searchIntent.rest, base))
              .map((place) => ({ id: String(place.id), lat: parseFloat(place.lat), lng: parseFloat(place.lng) }))
              .filter((c) => !isNaN(c.lat) && !isNaN(c.lng))
              .map((c) => ({ ...c, d: base ? getDistance(base.lat, base.lng, c.lat, c.lng) : 0 }))
              .sort((a, b) => a.d - b.d)[0];
            if (own) { spot = { lat: own.lat, lng: own.lng }; anchor = own.id; }
          }
          if (!spot) spot = await findLandmark(searchIntent.rest);
          if (spot) { found = { ...spot, level: anchor ? 4 : 5 }; where = searchIntent.rest; keyword = null; }
        };
        // "○○ 근처"인데 지역 이름처럼 안 보이면 가게·곳 이름부터 찾습니다(지역 조회를 여러 번 헛돌지 않게).
        if (searchIntent.around && !looksLikeRegion(searchIntent.rest)) await findSpot();
        for (let n = skipRegion || found ? 0 : tokens.length; n >= 1 && !found; n--) {
          const head = tokens.slice(0, n).join(" ");
          // 여러 낱말인데 지역 이름처럼 안 보이면("대구 올리브영") 물어보지 않고 넘어갑니다 — 헛된 조회로 결과가 늦어지지 않게.
          if (n > 1 && !looksLikeRegion(head)) continue;
          found = await findRegion(head);
          if (found) { where = head; keyword = tokens.slice(n).join(" ") || null; }
        }
        // 지역 이름이 아니면 곳 이름(학교·역·시장 등)인지 봅니다 — "경북대 근처 카페", "서울역 앞 식당", "경북대 카페".
        if (!found && (searchIntent.around || looksLikeLandmark(searchIntent.rest))) await findSpot();
        if (debouncedSearchRef.current.trim() !== query) return; // 그 사이 검색어가 바뀌었으면 버립니다.
        if (found && mapRef.current) {
          jumpMapTo(mapRef.current, new window.kakao.maps.LatLng(found.lat, found.lng), found.level);
          setSearchCenter({ lat: found.lat, lng: found.lng });
        }
        setIntentRest({ query, where, keyword, anchorId: anchor });
      })();
      return;
    }

    const moveKey = `${debouncedSearch.trim()}|${nameSearchResults.length > 0 ? "name" : "region"}`;
    if (lastSearchMoveKeyRef.current === moveKey) return;
    lastSearchMoveKeyRef.current = moveKey;

    if (nameSearchResults.length > 0) {
      const nearest = nameSearchResults[0];
      const lat = parseFloat(nearest.lat);
      const lng = parseFloat(nearest.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        jumpMapTo(mapRef.current, new window.kakao.maps.LatLng(lat, lng), 5);
        setSearchCenter({ lat, lng });
      }
      return;
    }

    (async () => {
      const center = await searchRegionAndMoveMap(debouncedSearch.trim(), mapRef.current);
      if (center) setSearchCenter(center);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, mapReady, nameSearchResults, searchIntent, userLocation]);

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
    // 내 반응(찜·좋아요 등)이 있을 때만 씁니다 — 없으면 1만여 곳을 담는 일을 하지 않습니다.
    if (myReactions.length === 0) return map;
    for (const p of places) map.set(String(p.id), p);
    return map;
  }, [places, myReactions.length]);

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
    // ⚠ 속도: 추천 목록은 추천 패널에서만 씁니다. 예전에는 패널을 열지 않아도 지도가 뜰 때, 그리고 장소·위치가 바뀔
    // 때마다 주변 1만여 곳의 점수(공원까지의 거리 포함)를 계산해서 화면이 떠 있는 채로 한동안 멈칫했습니다.
    // 패널을 열 때만 계산합니다.
    if (!showRecommendPanel || wideLoading) return { list: [], ad: null };
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

    // ⚠ 성능: 예전에는 장소 하나마다 주변 공원을 전부 훑었습니다(장소 약 1,700곳 × 공원 수천 곳 = 수백만 번의
    // 거리 계산) — 지도 로딩이 몇 초씩 멈추던 가장 큰 원인이었습니다. 공원을 격자 칸에 나눠 담아 가까운 칸만 봅니다.
    // 결과는 전부 훑는 방식과 같습니다(src/lib/nearestGrid.ts, 테스트로 확인).
    const parkGrid = buildNearestGrid(nearbyParks);
    // 공원 가점은 PARK_PROXIMITY_MAX_KM 안에서만 붙으므로 그 거리까지만 찾습니다(더 멀면 "없음"과 같은 0점).
    const nearestParkDistanceKm = (lat: number, lng: number): number | null => parkGrid.nearestKm(lat, lng, RECOMMEND_WEIGHTS.PARK_PROXIMITY_MAX_KM);

    const distanceOf = (place: any) => {
      const lat = parseFloat(place.lat);
      const lng = parseFloat(place.lng);
      return center && !isNaN(lat) && !isNaN(lng) ? getDistance(center.lat, center.lng, lat, lng) : null;
    };
    const matchesFilterOf = (place: any) =>
      selectedPetZone !== "all" &&
      (place.pet_zone === selectedPetZone || (!!filterCategory && place.category === filterCategory) || (selectedPetZone === "lodging" && isLodgingCategory(place.category)));

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
    activeRecVariant, placeSignals, preferenceProfile, impressionCounts, affinityOf, showRecommendPanel, wideLoading,
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

  // ── AI 맞춤 추천 경로: 현재 위치(또는 검색 중심) 주변 후보를 테마에 맞는 역할
  // 순서(산책/카페/관광/동물병원/동물약국)로 엮어 하나의 코스로 만듭니다. 반경 15km
  // 이내에서 후보를 찾고(아직 지역별로 등록된 장소 수가 적어 너무 좁으면 코스 자체가
  // 안 만들어질 때가 많습니다), 그래도 부족하면 30km까지 한 번 더 넓혀서 재시도합니다.
  // 같은 동네 판단(테마별 도보 반경)과 관광 중심 필수 정거장은 buildRoute(routeRecommend.ts)가 합니다.
  const routeBuild = useMemo<{ route: RouteResult | null; exhausted: boolean }>(() => {
    // 주변(반경 30km) 장소를 다 받은 뒤에 만듭니다 — 일부만 받은 채 만들면 코스가 잠깐 나왔다가 바뀝니다.
    if (!showRoutePanel || wideLoading) return { route: null, exhausted: false };
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

    // ⚠ 산책·실내 코스는 예전에 여기서 "출발지와 같은 읍/면/동 주소"로만 후보를 좁혔는데,
    // 도로명주소엔 동 이름이 없어 주변 장소 대부분이 빠졌습니다. 이제 buildRoute가 테마별
    // 도보 반경(routeRecommend.ts THEME_TUNING)으로 같은 동네를 판단합니다.

    // 인기도(찜/좋아요)를 후보에 얹어서 buildRoute가 정거장 선정·친화도 점수 계산에
    // 반영할 수 있게 합니다.
    // 친화도(affinityOf)도 같이 얹어서 정거장 친화도가 상세페이지 점수와 같게 나오게 합니다.
    // 리뷰 수·만족도·최근 반응·최근 조회수는 관광 중심의 "후기 핫플"·"유명 관광지" 판정에 씁니다.
    // 내가 싫어요한 장소는 코스 후보에서 뺍니다.
    const nearbyWithPopularity = nearby
      .filter((place) => !preferenceProfile.disliked.has(String(place.id)))
      .map((place) => {
        const key = String(place.id);
        const popularity = popularityMap.get(key);
        const signals = placeSignals.get(key);
        return {
          ...place,
          bookmarkCount: popularity?.bookmarks ?? 0,
          likeCount: popularity?.likes ?? 0,
          affinityScore: placeSignals.size > 0 ? affinityOf(place) : null,
          reviewCount: signals?.rc ?? 0,
          reviewScore: signals?.rs ?? null,
          recentReactions: signals ? signals.bd + signals.ld : 0,
          recentViews: recentViewCounts.get(key) ?? 0,
        };
      });

    // 프리미엄(광고) 업장: 출발지에서 PREMIUM_COURSE_KM 안에 있으면 가장 가까운 한 곳을 코스에 넣습니다(광고 상품의 "AI 코스 노출").
    const sponsoredIds = nearbyWithPopularity
      .filter((place) => isPlacePremiumNow(place))
      .map((place) => ({ id: place.id, d: getDistance(center.lat, center.lng, Number(place.lat), Number(place.lng)) }))
      .filter((e) => e.d <= PREMIUM_COURSE_KM)
      .sort((a, b) => a.d - b.d)
      .slice(0, 1)
      .map((e) => e.id);
    const medicalOptions = { includeVet: routeIncludeVet, includePharmacy: routeIncludePharmacy, pinnedIds: appliedPinnedIds, sponsoredIds };
    const buildOptions = { excludeIds: routeExcludedIds, ...medicalOptions };
    // "다른 코스 보기"로 제외 목록이 쌓였는데 그걸로는 더 이상 코스를 못 만들면(대안
    // 소진), 처음 추천으로 자연스럽게 되돌아갑니다 — 빈 화면보다 낫다는 판단입니다.
    // exhausted=true면 패널에 "다른 조합이 없어요"를 안내해서, 버튼을 눌렀는데 같은 코스가
    // 그대로 나와 고장난 것처럼 보이지 않게 합니다.
    const alternative = buildRoute(nearbyWithPopularity, center, routeTheme, 4, buildOptions);
    if (alternative || routeExcludedIds.size === 0) return { route: alternative, exhausted: false };
    return {
      route: buildRoute(nearbyWithPopularity, center, routeTheme, 4, medicalOptions),
      exhausted: true,
    };
  }, [
    showRoutePanel, wideLoading, places, parks, userLocation, searchCenter, routeTheme, popularityMap, routeExcludedIds,
    preferenceProfile, placeSignals, affinityOf, routeIncludeVet, routeIncludePharmacy, recentViewCounts, appliedPinnedIds,
  ]);
  const currentRoute = routeBuild.route;
  const routeAlternativesExhausted = routeBuild.exhausted;
  // ── 코스 집중 모드: AI 코스가 떠 있는 동안에는 코스에 속한 장소의 원래 가게 마커(이모지 +
  // 가게명, 누르면 정보·후기 미리보기)만 남기고 나머지 장소·공원 마커는 숨깁니다. 코스가 길면
  // (관광 중심 등) 넓게 축소되면서 주변 마커가 코스를 덮어 난잡해지던 문제를 막습니다.
  // "주변 장소 보기" 토글을 켜면 원래처럼 모두 보여줍니다.
  const hideMarkersForCourse = showRoutePanel && !!currentRoute && !showNearbyInCourse;
  // 코스 정거장 id(공원은 "park-<id>") — 마커 effect들이 의존성으로 비교하기 쉽게 문자열로 둡니다.
  const courseStopKey = currentRoute ? currentRoute.stops.map((s) => String(s.place.id)).join("|") : "";

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
  }, [routeTheme, showRoutePanel, routeIncludeVet, routeIncludePharmacy]);

  // 핀 고정은 테마를 바꾸거나 패널을 닫으면 풀립니다(다른 테마에선 역할이 맞지 않을 수 있어서).
  useEffect(() => {
    setPinnedStopIds(new Set());
    setAppliedPinnedIds(new Set());
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

      // ⚠ 속도("지도 먼저"): 사이트를 처음 열 때는 layout.tsx의 짧은 스크립트가 이 화면 코드보다 먼저 지도를
      // 그려 둡니다(window.__ggkEarlyMap). 그 지도가 있으면 새로 만들지 않고 그대로 넘겨받습니다 — 지도 그림을
      // 다시 받지 않고, 그 사이 사용자가 지도를 움직였다면 그 위치도 그대로입니다.
      const early = (window as unknown as { __ggkEarlyMap?: { map: any; el: HTMLElement } | null }).__ggkEarlyMap;
      if (early?.map && early.el) {
        (window as unknown as { __ggkEarlyMap?: unknown }).__ggkEarlyMap = null;
        early.el.removeAttribute("id");
        early.el.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        container.appendChild(early.el);
        mapRef.current = early.map;
        mapRef.current.setZoomable(true);
        mapRef.current.relayout();
        mapPaintedRef.current = true;
        setMapReady(true);
        return;
      }

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
      // 지도 그림이 처음 다 그려지면(또는 그림 서버가 느려도 0.7초 뒤에는) 장소 데이터를 올려도 된다고 알립니다.
      const markPainted = () => { mapPaintedRef.current = true; };
      try { window.kakao.maps.event.addListener(mapRef.current, "tilesloaded", markPainted); } catch { markPainted(); }
      setTimeout(markPainted, 700);
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
  const CLUSTER_ZOOM_THRESHOLD = SUMMARY_MIN_LEVEL;
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
        jumpMapTo(map, cluster.getCenter(), 3);
      });
    }

    const clearDetailMarkers = () => {
      pillJobRef.current++;
      markerMapRef.current.forEach((overlay) => overlay.setMap(null));
      markerMapRef.current.clear();
      pillNameRef.current.clear();
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

    // 가게 이름표 pill(원래 지도 마커) 하나를 그립니다. 누르면 미리보기 카드(정보·후기)가 열립니다.
    const addPlacePill = (place: any, position: any, zIndex = 3) => {
        const emoji = getPlaceEmoji(place) || "🐾";
        const overlay = new window.kakao.maps.CustomOverlay({
          position,
          content: `
            <div
              onclick="window.selectPlace(${place.id})"
              style="
                background:white;
                color:#222;
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
              ${emoji} ${escapeHtml(place.name)}
            </div>
          `,
          yAnchor: 1,
          zIndex,
        });

        overlay.setMap(map);
        markerMapRef.current.set(place.id, overlay);
        pillNameRef.current.set(place.id, place.name);
    };

    // 코스 집중 모드: 코스에 속한 장소의 원래 마커만 줌 레벨과 무관하게 그립니다(클러스터로
    // 뭉치지 않게). 카테고리 필터와도 무관하게 코스 장소는 항상 보여야 해서 places 전체에서 찾습니다.
    if (hideMarkersForCourse) {
      clearDetailMarkers();
      clearClusterMarkers();
      const courseIds = new Set(courseStopKey.split("|"));
      places.forEach((place) => {
        if (!courseIds.has(String(place.id))) return;
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        addPlacePill(place, new window.kakao.maps.LatLng(lat, lng), 16);
      });
      return () => clearDetailMarkers();
    }

    // ── 좁은 줌: 지금까지 쓰던 이름표 pill (CustomOverlay) + 뷰포트 필터링
    const renderDetailMarkers = () => {
      clearClusterMarkers();

      // ⚠ 속도(확대·축소·끌기 때의 버벅임): 예전에는 지도가 멈출 때마다 이름표를 전부 지우고 다시 만들었습니다.
      // 이름표 하나를 붙일 때마다 브라우저가 화면 배치를 다시 계산해서, 이름표가 100개쯤이면 느린 폰에서 1초 가까이 멈췄습니다.
      // 이제는 ① 이미 그려진 이름표는 그대로 두고 ② 화면에서 나간 것만 떼고 ③ 새로 들어온 것만, 그것도 한 번에
      // PILL_CHUNK개씩 화면 한 장마다 나눠 붙입니다.
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
      const minLat = sw.getLat(), maxLat = ne.getLat(), minLng = sw.getLng(), maxLng = ne.getLng();

      const inView: { place: any; lat: number; lng: number }[] = [];
      for (const place of filteredPlaces) {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lng);
        if (isNaN(lat) || isNaN(lng)) continue;
        if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue; // 화면 안에 없으면 생성 안 함
        inView.push({ place, lat, lng });
      }
      // ⚠ 속도: 화면 안의 장소가 너무 많으면 이름표를 그리지 않습니다 — "구역별 장소 수 동그라미" 효과가 숫자로 보여 줍니다
      // (이름표 수백 개를 붙였다 떼는 것이 지도를 끌 때마다 몇 초씩 멈추던 원인).
      if (inView.length > DENSE_VIEW_LIMIT) { clearDetailMarkers(); return; }

      const job = ++pillJobRef.current;
      const wanted = new Map<any, { place: any; lat: number; lng: number }>();
      for (const item of inView) wanted.set(item.place.id, item);
      // 화면에서 나갔거나 이름이 바뀐 이름표는 뗍니다.
      markerMapRef.current.forEach((overlay, id) => {
        const item = wanted.get(id);
        if (item && pillNameRef.current.get(id) === item.place.name) return;
        overlay.setMap(null);
        markerMapRef.current.delete(id);
        pillNameRef.current.delete(id);
      });
      // 새로 들어온 것만 나눠서 붙입니다.
      const todo = inView.filter((item) => !markerMapRef.current.has(item.place.id));
      let index = 0;
      const addChunk = () => {
        if (pillJobRef.current !== job) return; // 그 사이 다시 그리기가 시작됨
        const end = Math.min(todo.length, index + PILL_CHUNK);
        for (; index < end; index++) {
          const { place, lat, lng } = todo[index];
          addPlacePill(place, new window.kakao.maps.LatLng(lat, lng));
        }
        if (index < todo.length) requestAnimationFrame(addChunk);
      };
      addChunk();
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
            map.setLevel(3);
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
        // ⚠ 속도: 넓게 볼 때는 장소를 하나하나 마커로 만들지 않습니다 — 화면 안의 1만여 곳을 마커로 만들어 묶는 데
        // PC에서도 수십 초씩 화면이 멈췄습니다. 대신 "구역별 장소 수 동그라미" 효과가 숫자만 그립니다.
        // 풀이한 검색 중에는 걸러진 장소를 보여 줘야 하므로 예전처럼 묶음 마커를 씁니다.
        if (!intentActive) { clearDetailMarkers(); clearClusterMarkers(); return; }
        renderClusterMarkers();
      } else {
        renderDetailMarkers();
      }
    };

    updateByZoom();

    // ⚠ 마커를 지우고 새로 그리는 일은 지도의 "멈춤(idle)" 처리가 끝난 뒤로 미룹니다(setTimeout 0).
    // 마커(오버레이)를 붙였다 떼면 카카오 지도 내부의 idle 처리 목록이 바뀌는데, 그게 idle을 처리하는 도중에 일어나면
    // 뒤 순서의 처리가 건너뛰어졌습니다 — 지도를 끌어도 목록이 그대로이거나(화면 범위 갱신이 빠짐) 숫자 동그라미가
    // 안 바뀌는 원인이었습니다. (화면 범위 갱신은 아래 별도 효과가 맡습니다.)
    let alive = true;
    const onIdle = () => { setTimeout(() => { if (alive) updateByZoom(); }, 0); };
    window.kakao.maps.event.addListener(map, "idle", onIdle);
    return () => {
      alive = false;
      window.kakao.maps.event.removeListener(map, "idle", onIdle);
      // 이름표는 여기서 지우지 않습니다 — 다음 실행이 바뀐 것만 떼고 붙입니다(전부 지웠다 다시 만들면 그만큼 멈춤).
      pillJobRef.current++;
      clearClusterMarkers();
    };
  }, [filteredPlaces, mapReady, hideMarkersForCourse, courseStopKey, places, intentActive]);

  // ── 지도가 멈출 때마다 화면 범위·확대 단계를 기억합니다(목록, 데이터 받기, 숫자 동그라미가 모두 이 값을 따릅니다) ──
  // 지도가 준비될 때 한 번만 붙입니다. 예전에는 위 마커 효과 안에서 마커 그리기 다음 순서로 붙여서, 마커가 다시
  // 그려지는 순간에는 이 갱신이 건너뛰어졌습니다(지도를 끌었는데 목록이 그대로인 문제).
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;
    const updateBounds = () => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      setMapBounds({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() });
      setMapLevel(map.getLevel());
    };
    updateBounds();
    window.kakao.maps.event.addListener(map, "idle", updateBounds);
    return () => window.kakao.maps.event.removeListener(map, "idle", updateBounds);
  }, [mapReady]);

  // ── 공원 마커 (places와 완전히 별도 레이어) ──
  // ⚠ 공원은 "장소"가 아니라 리뷰/신고/상세페이지 구조가 없어서, 클릭해도 상세 모달을
  // 열지 않고 이름/구분/면적/시설 메모만 보여주는 가벼운 정보 카드(selectedPark)만 띄웁니다.
  // 전국 19,199건 규모라 places와 똑같이 "좁은 줌=이름표 pill / 넓은 줌=클러스터" +
  // 뷰포트 기준 필터링을 그대로 적용해 성능 문제를 피합니다. showParks 토글로 끌 수 있습니다.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    const clearParkDetailMarkers = () => {
      parkPillJobRef.current++;
      parkMarkerMapRef.current.forEach((overlay) => overlay.setMap(null));
      parkMarkerMapRef.current.clear();
    };
    const clearParkClusterMarkers = () => {
      parkClustererRef.current?.clear();
      parkClustererRef.current?.setMap(null); // 마커 0건 버그 수정 — renderClusterMarkers 쪽과 동일한 이유
      parkClusterMarkersRef.current = [];
    };

    // 공원 이름표 pill(원래 지도 마커) — 누르면 공원 정보 카드가 열립니다.
    const addParkPill = (park: any, position: any, zIndex = 2) => {
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
              🌳 ${escapeHtml(park.name)}
            </div>
          `,
          yAnchor: 1,
          zIndex,
        });
        overlay.setMap(map);
        parkMarkerMapRef.current.set(park.id, overlay);
    };

    // 코스 집중 모드: 코스에 들어간 공원만 원래 마커로 보여줍니다(공원 토글이 꺼져 있어도).
    if (hideMarkersForCourse) {
      clearParkDetailMarkers();
      clearParkClusterMarkers();
      const courseIds = new Set(courseStopKey.split("|"));
      parks.forEach((park) => {
        if (!courseIds.has(`park-${park.id}`)) return;
        const lat = parseFloat(park.lat);
        const lng = parseFloat(park.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        addParkPill(park, new window.kakao.maps.LatLng(lat, lng), 16);
      });
      return () => clearParkDetailMarkers();
    }

    if (!parksVisible || mapParks.length === 0) {
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
        jumpMapTo(map, cluster.getCenter(), 3);
      });
    }

    const renderParkDetailMarkers = () => {
      clearParkClusterMarkers();
      // 장소 이름표와 같은 방식: 그려진 것은 두고, 나간 것만 떼고, 새로 들어온 것만 나눠 붙입니다.
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
      const minLat = sw.getLat(), maxLat = ne.getLat(), minLng = sw.getLng(), maxLng = ne.getLng();
      const wanted = new Map<any, { park: any; lat: number; lng: number }>();
      for (const park of mapParks) {
        const lat = parseFloat(park.lat);
        const lng = parseFloat(park.lng);
        if (isNaN(lat) || isNaN(lng)) continue;
        if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
        wanted.set(park.id, { park, lat, lng });
      }
      const job = ++parkPillJobRef.current;
      parkMarkerMapRef.current.forEach((overlay, id) => {
        if (wanted.has(id)) return;
        overlay.setMap(null);
        parkMarkerMapRef.current.delete(id);
      });
      const todo = [...wanted.values()].filter((item) => !parkMarkerMapRef.current.has(item.park.id));
      let index = 0;
      const addChunk = () => {
        if (parkPillJobRef.current !== job) return;
        const end = Math.min(todo.length, index + PILL_CHUNK);
        for (; index < end; index++) addParkPill(todo[index].park, new window.kakao.maps.LatLng(todo[index].lat, todo[index].lng));
        if (index < todo.length) requestAnimationFrame(addChunk);
      };
      addChunk();
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

      const markers = mapParks
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
            map.setLevel(3);
            window.selectPark(park.id);
          });
          return marker;
        })
        .filter(Boolean);

      parkClustererRef.current.addMarkers(markers);
      parkClusterMarkersRef.current = markers;
    };

    const updateParksByZoom = () => {
      // 화면 안에 장소가 너무 많아 숫자 동그라미로 보여 주는 중이면 공원 이름표도 그리지 않습니다(공원도 동그라미로).
      if (denseView && map.getLevel() < CLUSTER_ZOOM_THRESHOLD) { clearParkDetailMarkers(); clearParkClusterMarkers(); return; }
      if (map.getLevel() >= CLUSTER_ZOOM_THRESHOLD) {
        // 넓게 볼 때는 공원도 구역별 수 동그라미로 보여 줍니다(장소 마커와 같은 이유).
        if (!intentActive) { clearParkDetailMarkers(); clearParkClusterMarkers(); return; }
        renderParkClusterMarkers();
      } else {
        renderParkDetailMarkers();
      }
    };

    updateParksByZoom();
    // 장소 마커와 같은 이유로, 다시 그리기는 지도의 idle 처리가 끝난 뒤에 합니다.
    let alive = true;
    const onIdle = () => { setTimeout(() => { if (alive) updateParksByZoom(); }, 0); };
    window.kakao.maps.event.addListener(map, "idle", onIdle);
    return () => {
      alive = false;
      window.kakao.maps.event.removeListener(map, "idle", onIdle);
      // 장소 이름표와 같은 이유로 여기서 전부 지우지 않습니다(다음 실행이 바뀐 것만 맞춤).
      parkPillJobRef.current++;
      clearParkClusterMarkers();
    };
  }, [parks, mapParks, mapReady, parksVisible, hideMarkersForCourse, courseStopKey, intentActive, denseView]);

  // 지도 화면을 떠날 때 남아 있는 이름표를 모두 뗍니다(위 두 효과는 다시 돌 때 지우지 않으므로 여기서 한 번).
  useEffect(() => {
    const placePills = markerMapRef.current, parkPills = parkMarkerMapRef.current, names = pillNameRef.current;
    return () => {
      pillJobRef.current++; parkPillJobRef.current++;
      placePills.forEach((overlay) => overlay.setMap(null)); placePills.clear(); names.clear();
      parkPills.forEach((overlay) => overlay.setMap(null)); parkPills.clear();
    };
  }, []);

  // ══ 구역별 장소 수 동그라미(넓게 볼 때) ══
  // 서버가 확대 단계에 맞는 크기의 구역으로 미리 세어 둔 "구역별 장소 수"를, 화면에 걸치는 묶음만큼(보통 1~4건) 받아
  // 동그라미로 그립니다. 그리는 것은 동그라미 수십 개뿐이라 장소가 몇만 곳이어도 걸리는 시간이 같습니다.
  // 동그라미를 누르면 그 자리로 확대합니다. 지도 위쪽 버튼(실내·야외·동물병원 등)과 공원 버튼도 숫자에 반영됩니다.
  // 우리 DB에 직접 등록된 장소는 서버 집계에 없어 따로 더합니다.
  const ownPlacePoints = useMemo(
    () => baseFilteredPlaces.filter((p) => p.source !== "public-data").map((p) => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) })),
    [baseFilteredPlaces]
  );
  // ⚠ 서버의 구역별 집계는 전체·실내·야외·실내외·동물병원·약국 기준만 있습니다. "숙소" 버튼을 골라도 맞는 기준이 없어
  //    전체 장소 수가 그대로 떠서, 숙소가 하나도 없는 곳에도 숫자가 보였습니다. 숙소일 때는 전국 숙소 목록
  //    (/api/lodging/list — 공공데이터 숙소 + 직접 등록된 숙소, 약 500곳)의 실제 위치로 직접 셉니다.
  const [lodgingPoints, setLodgingPoints] = useState<{ lat: number; lng: number }[] | null>(null);
  useEffect(() => {
    if (selectedPetZone !== "lodging" || lodgingPoints) return;
    let cancelled = false;
    fetch("/api/lodging/list").then((r) => r.json())
      .then((d: { items?: { lat: number; lng: number }[] }) => { if (!cancelled) setLodgingPoints((d.items ?? []).filter((x) => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng))).map((x) => ({ lat: Number(x.lat), lng: Number(x.lng) }))); })
      .catch(() => { if (!cancelled) setLodgingPoints([]); });
    return () => { cancelled = true; };
  }, [selectedPetZone, lodgingPoints]);
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;
    let overlays: any[] = [];
    let run = 0;
    const clear = () => { overlays.forEach((o) => o.setMap(null)); overlays = []; };
    (window as any).ggkZoomInAt = (lat: number, lng: number) => {
      const level = map.getLevel();
      // 이름표 단계(가까이 보는 중)면 한 단계씩, 구 단위쯤이면 이름표가 보이는 단계로, 더 넓으면 두 단계씩 확대합니다.
      const next = level < SUMMARY_MIN_LEVEL ? Math.max(1, level - 1) : level <= SUMMARY_MIN_LEVEL + 1 ? SUMMARY_MIN_LEVEL - 1 : level - 2;
      jumpMapTo(map, new window.kakao.maps.LatLng(lat, lng), next);
    };
    const bubble = (lat: number, lng: number, count: number, kind: "place" | "park") => {
      const size = count < 100 ? 38 : count < 1000 ? 46 : 56;
      const color = kind === "place"
        ? (count < 100 ? "rgba(76,110,245,0.88)" : count < 1000 ? "rgba(59,90,220,0.9)" : "rgba(37,70,190,0.92)")
        : "rgba(76,140,74,0.88)";
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(lat, lng),
        content: `<div data-count-bubble="${kind}" onclick="window.ggkZoomInAt(${lat},${lng})" style="width:${kind === "place" ? size : size - 10}px;height:${kind === "place" ? size : size - 10}px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${count >= 1000 ? 13 : 12}px;font-weight:700;font-family:'Noto Sans KR',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.22);border:2px solid rgba(255,255,255,0.85);cursor:pointer;user-select:none;">${formatBubbleCount(count)}</div>`,
        yAnchor: 0.5, xAnchor: 0.5, zIndex: kind === "place" ? 4 : 3,
      });
      overlay.setMap(map);
      overlays.push(overlay);
    };
    let stopped = false;
    const render = async () => {
      if (stopped) return;
      const mine = ++run;
      const level = map.getLevel();
      if (hideMarkersForCourse) { clear(); return; }
      const b = map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
      const view = { swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() };
      if (level < SUMMARY_MIN_LEVEL) {
        // 가까이 보는 단계: 화면 안의 장소가 너무 많을 때만, 받아 둔 장소를 바로 구역별로 세어 그립니다
        // (검색·버튼으로 걸러진 결과 그대로). 많지 않으면 이름표가 보이므로 동그라미는 지웁니다.
        const close = bubblesFromPoints(filteredPlaces, [], view, cellDegForCloseLevel(level));
        const total = close.reduce((sum, item) => sum + item.count, 0);
        clear();
        if (total <= DENSE_VIEW_LIMIT) return;
        const withParks = parksVisible ? bubblesFromPoints(filteredPlaces, mapParks, view, cellDegForCloseLevel(level)) : close;
        for (const item of withParks) {
          if (item.count > 0) bubble(item.lat, item.lng, item.count, "place");
          if (item.parkCount > 0) bubble(item.parkLat, item.parkLng, item.parkCount, "park");
        }
        return;
      }
      if (intentActive) { clear(); return; }
      // 숙소: 서버 집계에 숙소 기준이 없어 숙소 목록의 실제 위치로 셉니다(위 lodgingPoints 설명). 공원은 서버 집계 그대로.
      if (selectedPetZone === "lodging") {
        const lodgingBubbles = bubblesFromPoints(lodgingPoints ?? [], [], view, cellDegForLevel(level));
        const parkRows = parksVisible ? await fetchCountBlocks(level, blocksForBounds(view, level)) : [];
        if (mine !== run) return;
        clear();
        for (const item of lodgingBubbles) if (item.count > 0) bubble(item.lat, item.lng, item.count, "place");
        if (parksVisible) for (const item of bubblesFromRows(parkRows, view, level, "all", true)) if (item.parkCount > 0) bubble(item.parkLat, item.parkLng, item.parkCount, "park");
        return;
      }
      const rows = await fetchCountBlocks(level, blocksForBounds(view, level));
      if (mine !== run) return; // 그 사이 지도가 또 움직였으면 최신 것만 그립니다.
      const bubbles = bubblesFromRows(rows, view, level, selectedPetZone as CountFilter, parksVisible, ownPlacePoints);
      clear();
      for (const item of bubbles) {
        if (item.count > 0) bubble(item.lat, item.lng, item.count, "place");
        if (item.parkCount > 0) bubble(item.parkLat, item.parkLng, item.parkCount, "park");
      }
    };
    render();
    // 다시 그리기는 지도의 idle 처리가 끝난 뒤에 합니다(위 마커 효과의 설명 참고).
    const onIdle = () => { setTimeout(render, 0); };
    window.kakao.maps.event.addListener(map, "idle", onIdle);
    return () => {
      stopped = true;
      run++;
      window.kakao.maps.event.removeListener(map, "idle", onIdle);
      clear();
    };
  }, [mapReady, intentActive, hideMarkersForCourse, selectedPetZone, parksVisible, ownPlacePoints, filteredPlaces, mapParks, lodgingPoints]);

  // ── 코스 전체가 보이도록 지도 맞추기 ──
  // 코스가 패널 뒤에 숨지 않게, 패널이 가리는 쪽만큼 여백을 더 줘서 줌을 조절합니다.
  // (예전엔 사방 80px라 오른쪽 코스 패널(320px) 뒤에 1·2번 정거장이 가려졌습니다.)
  // 좁은 화면은 패널이 화면 대부분을 덮어 옆으로 비킬 공간이 없어서 위·아래 여백만 챙깁니다.
  // 매 렌더마다 최신 패널 배치를 읽도록 ref에 담아, 코스가 바뀔 때·창 크기가 바뀔 때·
  // "코스 전체 보기" 버튼을 누를 때 모두 같은 계산을 씁니다.
  const courseBoundsRef = useRef<any>(null);
  const fitCourseRef = useRef<() => void>(() => {});
  fitCourseRef.current = () => {
    const map = mapRef.current;
    const bounds = courseBoundsRef.current;
    if (!map || !bounds) return;
    const EDGE = 14 + 36; // 패널 가장자리 여백 + 번호 마커·이름표가 걸치지 않을 여유
    let padLeft = 80;
    let padRight = 80;
    if (!isNarrowScreen) {
      const routePanelPad = 320 + EDGE;
      const listPanelPad = showListPanel ? 222 + EDGE : 80;
      if (otherPanelsSide === "right") { padRight = routePanelPad; padLeft = listPanelPad; }
      else { padLeft = routePanelPad; padRight = listPanelPad; }
    }
    const padTop = isNarrowScreen ? headerHeight + 30 : 140;
    const padBottom = isNarrowScreen ? sheetPx + 30 : 130; // 휴대폰: 바텀시트 높이 / PC: 하단 탭바 + 마지막 정거장 이름표
    map.setBounds(bounds, padTop, padRight, padBottom, padLeft);
  };

  // 창 크기가 바뀌거나(패널 배치가 달라짐) 목록 패널이 열리고 닫히면 코스를 다시 맞춥니다.
  useEffect(() => {
    if (!showRoutePanel) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fitCourseRef.current(), 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [showRoutePanel]);
  useEffect(() => {
    if (showRoutePanel) fitCourseRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrowScreen, showListPanel, otherPanelsSide, sheetSnap]);

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

    if (!showRoutePanel || !currentRoute || currentRoute.stops.length < 2) {
      routeFittedSignatureRef.current = "";
      courseBoundsRef.current = null;
      return;
    }

    // ⚠ 좌표가 NaN/undefined인 LatLng가 Polyline·LatLngBounds에 섞이면 카카오 SDK 내부
    // 투영 계산에서 "Cannot read properties of undefined (reading 'x')"가 날 수 있어서,
    // 유효한 좌표만 씁니다.
    const isValidCoord = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng);

    // 점선은 정거장1이 아니라 출발지(내 위치 — 파란 점 오버레이가 표시된 지점)부터
    // 시작해야 실제로 "여기서 출발해서 이 순서로 걷는다"는 코스가 보입니다.
    const path = [
      { lat: Number(currentRoute.origin.lat), lng: Number(currentRoute.origin.lng) },
      ...currentRoute.stops.map((stop) => ({
        lat: parseFloat(String(stop.place.lat)),
        lng: parseFloat(String(stop.place.lng)),
      })),
    ]
      .filter((p) => isValidCoord(p.lat, p.lng))
      .map((p) => new window.kakao.maps.LatLng(p.lat, p.lng));
    if (path.length < 2) return;

    // 실제 도보 경로(TMAP)가 있으면 그 길을 따라 실선으로, 없으면 정거장끼리 잇는 점선(추정)으로 그립니다.
    const walkLatLngs = (walkPath ?? [])
      .filter(([lat, lng]) => isValidCoord(lat, lng))
      .map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng));
    const hasWalkPath = walkLatLngs.length >= 2;
    const polyline = new window.kakao.maps.Polyline({
      path: hasWalkPath ? walkLatLngs : path,
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
      // 방문 순서 번호 — 가게 정보는 위쪽의 원래 가게 마커(이름표)가 보여주므로, 번호는 그 바로
      // 아래(장소 좌표 기준 아래쪽)에 붙여 겹치지 않게 합니다. 고정(핀)한 정거장은 📌를 붙입니다.
      const pinned = pinnedStopIds.has(stop.place.id);
      const pinMark = pinned ? '<span style="position:absolute; top:-8px; right:-9px; font-size:11px;">📌</span>' : "";
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(lat, lng),
        content: `
          <div
            onclick="window.selectPlace(${typeof stop.place.id === "number" ? stop.place.id : `'${stop.place.id}'`})"
            style="
              position:relative; margin-top:3px;
              width:24px; height:24px; border-radius:50%;
              background:linear-gradient(135deg,#a78bfa,#7c3aed);
              color:white; display:flex; align-items:center; justify-content:center;
              font-size:12px; font-weight:800; font-family:'Noto Sans KR',sans-serif;
              box-shadow:0 2px 8px rgba(124,58,237,0.45); border:2px solid white;
              cursor:pointer; user-select:none;
            "
          >${idx + 1}${pinMark}</div>
        `,
        yAnchor: 0,
        zIndex: 15,
      });
      overlay.setMap(map);
      routeMarkerOverlaysRef.current.push(overlay);
    });

    // 코스 전체가 한 화면에 들어오도록 범위를 맞춥니다 — 코스가 실제로 바뀌었을 때만.
    // (도보 경로 도착·장소 목록 갱신 등으로 같은 코스를 다시 그릴 때마다 맞추면, 사용자가
    // 검색/드래그로 옮긴 화면이 계속 코스 쪽으로 끌려갑니다.)
    // ⚠ 주소 검색은 setCenter + setLevel(animate)로 지도를 옮기는데, 그 애니메이션이 도는
    // 도중에 setBounds가 끼어들면 카카오 SDK가 "reading 'x'" 에러를 프레임마다 반복해서
    // 던지는 것으로 보입니다(AI 코스 패널을 연 채 주소 검색 시 재현). 줌 애니메이션 중이면
    // 끝난 뒤(idle)로 미룹니다.
    const bounds = new window.kakao.maps.LatLngBounds();
    path.forEach((p: any) => bounds.extend(p));
    courseBoundsRef.current = bounds;

    let pendingIdleListener: (() => void) | null = null;
    if (routeSignature && routeFittedSignatureRef.current !== routeSignature) {
      routeFittedSignatureRef.current = routeSignature;
      const fitBounds = () => fitCourseRef.current();
      if (mapZoomingRef.current) {
        pendingIdleListener = () => {
          window.kakao.maps.event.removeListener(map, "idle", pendingIdleListener!);
          pendingIdleListener = null;
          fitBounds();
        };
        window.kakao.maps.event.addListener(map, "idle", pendingIdleListener);
      } else {
        fitBounds();
      }
    }

    return () => {
      if (pendingIdleListener) {
        window.kakao.maps.event.removeListener(map, "idle", pendingIdleListener);
        // 맞추기 전에 정리됐으면 다음 렌더에서 다시 맞출 수 있게 표시를 되돌립니다.
        routeFittedSignatureRef.current = "";
      }
      routePolylineRef.current?.setMap(null);
      routePolylineRef.current = null;
      routeMarkerOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      routeMarkerOverlaysRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoutePanel, currentRoute, mapReady, walkPath, pinnedStopIds]);

  // 지도 줌 애니메이션 진행 여부 추적(위 코스 effect가 setBounds를 미룰지 판단하는 데 씀)
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;
    const onZoomStart = () => { mapZoomingRef.current = true; };
    const onIdle = () => { mapZoomingRef.current = false; };
    window.kakao.maps.event.addListener(map, "zoom_start", onZoomStart);
    window.kakao.maps.event.addListener(map, "idle", onIdle);
    return () => {
      window.kakao.maps.event.removeListener(map, "zoom_start", onZoomStart);
      window.kakao.maps.event.removeListener(map, "idle", onIdle);
    };
  }, [mapReady]);

  // 휴대폰: 지도를 끌어 움직이면 반쯤 올라와 있던 시트를 낮게 내려 지도를 비켜줍니다(지도 앱 공통 동작).
  useEffect(() => {
    if (!isNarrowScreen || !mapReady || !mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;
    const onDragStart = () => setSheetSnap((cur) => (cur === "half" ? "peek" : cur));
    window.kakao.maps.event.addListener(map, "dragstart", onDragStart);
    return () => window.kakao.maps.event.removeListener(map, "dragstart", onDragStart);
  }, [isNarrowScreen, mapReady]);

  const moveToMyLocation = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }
    if (!mapRef.current) return;
    stopMyLocationWatchRef.current?.();
    let first = true;
    // 자동 위치 확인과 같은 방식으로, 첫 값으로 바로 이동한 뒤 더 정확한 값이 오면 보정합니다.
    stopMyLocationWatchRef.current = watchBestPosition(
      async (fix, final) => {
        // 직접 지정한 위치가 있으면, 그보다 확실히 정확한 GPS 값이 아닌 한 그 위치로 이동만 합니다.
        const manual = manualLocationActive() && fix.accuracy > MANUAL_OVERRIDE_ACCURACY_M ? manualLocationRef.current : null;
        const target = manual ?? { lat: fix.lat, lng: fix.lng };
        const targetLatLng = new window.kakao.maps.LatLng(target.lat, target.lng);
        if (first) {
          first = false;
          // ⚠ 확대(레벨 변경)를 먼저 한 번에 끝내고 나서 가운데로 옮깁니다. 예전엔 "가운데 이동 →
          // 애니메이션 확대" 순서였는데, 넓게 축소해 둔 상태(레벨 차이가 큼)에서 누르면 확대 애니메이션
          // 도중에 더 정확한 위치값이 들어와 또 이동시키면서, 내 위치가 화면 가운데에서 벗어나고
          // 이전 축척의 지도 조각이 겹쳐 보였습니다.
          jumpMapTo(mapRef.current, targetLatLng, 3);
          setSearchCenter(null); // 내 위치로 이동하면 검색 기준은 초기화
          setSearchQuery("");
        } else {
          // 뒤이어 들어오는 더 정확한 위치값은 확대 없이 가운데만 다시 맞춥니다.
          mapRef.current?.setCenter(targetLatLng);
        }
        if (manual) return;
        manualLocationRef.current = null;
        setUserLocation({ lat: fix.lat, lng: fix.lng });
        setLocationAccuracy(fix.accuracy);
        setLocationSource("gps");
        setLocationNoticeDismissed(false);
        if (final) saveLocation({ lat: fix.lat, lng: fix.lng }, { accuracy: fix.accuracy, at: Date.now(), source: "gps" });
      },
      () => {
        // 보안 연결(https)이 아니면 브라우저가 권한 팝업 없이 바로 거절합니다 — 이때 "권한을
        // 확인하라"고 하면 사용자가 찾을 수 없는 팝업을 찾게 되므로 원인을 그대로 알려줍니다.
        if (!window.isSecureContext) {
          alert("지금은 보안 연결(https)이 아닌 주소로 접속 중이라 브라우저가 위치를 알려주지 않아요.\n지도에서 내 위치를 직접 지정해 주세요.");
          return;
        }
        alert("위치 정보를 가져올 수 없습니다.\n브라우저 위치 권한을 확인해주세요.");
      },
      { maxWaitMs: 8000 }
    );
  };

  // ── 지도에서 내 위치 직접 지정 ──
  // PC처럼 GPS가 없는 환경은 인터넷(IP) 기반으로 수 km씩 틀린 위치가 잡힐 수 있어서, 지도 가운데
  // 핀을 내 위치에 맞추고 확정하면 그 좌표를 24시간 동안 "현재 위치"로 씁니다.
  const startPickingLocation = () => {
    stopMyLocationWatchRef.current?.();
    if (mapRef.current && userLocation) {
      mapRef.current.setCenter(new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng));
    }
    setPickingLocation(true);
  };

  const confirmPickedLocation = () => {
    const center = mapRef.current?.getCenter?.();
    if (!center) return;
    const loc = { lat: center.getLat(), lng: center.getLng() };
    const at = Date.now();
    manualLocationRef.current = { ...loc, at };
    setUserLocation(loc);
    setLocationAccuracy(0);
    setLocationSource("manual");
    setSearchCenter(null);
    setSearchQuery("");
    setPickingLocation(false);
    saveLocation(loc, { accuracy: 0, at, source: "manual" });
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
        imageUrl: `${window.location.origin}/og-default.png`,
        link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
      },
      buttons: [{ title: "지도 열기", link: { mobileWebUrl: window.location.href, webUrl: window.location.href } }],
    });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("링크가 복사되었습니다.");
    } catch {
      // 클립보드 API는 보안 연결(https)에서만 동작 — 안 되면 직접 복사할 수 있게 보여줍니다.
      window.prompt("아래 링크를 길게 눌러 복사해 주세요", window.location.href);
    }
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

  // ── 길찾기(카카오맵·네이버지도) ──
  // URL 형식·플랫폼별 분기는 src/lib/directions.ts 참고. 카카오는 공식 웹 URL이라 PC·모바일
  // 어디서나 열리고, 네이버는 앱 전용이라 PC에서는 카카오맵으로 대신 열지 안내합니다.
  // 출발지 이름은 패널의 "출발:" 표기와 같게 맞춥니다 — 위치 권한이 없어 검색 중심에서
  // 코스를 만든 경우 "현재 위치"라고 부르면 사용자가 엉뚱한 곳에서 출발하는 줄 압니다.
  const routeOriginLabel = userLocation ? "현재 위치" : (searchQuery.trim() || "지도 중심");

  const toDirectionPoint = (place: { lat?: unknown; lng?: unknown; name: string }): DirectionPoint | null => {
    const lat = parseFloat(String(place.lat));
    const lng = parseFloat(String(place.lng));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng, name: place.name };
  };

  const openWalkDirections = (app: "kakao" | "naver", origin: DirectionPoint, targets: DirectionPoint[]) => {
    if (targets.length === 0) return;
    if (app === "kakao") {
      openKakaoWalk([origin, ...targets]);
      return;
    }
    // 휴대폰은 네이버지도 앱(출발지 = 기기 현재 위치), PC는 네이버 지도 웹(출발지 = 코스 출발지)
    openNaverWalk(targets[targets.length - 1], targets.slice(0, -1), origin);
  };

  const routeOriginPoint = (route: RouteResult): DirectionPoint => ({
    lat: route.origin.lat,
    lng: route.origin.lng,
    name: routeOriginLabel,
  });

  /** 코스 전체(출발 → 정거장 순서대로)로 길찾기 */
  const handleRouteDirections = (route: RouteResult, app: "kakao" | "naver") => {
    const targets = route.stops.map((s) => toDirectionPoint(s.place)).filter((p): p is DirectionPoint => p !== null);
    if (targets.length === 0) return;
    trackEvent("course_start", {
      authUserId: session?.user?.id ?? null,
      variant: activeRecVariant,
      meta: { ...courseMeta(route), app },
    });
    openWalkDirections(app, routeOriginPoint(route), targets);
  };

  // ── 코스 저장(회원 전용) — 지금 보이는 코스를 마이페이지 "저장한 코스"에 담아 둡니다.
  // 저장되면 저장된 코스 번호(id)를 기억해 둡니다 — 잘못 눌렀을 때 "저장 취소"로 바로 지울 수 있게.
  const [courseSave, setCourseSave] = useState<{ key: string; state: "saving" | "saved" | "canceling" | "error"; id?: number; message?: string } | null>(null);
  const courseKey = (route: RouteResult) => `${routeTheme}:${route.stops.map((s) => s.place.id).join(",")}`;
  const handleSaveCourse = async (route: RouteResult) => {
    if (!session?.user) { router.push("/login"); return; }
    const key = courseKey(route);
    setCourseSave({ key, state: "saving" });
    const result = await saveCourse({ title: courseTitle(ROUTE_THEME_LABEL[routeTheme], toSavedStops(route)), theme: routeTheme, route });
    setCourseSave(result.ok ? { key, state: "saved", id: result.id } : { key, state: "error", message: result.error });
  };
  const handleCancelSaveCourse = async () => {
    if (!courseSave || courseSave.state !== "saved" || courseSave.id == null) return;
    const { key, id } = courseSave;
    setCourseSave({ key, state: "canceling", id });
    const ok = await deleteSavedCourse(id);
    // 취소에 실패하면 저장된 상태로 되돌려 다시 시도할 수 있게 합니다.
    setCourseSave(ok ? null : { key, state: "saved", id, message: "저장을 취소하지 못했어요. 잠시 후 다시 시도해 주세요." });
  };

  /** 코스의 정거장 하나로 바로 길찾기 — 순서대로 다 돌지 않고 원하는 곳만 찾아갈 때 */
  const handleStopDirections = (route: RouteResult, stopIdx: number, app: "kakao" | "naver") => {
    const stop = route.stops[stopIdx];
    const target = stop && toDirectionPoint(stop.place);
    if (!target) return;
    trackEvent("course_stop_directions", {
      authUserId: session?.user?.id ?? null,
      placeId: String(stop.place.id),
      placeName: stop.place.name,
      variant: activeRecVariant,
      meta: { theme: routeTheme, pos: stopIdx + 1, app },
    });
    openWalkDirections(app, routeOriginPoint(route), [target]);
  };

  // ── 사장님 등록 버튼 클릭 ──
  // 비로그인·로그인 모두 사장님 가입·전환 페이지(/signup-owner)로 보냅니다 — 로그인 상태면 그 페이지가 전환 폼을 보여 줍니다.
  // 이미 사장님(승인완료/심사중)이면 안내만 합니다.
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
    router.push(`/signup-owner?redirect=${encodeURIComponent("/owner")}`);
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes tabPop {
          0% { transform: scale(1); }
          50% { transform: scale(0.96); }
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
      {/* ⚠ height: 100vh를 주면 휴대폰에서 주소창 높이만큼 화면보다 길어져, 지도 아래쪽에 붙은
          내 위치·공유 버튼이 바텀시트 뒤로 숨었습니다. inset:0만으로 실제 보이는 화면에 맞춥니다. */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <div id="map" data-level={mapLevel ?? undefined} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

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
            <LogoLoader size={40} label="내 위치를 확인하고 있어요" />
          </div>
        )}

        {/* 위치가 부정확할 때 안내 — PC(인터넷 기반 위치)나 오래된 저장 위치처럼 오차가 큰 경우 */}
        {!!userLocation && !pickingLocation && !locationNoticeDismissed && locationSource !== "manual" &&
          ((locationAccuracy != null && locationAccuracy > UNCERTAIN_LOCATION_M) ||
            (locationSource === "cache" && gpsSettled && locationAccuracy == null)) && (
          <div
            role="status"
            style={{
              position: "absolute", top: isNarrowScreen ? `${headerHeight + 22}px` : "100px", left: "50%", transform: "translateX(-50%)",
              zIndex: 6, display: "flex", alignItems: "center", gap: 8, maxWidth: "calc(100vw - 28px)",
              background: "rgba(255,255,255,0.97)", border: "1px solid #fde68a", borderRadius: 14,
              padding: "8px 8px 8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              fontFamily: "'Noto Sans KR', sans-serif",
            }}
          >
            <MapPin size={14} color="#d97706" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "#444", fontWeight: 600, lineHeight: 1.4 }}>
              {locationAccuracy != null
                ? `현재 위치의 오차가 ${formatAccuracy(locationAccuracy)}예요. 실제 위치와 다를 수 있어요.`
                : "현재 위치를 새로 확인하지 못해 예전에 저장된 위치를 보여주고 있어요."}
            </span>
            <button
              onClick={startPickingLocation}
              className="ggk-body"
              style={{
                flexShrink: 0, padding: "5px 9px", borderRadius: 9, border: "none", cursor: "pointer",
                background: "#2563eb", color: "white", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              }}
            >
              지도에서 내 위치 지정
            </button>
            <button
              onClick={() => setLocationNoticeDismissed(true)}
              aria-label="안내 닫기"
              style={{ flexShrink: 0, border: "none", background: "none", cursor: "pointer", padding: 2, color: "#666", display: "flex" }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* 지도에서 내 위치 지정 모드 — 가운데 고정 핀 + 확정 버튼 */}
        {pickingLocation && (
          <>
            <div
              aria-hidden
              style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -100%)",
                zIndex: 6, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center",
              }}
            >
              <MapPin size={38} color="#2563eb" fill="#dbeafe" strokeWidth={2.2} />
            </div>
            <div
              style={{
                position: "absolute", left: "50%", transform: "translateX(-50%)",
                bottom: isNarrowScreen ? `${mobileBottomInset + 12}px` : "95px", zIndex: 7,
                width: "min(380px, calc(100vw - 28px))", background: "white", borderRadius: 16,
                padding: "12px 14px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)",
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#222" }}>지도를 움직여 핀을 내 위치에 맞춰주세요</div>
              <div style={{ fontSize: 10.5, color: "#5c5c5c", marginTop: 3 }}>정한 위치는 24시간 동안 추천·AI 코스의 기준이 돼요.</div>
              <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                <button
                  onClick={() => setPickingLocation(false)}
                  className="ggk-body"
                  style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #e2e4e8", background: "white", color: "#555", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  취소
                </button>
                <button
                  onClick={confirmPickedLocation}
                  className="ggk-body"
                  style={{ flex: 2, padding: "9px 0", borderRadius: 10, border: "none", background: "#2563eb", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  여기가 내 위치예요
                </button>
              </div>
            </div>
          </>
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
            bottom: isNarrowScreen ? `${mobileBottomInset + 66}px` : "83px",
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

        {/* 내 위치 직접 지정 버튼 — 브라우저가 알려주는 위치가 틀렸을 때(PC의 와이파이·IP 추정 등).
            브라우저는 틀린 위치에도 오차를 작게(예: 143m) 알려주는 경우가 있어 앱이 스스로 알아챌 수
            없으므로, 오차 안내와 별개로 항상 쓸 수 있게 둡니다. */}
        <button
          onClick={startPickingLocation}
          title="내 위치가 틀렸나요? 지도에서 직접 지정"
          aria-label="지도에서 내 위치 직접 지정"
          style={{
            position: "absolute",
            bottom: isNarrowScreen ? `${mobileBottomInset + 120}px` : "137px",
            right: "20px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            border: "none",
            background: locationSource === "manual" ? "#eff6ff" : "white",
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
          <MapPinned size={18} color={locationSource === "manual" ? "#2563eb" : "#444"} />
        </button>

        {/* 내 위치 버튼 */}
        <button
          onClick={moveToMyLocation}
          title="내 위치로 이동"
          style={{
            position: "absolute",
            bottom: isNarrowScreen ? `${mobileBottomInset + 12}px` : "29px",
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
              // 휴대폰: 오른쪽 버튼 줄(내 위치·공유, 폭 약 60px)과 겹치지 않게 카드 중심을 왼쪽으로 옮깁니다.
              left: isNarrowScreen ? "calc(50% - 30px)" : "50%",
              bottom: isNarrowScreen ? `${mobileBottomInset + 12}px` : "100px",
              transform: "translateX(-50%)",
              width: isNarrowScreen ? "calc(100vw - 92px)" : "290px",
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
              <div style={{ fontSize: "11px", color: "#666", marginTop: "1px", display: "flex", alignItems: "center", gap: "3px" }}>
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
              // 휴대폰: 오른쪽 버튼 줄(내 위치·공유, 폭 약 60px)과 겹치지 않게 카드 중심을 왼쪽으로 옮깁니다.
              left: isNarrowScreen ? "calc(50% - 30px)" : "50%",
              bottom: isNarrowScreen ? `${mobileBottomInset + 12}px` : "100px",
              transform: "translateX(-50%)",
              width: isNarrowScreen ? "calc(100vw - 92px)" : "290px",
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
              <div style={{ fontSize: "11px", color: "#666", marginTop: "1px", display: "flex", alignItems: "flex-start", gap: "3px" }}>
                <MapPin size={10} color="#bbb" style={{ marginTop: "2px", flexShrink: 0 }} />
                {selectedPark.address || "주소 정보 없음"}
              </div>
              {selectedPark.facilityNote && (
                <div style={{ fontSize: "11px", color: "#555", marginTop: "8px", padding: "8px 10px", background: "#f7f7f5", borderRadius: "10px", lineHeight: 1.6 }}>
                  {/* facilityNote는 import-parks.mjs의 buildFacilityNote()가 "운동시설: ... · 편익시설: ..."
                      처럼 " · "로 이어붙여 저장합니다 — 한 줄로 뭉쳐 있으면 시설이 여러 개일 때 읽기 어려워서,
                      시설 종류별로 한 줄씩 줄바꿈해서 보여줍니다. */}
                  {selectedPark.facilityNote.split(" · ").map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
              {/* 공원 상세 페이지(후기·찜·길찾기) — 지도가 가진 정보로 바로 그리도록 먼저 기억시킵니다 */}
              <button
                onClick={() => {
                  const parkPlace = parkToPlace(selectedPark);
                  rememberPlaces([parkPlace]);
                  openPlaceDetail(parkPlace);
                }}
                className="ggk-body"
                style={{
                  marginTop: "10px", width: "100%", padding: "9px 0", borderRadius: "10px", border: "none",
                  background: "#5C7A4A", color: "white", fontWeight: 700, fontSize: "12px", cursor: "pointer",
                }}
              >
                자세히 보기 · 후기 쓰기
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
            ...(isNarrowScreen ? { top: "8px", left: "8px", right: "8px", padding: "8px 10px", borderRadius: "16px" } : {}),
          }}
        >
          {isNarrowScreen ? (
            // 휴대폰: 지도 앱 공통 배치 — [로고 · 검색창 · 메뉴] 한 줄 + 필터 칩 한 줄(가로로 밀어서 보기).
            // 검색창 글자는 16px(그보다 작으면 아이폰이 입력할 때 화면을 확대해 버림).
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* 로고: 핀 속 슈나우저 + "같이가개"(앱 아이콘과 같은 핀). 예전 손그림 두 마리는 빈 화면 등의 마스코트로 남겨 뒀습니다. */}
                <Image
                  src="/icons/logo_lockup.png"
                  alt="같이가개"
                  width={721}
                  height={231}
                  priority
                  style={{ height: "30px", width: "auto", display: "block", objectFit: "contain", flexShrink: 0 }}
                />
                <div style={{
                  flex: 1, minWidth: 0, height: 38, display: "flex", alignItems: "center", gap: 6,
                  background: "#f5f6f8", borderRadius: 999, padding: "0 12px", border: "1px solid #e8eaed", boxSizing: "border-box",
                }}>
                  <Search size={15} color="#999" style={{ flexShrink: 0 }} />
                  <input
                    placeholder={isNarrowScreen ? "예: 우리동네 핫플" : "가게·지역 검색 (예: 우리동네 핫플)"}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    enterKeyHint="search"
                    style={{
                      flex: 1, border: "none", outline: "none", fontSize: "16px", background: "transparent",
                      fontFamily: "'Noto Sans KR', sans-serif", color: "#111", minWidth: 0,
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      aria-label="검색어 지우기"
                      style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                    >
                      <X size={15} color="#999" />
                    </button>
                  )}
                </div>
                <button
                  ref={mobileMenuBtnRef}
                  onClick={() => setShowMobileMenu(true)}
                  aria-label="메뉴 열기"
                  aria-haspopup="dialog"
                  style={{
                    width: 38, height: 38, flexShrink: 0, borderRadius: 12,
                    border: showMobileMenu ? "none" : "1px solid rgba(30,30,20,0.12)",
                    background: showMobileMenu ? "#5C7A4A" : "white",
                    color: showMobileMenu ? "white" : "#3a3a32",
                    boxShadow: "0 2px 8px rgba(30,30,20,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  }}
                >
                  <Menu size={18} />
                </button>
              </div>
              <div
                className="ggk-chip-row"
                data-guide="filters-mobile"
                style={{
                  display: "flex", gap: 6, overflowX: "auto", overflowY: "hidden",
                  margin: "0 -10px", padding: "0 10px 2px", scrollbarWidth: "none",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {ZONE_FILTERS.map(({ key, label, Icon }) => (
                  <button key={key} onClick={() => setSelectedPetZone(key as typeof selectedPetZone)} style={{ ...getButtonStyle(key), ...MOBILE_CHIP_STYLE }}>
                    {Icon && <Icon size={14} />}{label}
                  </button>
                ))}
                <button
                  data-guide="park-toggle"
                  onClick={() => setShowParks((v) => !v)}
                  aria-pressed={showParks}
                  style={{
                    ...MOBILE_CHIP_STYLE,
                    display: "inline-flex", alignItems: "center", gap: 3,
                    borderRadius: "999px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    border: showParks ? "none" : "1px solid #d8dcd6",
                    background: showParks ? "#3a7438" : "white",
                    color: showParks ? "white" : "#666",
                    fontFamily: "'Noto Sans KR', sans-serif",
                  }}
                >
                  <Sprout size={14} />공원
                </button>
              </div>
              <style>{`.ggk-chip-row::-webkit-scrollbar { display: none; }`}</style>
            </div>
          ) : (
          <>
          {/* 좌측: 로고 */}
          <div style={{ flexShrink: 0, lineHeight: 1 }}>
            <Image
              src="/icons/logo_lockup.png"
              alt="같이가개"
              width={721}
              height={231}
              priority
              style={{ height: "52px", width: "auto", display: "block", objectFit: "contain" }}
            />
            <div
              className="ggk-body"
              style={{ fontSize: "10px", color: "#5c5c5c", fontWeight: 400, marginTop: "6px", letterSpacing: "-0.1px", whiteSpace: "nowrap" }}
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
                placeholder={isNarrowScreen ? "예: 우리동네 핫플" : "가게·지역 검색 (예: 우리동네 핫플)"}
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

            <div data-guide="filters" style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              {ZONE_FILTERS.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setSelectedPetZone(key as typeof selectedPetZone)} style={getButtonStyle(key)}>
                  {Icon && <Icon size={12} />}{label}
                </button>
              ))}
              {/* ⚠ 공원 버튼 자체가 눌림/안눌림 상태를 통째로 표현합니다(다른 필터 버튼과
                  같은 톤) — 텍스트는 "🌳 공원"으로 고정, 켜져 있으면 진한 초록으로 채워지고
                  꺼지면 옅은 외곽선만 남는 식으로 버튼 전체가 토글됩니다. */}
              <button
                data-guide="park-toggle"
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Sprout size={12} />공원
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
                style={toolButton(showListPanelMobile)}
              >
                <List size={13} />
                목록
              </button>
            )}

            {isNarrowScreen ? (
              <button
                ref={mobileMenuBtnRef}
                onClick={() => setShowMobileMenu(true)}
                aria-label="메뉴 열기"
                aria-haspopup="dialog"
                className="ggk-body"
                style={toolButton(showMobileMenu)}
              >
                <Menu size={13} />
                메뉴
              </button>
            ) : (
            <>
            {/* 도구 막대 — 예전엔 노랑·연두·보라·금색·회색 그라데이션 아이콘 다섯 개가 이름 없이 붙어 있어
                무엇인지 알기 어렵고 꾸민 티가 났습니다. 지도 앱처럼 흰 막대 하나에 아이콘+이름을 같은 색으로 두고,
                열려 있는 기능만 초록으로 채웁니다. 제보는 따로 진한 버튼으로. */}
            <div role="toolbar" aria-label="지도 기능" style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, borderRadius: 12, background: "white", border: "1px solid rgba(30,30,20,0.09)", boxShadow: "0 2px 10px rgba(30,30,20,0.08)" }}>
              <button ref={recentBtnRef} title="새로 등록된 장소" aria-label="새로 생긴 곳" aria-pressed={showRecentPanel}
                onClick={() => { setShowRecentPanel(!showRecentPanel); setShowRecommendPanel(false); setShowListPanelMobile(false); setShowRoutePanel(false); }}
                className="ggk-body" style={toolButton(showRecentPanel, true)}>
                <MapPinPlus size={14} />{toolbarLabels && "새로 생긴 곳"}
              </button>
              <button ref={recommendBtnRef} title="취향에 맞는 추천 장소" aria-label="취향 추천" aria-pressed={showRecommendPanel}
                onClick={() => { setShowRecommendPanel(!showRecommendPanel); setShowRecentPanel(false); setShowListPanelMobile(false); setShowRoutePanel(false); }}
                className="ggk-body" style={toolButton(showRecommendPanel, true)}>
                <Sparkles size={14} />{toolbarLabels && "취향 추천"}
              </button>
              <button ref={routeBtnRef} title="반려견과 걷기 좋은 코스" aria-label="산책 코스" aria-pressed={showRoutePanel}
                onClick={() => { setShowRoutePanel(!showRoutePanel); setShowRecentPanel(false); setShowRecommendPanel(false); setShowListPanelMobile(false); }}
                className="ggk-body" style={toolButton(showRoutePanel, true)}>
                <RouteIcon size={14} />{toolbarLabels && "산책 코스"}
              </button>
              <span aria-hidden style={{ width: 1, height: 18, background: "rgba(30,30,20,0.1)", margin: "0 2px" }} />
              <button ref={ownerBtnRef} title="우리 가게 등록·관리" aria-label="사장님" onClick={handleOwnerRegisterClick} disabled={ownerCheckLoading}
                className="ggk-body" style={{ ...toolButton(false, true), opacity: ownerCheckLoading ? 0.6 : 1, cursor: ownerCheckLoading ? "default" : "pointer" }}>
                <Store size={14} />{toolbarLabels && "사장님"}
              </button>
            </div>
            <button ref={jeboBtnRef} title="새 장소나 바뀐 정보 알려 주기" onClick={() => router.push("/jebo")}
              className="ggk-body"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 12, border: "none", background: "#2F3B28", color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(30,30,20,0.18)", fontFamily: "'Noto Sans KR', sans-serif" }}>
              <Pencil size={13} />{toolbarLabels ? "제보하기" : "제보"}
            </button>
            </>
            )}
          </div>
          </>
          )}
          {/* 공지 한 줄 — 커뮤니티 공지가 올라오면 제목 아래에 보입니다(없으면 아무것도 없음) */}
          <HomeNoticeBar compact={isNarrowScreen} />
        </div>
      )}

      {/* ── 휴대폰 기능 메뉴: 작은 아이콘 대신 이름·설명이 붙은 큰 버튼으로 모아 보여줍니다. ── */}
      {isNarrowScreen && showMobileMenu && (
        <>
          <div onClick={() => setShowMobileMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,0.35)" }} />
          <div
            role="dialog"
            aria-label="기능 메뉴"
            className="ggk-body"
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1501,
              background: "white", borderRadius: "20px 20px 0 0",
              padding: "10px 16px calc(16px + env(safe-area-inset-bottom))",
              boxShadow: "0 -8px 30px rgba(0,0,0,0.15)",
              fontFamily: "'Noto Sans KR', sans-serif",
              transform: `translateY(${menuDragY}px)`,
              transition: menuDragRef.current ? "none" : "transform 0.2s ease",
            }}
          >
            {/* 손잡이: 아래로 끌어내리면 메뉴가 닫혀요 */}
            <div
              onPointerDown={onMenuPointerDown}
              onPointerMove={onMenuPointerMove}
              onPointerUp={onMenuPointerUp}
              onPointerCancel={() => { menuDragRef.current = null; setMenuDragY(0); }}
              aria-label="아래로 끌어서 메뉴 닫기"
              style={{ margin: "-10px -16px 4px", padding: "10px 0 12px", touchAction: "none", cursor: "grab" }}
            >
              <div style={{ width: 40, height: 5, borderRadius: 3, background: "#d9dce1", margin: "0 auto" }} />
            </div>
            {([
              { key: "recent", label: "새로 생긴 곳", desc: "새로 등록된 장소를 모아 봐요", Icon: MapPinPlus, color: "#3F5230", bg: "#EEF3E8",
                run: () => { setShowRecentPanel(true); setShowRecommendPanel(false); setShowListPanelMobile(false); setShowRoutePanel(false); } },
              { key: "recommend", label: "취향 추천", desc: "취향에 맞는 장소를 골라 드려요", Icon: Sparkles, color: "#3F5230", bg: "#EEF3E8",
                run: () => { setShowRecommendPanel(true); setShowRecentPanel(false); setShowListPanelMobile(false); setShowRoutePanel(false); } },
              { key: "route", label: "산책·나들이 코스", desc: "반려견과 걷기 좋은 코스를 짜 드려요", Icon: RouteIcon, color: "#3F5230", bg: "#EEF3E8",
                run: () => { setShowRoutePanel(true); setShowRecentPanel(false); setShowRecommendPanel(false); setShowListPanelMobile(false); } },
              { key: "owner", label: "사장님", desc: "우리 가게를 직접 등록하고 관리해요", Icon: Store, color: "#3F5230", bg: "#EEF3E8",
                run: () => { handleOwnerRegisterClick(); } },
              { key: "jebo", label: "제보하기", desc: "새로운 장소나 바뀐 정보를 알려 주세요", Icon: Pencil, color: "white", bg: "#2F3B28",
                run: () => { router.push("/jebo"); } },
            ] as const).map(({ key, label, desc, Icon, color, bg, run }) => (
              <button
                key={key}
                onClick={() => { setShowMobileMenu(false); run(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 6px", border: "none", background: "none", cursor: "pointer", textAlign: "left",
                  borderBottom: key === "jebo" ? "none" : "1px solid #f2f3f5",
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 11, background: bg, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={18} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#222" }}>{label}</span>
                  <span style={{ fontSize: 11.5, color: "#5c5c5c" }}>{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── 액션 버튼 첫 방문 안내 투어: position:fixed라 트리 안 위치는 상관없습니다. ── */}
      <PageGuide storageKey={MAP_GUIDE_KEY} steps={MAP_GUIDE_STEPS} enabled={demoNoticeChecked && !showDemoNotice} />

      {/* ── 리스트 패널 (검색 중이면 가게명 매칭 결과, 아니면 현재 지도 화면 영역: displayedPlaces 사용)
          좁은 화면에서는 헤더의 "목록" 토글을 켰을 때만 보이고, 폭도 clamp()로 화면 크기에
          비례해서 줄어듭니다(고정 210px이면 좁은 화면에서 지도 대부분을 가려버립니다).
          ⚠ 리디자인(2026.08): 예전엔 헤더 없이 바로 카드 목록만 있었습니다 — 다른 패널
          (신규 장소/추천 장소/AI 코스)은 전부 제목이 있는 헤더 바를 갖고 있어서 상대적으로
          이 패널만 밋밋해 보였습니다. 제목+개수 헤더를 추가하고, 활성 프리미엄 업장이 있으면
          그 위에 고정 노출 섹션을 얹었습니다. */}
      {showListPanel && (
      <div
        data-guide={isNarrowScreen ? undefined : "list-panel"}
        className="ggk-body"
        style={{
          position: "fixed",
          top: panelTop,
          ...(effectiveListPanelSide === "left" ? { left: "14px" } : { right: "14px" }),
          width: isNarrowScreen ? "clamp(170px, 48vw, 220px)" : "240px",
          height: "62vh",
          background: "#FAF8F3",
          border: "1px solid rgba(60,50,30,0.08)",
          borderRadius: "22px",
          overflow: "hidden",
          zIndex: 20,
          boxShadow: "0 18px 44px rgba(40,32,16,0.16), 0 3px 10px rgba(40,32,16,0.06)",
          display: "flex",
          flexDirection: "column",
          ...(isNarrowScreen ? mobileSheetStyle(20) : {}),
}}
      >
        {isNarrowScreen && renderSheetHandle()}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "13px 13px 11px",
            background: "white",
            borderBottom: "1px solid rgba(60,50,30,0.07)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(135deg,#5C7A4A,#7F9B67)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MapPin size={13} color="white" />
            </div>
            <div className="ggk-logo" style={{ fontSize: "13.5px", fontWeight: 800, color: "#1f1a12", letterSpacing: "-0.2px" }}>
              주변 장소
            </div>
            <div style={{ fontSize: "10px", color: "#7a6f5c", fontWeight: 700, flexShrink: 0, background: "#F1ECE1", borderRadius: 999, padding: "2px 7px" }}>
              {displayedPlaces.length.toLocaleString("ko-KR")}곳
            </div>
            {/* 검색어를 어떻게 알아들었는지 보여 줍니다. 예: "우리동네 · HOT" */}
            {intentLabel && (
              <div data-search-intent style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px", fontWeight: 700, color: "#48603A", background: "#EEF3E8", borderRadius: 999, padding: "2px 8px" }}>
                {intentLabel}
              </div>
            )}
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

        {/* 목록 — 맨 위에 "광고"(근처 프리미엄 업장, 최대 3곳)를 일반 장소와 같은 카드로, 이어서 주변 장소.
            ⚠ 예전엔 프리미엄 업장을 목록 위 작은 가로 띠(84px 카드)로만 보여 줘서 눈에 잘 띄지 않았습니다.
            광고 카드는 사진 왼쪽 위에 "광고" 뱃지를 달고, 아래 일반 목록에서는 같은 업장을 빼서 두 번 나오지 않게 합니다.
            pinnedPremiumPlaces는 보고 있는 곳·내 위치 근처(PREMIUM_AREA_KM)만 — 관련 없는 지역 광고는 띄우지 않습니다. */}
        {(() => {
          const pinnedIds = new Set(pinnedPremiumPlaces.map((p) => String(p.id)));
          const listPlaces = displayedPlaces.filter((p) => (p as any).__isPark === true || !pinnedIds.has(String(p.id)));
          const renderCard = (place: any, ad: boolean) => {
            // ⚠ 공원 토글이 켜져 있으면 displayedPlaces에 공원이 __isPark 플래그를 달고
            // 섞여 들어옵니다. 공원은 image_url/pet_zone 등 장소 전용 필드가 없어서
            // 카드 내용과 클릭 동작(장소 상세 대신 지도 위 공원 마커와 동일한 공원
            // 정보 카드)을 분기합니다.
            const isPark = place.__isPark === true;
            const isSelected = isPark ? selectedPark?.id === place.id : selectedPlace?.id === place.id;
            const isAd = !isPark && (ad || isPlacePremiumNow(place));
            // 광고(프리미엄 이용 중) 카드에는 TOP·NEW·HOT을 달지 않습니다 — 광고가 끝나면 다시 붙습니다
            const badge = isAd ? null : getCardBadge(place, isPark);
            return (
              <div
                key={`${ad ? "ad" : isPark ? "park" : "place"}-${place.id}`}
                className="ggk-list-card"
                onClick={() => {
                  const lat = parseFloat(place.lat);
                  const lng = parseFloat(place.lng);
                  if (isPark) {
                    // 지도 위 공원 마커를 눌렀을 때(selectParkRef.current)와 동일하게 동작을 통일합니다.
                    openParkPopup(place as unknown as ParkPlace);
                  } else {
                    // 마커를 눌렀을 때(setSelectedPlace)와 똑같이 먼저 미리보기 카드를 띄웁니다 —
                    // 실제 상세 모달 진입은 그 카드의 "자세히 보기" 버튼에서 이루어집니다.
                    openPlacePopup(place);
                  }
                  // 리스트에서 고른 장소/공원이 화면 중심에 오도록 지도도 함께 이동합니다.
                  if (mapRef.current && window.kakao?.maps && !isNaN(lat) && !isNaN(lng)) {
                    mapRef.current.panTo(new window.kakao.maps.LatLng(lat, lng));
                  }
                }}
                style={{
                  marginBottom: "10px",
                  background: "white",
                  borderRadius: "16px",
                  cursor: "pointer",
                  border: isSelected ? "1.5px solid #5C7A4A" : isAd ? "1px solid rgba(212,162,76,0.6)" : "1px solid rgba(60,50,30,0.08)",
                  boxShadow: isSelected ? "0 6px 18px rgba(92,122,74,0.22)" : isAd ? "0 6px 16px rgba(196,148,60,0.16)" : "0 2px 8px rgba(40,32,16,0.05)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "stretch",
                }}
              >
                <div style={{ position: "relative", width: "92px", minHeight: "92px", flexShrink: 0 }}>
                  {isPark ? (
                    <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg,#DCE7CD,#A9C48A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "28px" }}>🌳</span>
                    </div>
                  ) : (
                    // lazy loading + 기본 이미지 fallback
                    <Image
                      src={place.image_url || "/images/default-place.png"}
                      alt={place.name}
                      fill
                      sizes="92px"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/images/default-place.png"; }}
                      style={{ objectFit: "cover" }}
                    />
                  )}
                  {/* 사진 아래쪽을 살짝 어둡게 — 위에 얹는 뱃지가 어떤 사진에서도 잘 보이게 */}
                  <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.12) 100%)" }} />
                  {/* 왼쪽 위: 광고(프리미엄 업장) */}
                  {isAd && (
                    <span title="프리미엄 등록 업장(광고)" style={{
                      position: "absolute", top: "7px", left: "7px", display: "inline-flex", alignItems: "center", gap: 3,
                      padding: "3px 8px", borderRadius: "7px", fontSize: "10px", fontWeight: 800, letterSpacing: "0.3px", lineHeight: 1.3,
                      background: "linear-gradient(135deg,#F3DA9B,#D4A24C)", color: "#4A3405", boxShadow: "0 2px 6px rgba(0,0,0,0.22)",
                    }}>
                      <Crown size={10} />광고
                    </span>
                  )}
                  {/* 오른쪽 위: TOP·NEW·HOT */}
                  {badge && (
                    <span style={{
                      position: "absolute", top: "7px", right: "7px",
                      padding: "2px 8px", borderRadius: "999px",
                      fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.2px",
                      background: "rgba(255,255,255,0.96)", color: badge.color, boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                      lineHeight: 1.4,
                    }}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <div style={{ padding: "9px 10px 10px", flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "12.5px", color: "#1f1a12", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {place.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: "5px", flexWrap: "wrap" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700,
                      color: "#5a5141", background: "#F4F0E7", padding: "2px 7px", borderRadius: "999px",
                    }}>
                      {isPark ? (
                        <>🌳 {place.category}</>
                      ) : (
                        <>
                          {getPlaceEmoji(place)
                            ? <span>{getPlaceEmoji(place)}</span>
                            : <PawPrint size={10} color="#8a7f6a" />}
                          {getPlaceLabel(place)}
                        </>
                      )}
                    </span>
                  </div>
                  {place.address && (
                    <div style={{ fontSize: "10.5px", color: "#655d4f", marginTop: "6px", display: "flex", alignItems: "center", gap: "3px", minWidth: 0 }}>
                      <MapPin size={10} color="#b8ad99" style={{ flexShrink: 0 }} />
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{place.address}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          };
          return (
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            paddingTop: "10px",
            paddingBottom: "6px",
            paddingLeft: "10px",
            paddingRight: "8px",
            scrollbarWidth: "thin",
          }}
        >
          <style>{`
            .ggk-list-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
            @media (hover: hover) { .ggk-list-card:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(40,32,16,0.12) !important; } }
          `}</style>
          {summaryView && (
            <div data-summary-hint style={{ margin: "2px 2px 8px", padding: "8px 10px", borderRadius: 10, background: "#EEF3E8", color: "#48603A", fontSize: 11, fontWeight: 600, lineHeight: 1.5 }}>
              넓게 보는 중이에요. 지도의 숫자를 누르거나 확대하면 그 지역의 장소가 모두 나와요.
            </div>
          )}
          {searchNotice && (
            <div data-search-notice style={{ margin: "2px 2px 8px", padding: "8px 10px", borderRadius: 10, background: "#FFF6DB", color: "#6B4A00", fontSize: 11, fontWeight: 600, lineHeight: 1.5, wordBreak: "keep-all" }}>
              {searchNotice}
            </div>
          )}
          {pinnedPremiumPlaces.map((place) => renderCard(place, true))}
          {pinnedPremiumPlaces.length > 0 && listPlaces.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 2px 10px", fontSize: "10px", fontWeight: 700, color: "#6a6253" }}>
              <span style={{ flex: 1, height: 1, background: "rgba(60,50,30,0.1)" }} />주변 장소<span style={{ flex: 1, height: 1, background: "rgba(60,50,30,0.1)" }} />
            </div>
          )}
          {listPlaces.length === 0 && !summaryView && (
            <div style={{
              textAlign: "center", padding: "30px 10px",
              color: "#707070", fontSize: "11px", lineHeight: 1.8,
              display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
            }}>
              <Search size={22} color="#ddd" />
              <div style={{ whiteSpace: "pre-line" }}>
                {zonePending ? "우리 동네를 확인하는 중…" : intentLabel
                  ? `${intentLabel}\n${zone?.km ? `근방 ${zone.km}km 안에 ` : ""}조건에 맞는 장소가 아직 없어요${searchIntent.badge === "hot" ? "\n(HOT은 최근 30일 동안 많이 본 장소에 붙어요)" : searchIntent.badge === "new" ? `\n(NEW는 등록한 지 ${RECOMMEND_WEIGHTS.NEW_PLACE_WINDOW_DAYS}일 안의 장소에 붙어요)` : ""}${searchIntent.nearMe && !userLocation ? "\n내 위치를 아직 몰라 지금 화면에서 찾았어요" : ""}`
                  : searchQuery ? `"${searchQuery}"\n검색 결과가 없습니다` : "이 화면에 보이는 장소가 없습니다"}
              </div>
            </div>
          )}
          {listPlaces.slice(0, listLimit).map((place) => renderCard(place, false))}
          {/* 목록 끝 감지 — 여기까지 내려오면 카드를 더 그립니다(listLimit 설명 참고) */}
          {listPlaces.length > listLimit && (
            <div ref={listMoreRef} style={{ padding: "14px 0 6px", textAlign: "center", fontSize: 11, color: "#707070" }}>
              더 불러오는 중… ({listLimit} / {listPlaces.length})
            </div>
          )}
          <div style={{ height: "8px" }} />
        </div>
          );
        })()}
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
            ...(isNarrowScreen ? mobileSheetStyle(30) : {}),
}}
        >
        {isNarrowScreen && renderSheetHandle()}
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
              <div style={{ textAlign: "center", padding: "30px 10px", color: "#707070", fontSize: "11px" }}>
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
                    <div style={{ fontSize: "10px", color: "#555", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
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
                        color: "#6e6e6e",
                        marginTop: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {place.address}
                      </div>
                    )}
                  </div>

                  <div style={{ color: "#6b7078", fontSize: "16px", flexShrink: 0, lineHeight: 1 }}>›</div>
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
            ...(isNarrowScreen ? mobileSheetStyle(30) : {}),
}}
        >
        {isNarrowScreen && renderSheetHandle()}
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
            </div>

            {displayRoute && (
              // 친화도·거리·시간을 박스 3개 대신 한 줄로(세로 공간 절약)
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", fontSize: "11px", color: "#3b0764", fontWeight: 700 }}>
                {[
                  { icon: <PawPrint size={11} />, label: "친화도", value: `${displayRoute.avgFriendliness}점` },
                  { icon: <Navigation size={11} />, label: "총 거리", value: `${displayRoute.totalDistanceKm}km` },
                  { icon: <Footprints size={11} />, label: "예상 시간", value: formatEstimatedTime(displayRoute.estimatedMinutes) },
                ].map((stat, i) => (
                  <span key={i} title={stat.label} style={{ display: "inline-flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>
                    <span style={{ color: "#48603A", display: "inline-flex" }}>{stat.icon}</span>
                    {stat.value}
                  </span>
                ))}
              {(() => {
                const activeCount = [routeIncludeVet, routeIncludePharmacy, showNearbyInCourse].filter(Boolean).length;
                return (
                  <button
                    onClick={() => setShowRouteOptions((v) => !v)}
                    aria-expanded={showRouteOptions}
                    title="코스에 동물병원·약국 포함, 주변 장소 표시"
                    className="ggk-body"
                    style={{
                      flexShrink: 0, marginLeft: "auto", padding: "3px 8px", borderRadius: "999px",
                      border: "1px solid rgba(92,122,74,0.35)", fontSize: "10.5px", fontWeight: 700, cursor: "pointer",
                      whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px",
                      background: showRouteOptions ? "#E6EEDD" : "rgba(255,255,255,0.7)", color: "#3F5230",
                    }}
                  >
                    <SlidersHorizontal size={10} />
                    옵션{activeCount > 0 ? ` ${activeCount}` : ""}
                    <ChevronDown size={10} style={{ transform: showRouteOptions ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
                  </button>
                );
              })()}
              </div>
            )}

            <div style={{ display: "flex", gap: "5px", marginTop: "8px", overflowX: "auto", paddingBottom: "2px", scrollbarWidth: "none" }}>
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
                      background: routeTheme === theme ? "#3F5230" : "rgba(255,255,255,0.7)",
                      color: routeTheme === theme ? "white" : "#3F5230",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <ThemeIcon size={10} />
                    {ROUTE_THEME_LABEL[theme]}
                  </button>
                );
              })}
            </div>

            {showRouteOptions && (<>

            {/* 코스에 동물병원·약국 포함 여부 — 켜면 각각 1곳씩 정거장 자리를 차지합니다 */}
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "7px" }}>
              <span style={{ fontSize: "10px", color: "#48603A", fontWeight: 700, marginRight: "1px" }}>코스에 포함</span>
              {([
                { key: "vet", label: "동물병원", Icon: Stethoscope, on: routeIncludeVet, toggle: () => setRouteIncludeVet((v) => !v) },
                { key: "pharmacy", label: "동물약국", Icon: Pill, on: routeIncludePharmacy, toggle: () => setRouteIncludePharmacy((v) => !v) },
              ] as const).map(({ key, label, Icon, on, toggle }) => (
                <button
                  key={key}
                  role="switch"
                  aria-checked={on}
                  onClick={toggle}
                  className="ggk-body"
                  style={{
                    display: "flex", alignItems: "center", gap: "3px",
                    padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, cursor: "pointer",
                    border: on ? "1px solid #3F5230" : "1px dashed rgba(92,122,74,0.4)",
                    background: on ? "#E6EEDD" : "rgba(255,255,255,0.5)",
                    color: on ? "#3F5230" : "#5f6672",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Icon size={10} />
                  {label} {on ? "ON" : "OFF"}
                </button>
              ))}
            </div>

            {/* 코스 집중 모드 해제 — 켜면 코스와 무관한 장소·공원 마커도 지도에 함께 보여줍니다 */}
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "5px" }}>
              <span style={{ fontSize: "10px", color: "#48603A", fontWeight: 700, marginRight: "1px" }}>지도 표시</span>
              <button
                role="switch"
                aria-checked={showNearbyInCourse}
                onClick={() => setShowNearbyInCourse((v) => !v)}
                className="ggk-body"
                style={{
                  display: "flex", alignItems: "center", gap: "3px",
                  padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, cursor: "pointer",
                  border: showNearbyInCourse ? "1px solid #3F5230" : "1px dashed rgba(92,122,74,0.4)",
                  background: showNearbyInCourse ? "#E6EEDD" : "rgba(255,255,255,0.5)",
                  color: showNearbyInCourse ? "#3F5230" : "#5f6672",
                  transition: "all 0.15s ease",
                }}
              >
                <MapPin size={10} />
                주변 장소 보기 {showNearbyInCourse ? "ON" : "OFF"}
              </button>
            </div>
            </>)}

            {displayRoute && (
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button
                title={pinnedStopIds.size > 0 ? "고정한 곳 빼고 다른 코스 보기" : "이 조합 말고 다른 코스 보기"}
                onClick={() => {
                  // 지금 보이는 코스의 정거장들을 제외 목록에 더해서 다른 조합이
                  // 나오도록 만듭니다. 대안이 바닥나면 useMemo 쪽에서 자동으로
                  // 처음 추천으로 되돌립니다.
                  trackEvent("course_regenerate", {
                    authUserId: session?.user?.id ?? null,
                    variant: activeRecVariant,
                    meta: courseMeta(displayRoute),
                  });
                  setAppliedPinnedIds(new Set(pinnedStopIds));
                  setRouteExcludedIds((prev) => {
                    const next = new Set(prev);
                    // 핀으로 고정한 정거장은 빼지 않고 나머지만 바꿉니다.
                    displayRoute.stops.forEach((s) => { if (!pinnedStopIds.has(s.place.id)) next.add(s.place.id); });
                    return next;
                  });
                }}
                className="ggk-body"
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: "10px",
                  border: "1px dashed rgba(92,122,74,0.4)",
                  background: "rgba(255,255,255,0.5)",
                  color: "#3F5230",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <RefreshCw size={11} />{pinnedStopIds.size > 0 ? "고정 빼고 다른 코스" : "다른 코스 보기"}
              </button>
              {/* 지도를 옮기거나 확대해 코스가 화면에서 벗어났을 때, 전체 경로가 한 화면에 보이게 다시 맞춥니다 */}
              <button
                onClick={() => fitCourseRef.current()}
                title="지도에서 전체 경로 확인하기 — 지도를 움직였다면 눌러서 추천 경로 전체를 다시 한 화면에 보여줘요"
                className="ggk-body"
                style={{
                  flex: 1, padding: "7px 0", borderRadius: "10px",
                  border: "1px solid rgba(92,122,74,0.3)", background: "white", color: "#3F5230",
                  fontSize: "10.5px", fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                }}
              >
                <Maximize2 size={11} />전체 경로 보기
              </button>
              </div>
            )}
            {displayRoute && pinnedStopIds.size > 0 && (
              <div style={{ marginTop: "6px", fontSize: "10px", color: "#48603A", textAlign: "center" }}>
                📌 고정한 장소 {pinnedStopIds.size}곳은 다른 코스를 봐도 그대로 유지돼요
              </div>
            )}
            {displayRoute && routeAlternativesExhausted && (
              <div style={{ marginTop: "6px", fontSize: "10px", color: "#48603A", textAlign: "center" }}>
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
              <div style={{ textAlign: "center", padding: "30px 10px", color: "#707070", fontSize: "11px" }}>
                {wideLoading
                  ? <LogoLoader label="주변 장소를 모으는 중…" />
                  : !(userLocation || searchCenter)
                  ? "위치 정보를 확인하는 중입니다"
                  : routeTheme === "attraction"
                    ? "근처 5km 안에 반려동물과 갈 수 있는 관광지가 없어 관광 코스를 만들 수 없어요"
                    : "이 근처에서 코스를 만들 만큼 장소가 충분하지 않습니다"}
              </div>
            )}
            {displayRoute && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 3px 10px 3px", color: "#5C7A4A", fontSize: "10.5px", fontWeight: 700 }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#2563eb", border: "2px solid white", boxShadow: "0 0 0 1px rgba(37,99,235,0.4)", flexShrink: 0 }} />
                출발: {routeOriginLabel}
                <span style={{ color: "#707070", fontWeight: 500 }}>
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
                    background: "#F7FAF3",
                    transition: "background 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#f3ebff";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#F7FAF3";
                  }}
                >
                  <div
                    style={{
                      width: "24px", height: "24px", borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg,#7F9B67,#5C7A4A)", color: "white",
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
                      {stop.highlight && (
                        <span
                          title={ROUTE_HIGHLIGHT_BADGE[stop.highlight].title}
                          style={{
                            flexShrink: 0, padding: "1px 6px", borderRadius: 999, fontSize: "9px", fontWeight: 800,
                            color: "white", background: ROUTE_HIGHLIGHT_BADGE[stop.highlight].color,
                          }}
                        >
                          {ROUTE_HIGHLIGHT_BADGE[stop.highlight].label}
                        </span>
                      )}
                      {/* 핀 고정 — 켜두면 "다른 코스 보기"를 눌러도 이 장소는 코스에 남습니다.
                          카드 클릭(미리보기)과 겹치지 않게 전파를 막습니다. */}
                      {(() => {
                        const pinned = pinnedStopIds.has(stop.place.id);
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinnedStop(stop.place.id);
                            }}
                            aria-pressed={pinned}
                            aria-label={pinned ? `${stop.place.name} 고정 해제` : `${stop.place.name} 코스에 고정`}
                            title={pinned ? "고정 해제" : "이 장소를 코스에 고정 (다른 코스를 봐도 유지)"}
                            style={{
                              marginLeft: "auto", flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                              border: pinned ? "1px solid #5C7A4A" : "1px solid rgba(0,0,0,0.1)",
                              background: pinned ? "#5C7A4A" : "white",
                              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                            }}
                          >
                            <Pin size={12} color={pinned ? "white" : "#9ca3af"} fill={pinned ? "white" : "none"} />
                          </button>
                        );
                      })()}
                    </div>
                    <div style={{ fontSize: "9.5px", color: "#7c3aed", fontWeight: 700, marginTop: "2px" }}>
                      {stop.tags.join(" · ")}
                      <span style={{ color: "#c4b5fd" }}> · </span>
                      <span style={{ color: "#3F5230" }}>반려견 친화도 {stop.friendliness}점</span>
                    </div>
                    <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "1px" }}>
                      {stop.bullets.map((b, bi) => (
                        <div key={bi} style={{ fontSize: "10px", color: "#666", display: "flex", alignItems: "center", gap: "3px" }}>
                          <span style={{ color: "#7c3aed", fontWeight: 800 }}>✓</span>{b}
                        </div>
                      ))}
                    </div>
                    {/* 이 정거장만 바로 찾아가기 — 카드 클릭(미리보기)과 분리되도록 전파를 막습니다 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px" }}>
                      <span style={{ fontSize: "9.5px", color: "#666", fontWeight: 600, marginRight: "1px" }}>여기로 길찾기</span>
                      {(["kakao", "naver"] as const).map((app) => (
                        <button
                          key={app}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStopDirections(displayRoute, idx, app);
                          }}
                          className="ggk-body"
                          aria-label={`${stop.place.name} ${app === "kakao" ? "카카오맵" : "네이버지도"} 길찾기`}
                          style={{
                            padding: "2px 7px", borderRadius: "999px", fontSize: "9.5px", fontWeight: 700, cursor: "pointer",
                            border: app === "kakao" ? "1px solid rgba(92,122,74,0.35)" : "1px solid rgba(3,199,90,0.45)",
                            background: "white", color: app === "kakao" ? "#48603A" : "#03A24A",
                          }}
                        >
                          {app === "kakao" ? "카카오맵" : "네이버"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {stop.distanceToNextKm != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 0 5px 22px", color: "#6e6e6e", fontSize: "10px" }}>
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
              {(() => {
                const mine = courseSave && courseSave.key === courseKey(displayRoute) ? courseSave : null;
                const saved = mine?.state === "saved" || mine?.state === "canceling";
                return (
                  <>
                    {saved ? (
                      // 저장된 뒤: 잘못 눌렀을 때를 위한 "저장 취소"와, 마이페이지로 가는 "확인하기"를 나란히 둡니다.
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", fontSize: "11.5px", fontWeight: 700, color: "#15803d", marginBottom: "6px" }}>
                          <Bookmark size={12} fill="#15803d" />이 코스를 저장했어요
                        </div>
                        <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                          <button
                            onClick={handleCancelSaveCourse}
                            disabled={mine?.state === "canceling"}
                            className="ggk-body"
                            style={{
                              flex: 1, padding: "9px 0", borderRadius: "12px", border: "1px solid #e2e4e8", background: "white", color: "#666",
                              fontWeight: 700, fontSize: "11.5px", cursor: mine?.state === "canceling" ? "default" : "pointer", opacity: mine?.state === "canceling" ? 0.6 : 1,
                            }}
                          >
                            {mine?.state === "canceling" ? "취소하는 중…" : "저장 취소"}
                          </button>
                          <button
                            onClick={() => router.push("/mypage?tab=courses")}
                            className="ggk-body"
                            style={{
                              flex: 1, padding: "9px 0", borderRadius: "12px", border: "1px solid #86efac", background: "#f0fdf4", color: "#15803d",
                              fontWeight: 700, fontSize: "11.5px", cursor: "pointer",
                            }}
                          >
                            마이페이지에서 확인하기
                          </button>
                        </div>
                        {mine?.message && (
                          <div role="status" style={{ fontSize: "10.5px", color: "#b45309", textAlign: "center", marginBottom: "6px", lineHeight: 1.5 }}>{mine.message}</div>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleSaveCourse(displayRoute)}
                        disabled={mine?.state === "saving"}
                        className="ggk-body"
                        style={{
                          width: "100%", padding: "9px 0", marginBottom: "6px", borderRadius: "12px",
                          border: "1px dashed rgba(92,122,74,0.45)",
                          background: "rgba(255,255,255,0.7)", color: "#3F5230",
                          fontWeight: 700, fontSize: "11.5px", cursor: mine?.state === "saving" ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                        }}
                      >
                        <Bookmark size={12} />
                        {mine?.state === "saving" ? "저장 중…" : session?.user ? "이 코스 저장" : "로그인하고 이 코스 저장"}
                      </button>
                    )}
                    {mine?.state === "error" && (
                      <div role="status" style={{ fontSize: "10.5px", color: "#b45309", textAlign: "center", marginBottom: "6px", lineHeight: 1.5 }}>{mine.message}</div>
                    )}
                  </>
                );
              })()}
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => handleRouteDirections(displayRoute, "kakao")}
                  className="ggk-body"
                  style={{
                    flex: 1, padding: "11px 0", borderRadius: "12px", border: "none",
                    background: "linear-gradient(135deg,#5C7A4A,#3F5230)", color: "white",
                    fontWeight: 700, fontSize: "12px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                    boxShadow: "0 3px 10px rgba(92,122,74,0.3)",
                  }}
                >
                  <Navigation size={12} />카카오맵
                </button>
                <button
                  onClick={() => handleRouteDirections(displayRoute, "naver")}
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
              <div style={{ fontSize: "9px", color: "#707070", textAlign: "center", marginTop: "6px", lineHeight: 1.4 }}>
                ※ 추천 코스는 AI가 반려견 친화도, 거리, 이용 후기 등을 기반으로 생성했어요.
                <br />※ 네이버지도를 누를 시 PC에서는 네이버 지도 웹으로, 휴대폰에서는 네이버지도 앱으로 열려요.
              </div>
            </div>
          )}
        </div>
      )}

      {showDemoNotice && (
        <WelcomeIntro onClose={() => setShowDemoNotice(false)} />
      )}

      {/* ── 공유 모달 */}
      {showShareModal && (
        <>
          <div
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
                <div style={{ fontSize: "11px", color: "#5c5c5c", marginTop: "1px" }}>클립보드에 링크를 복사합니다</div>
              </div>
            </div>
            <div onClick={handleSnsShare} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px", borderRadius: "13px", cursor: "pointer", marginBottom: "7px", border: "1px solid #eee" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Upload size={16} color="#444" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>SNS로 공유하기</div>
                <div style={{ fontSize: "11px", color: "#5c5c5c", marginTop: "1px" }}>인스타그램, X, Thread 등으로 공유합니다</div>
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