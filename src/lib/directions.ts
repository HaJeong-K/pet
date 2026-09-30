// src/lib/directions.ts
//
// 외부 지도 앱(카카오맵·네이버지도)으로 도보 길찾기를 넘기는 URL 생성/실행 유틸.
//
// ── 카카오맵 ──
// 공식 "길찾기 바로가기" 웹 URL(https://apis.map.kakao.com/web/guide/#routeurl)을 씁니다.
//   /link/by/walk/이름,위도,경도/이름,위도,경도/...  (출발 + 경유지 최대 5 + 도착)
// PC·모바일웹을 카카오가 알아서 분기해주고 앱 설치가 필요 없어서 어디서나 열립니다.
// ⚠ 예전에 쓰던 m.map.kakao.com/scheme/route?sp=..는 문서에 없는 주소라 장소 이름이
//    빠진 채 열렸습니다. 또 목적지만 넘기는 /link/to/는 이동수단이 자동차로 고정되고,
//    /link/by/walk/에 한 점만 넘기면 그 점을 "출발지"로 해석하므로 도보 길찾기에는
//    항상 출발지를 함께 넘깁니다.
//
// ── 네이버지도 ──
// 휴대폰: 공식 URL Scheme(nmap://route/walk, https://guide.ncloud-docs.com/docs/maps-url-scheme).
// 문서 권장대로 Android는 intent:// URL(앱이 없으면 Play 스토어로 자동 이동), iOS는
// 스킴 호출 후 타이머로 앱이 안 열렸는지 확인해 App Store 설치를 안내합니다.
// 출발지(slat/slng)는 넘기지 않습니다 — 생략하면 네이버 앱이 기기의 현재 위치를 출발지로
// 쓰는데, 이게 우리가 캐시해둔 위치보다 항상 정확합니다.
// PC: 네이버는 웹 길찾기 URL을 공식 문서로 공개하지 않아서, 네이버 지도 웹이 실제로 쓰는
//   map.naver.com/p/directions/{출발}/{도착}/{경유지|-}/walk  (좌표는 EPSG:3857 미터 좌표)
// 형식을 씁니다. 2026-09-30 크롬에서 출발·도착·경유지 1곳까지 정상 동작을 확인했습니다.
// ⚠ 비공식 형식이라 네이버가 바꾸면 동작하지 않을 수 있습니다.

export type DirectionPoint = { lat: number; lng: number; name: string };
export type Platform = "android" | "ios" | "desktop";

const KAKAO_MAX_VIA = 5;
const NAVER_MAX_VIA = 5;
const NAVER_ANDROID_PACKAGE = "com.nhn.android.nmap";
const NAVER_APP_STORE_URL = "https://itunes.apple.com/app/id311867728?mt=8";
const APP_OPEN_CHECK_MS = 1500;

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/Android/i.test(userAgent)) return "android";
  // iPadOS 13+는 데스크톱 Safari UA(Macintosh)를 쓰므로 터치 지원 여부로 구분합니다.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return "desktop";
}

function currentPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** 카카오 경로 URL은 쉼표·슬래시를 구분자로 쓰므로 이름에서 제거합니다. */
function kakaoName(name: string): string {
  return name.replace(/[,/]/g, " ").replace(/\s+/g, " ").trim() || "지점";
}

/** 경유지 상한을 넘으면 출발·도착은 유지하고 앞쪽 경유지만 남깁니다. */
function clampVia<T>(points: T[], maxVia: number): T[] {
  if (points.length <= maxVia + 2) return points;
  return [points[0], ...points.slice(1, 1 + maxVia), points[points.length - 1]];
}

/** 카카오맵 도보 길찾기 URL. points = [출발, ...경유지, 도착] (2개 이상) */
export function kakaoWalkUrl(points: DirectionPoint[]): string {
  const pts = clampVia(points, KAKAO_MAX_VIA);
  const path = pts
    .map((p) => `${encodeURIComponent(kakaoName(p.name))},${p.lat},${p.lng}`)
    .join("/");
  return `https://map.kakao.com/link/by/walk/${path}`;
}

/** 네이버 도보 길찾기 쿼리. 공백을 "+"가 아닌 %20으로 인코딩합니다(앱에 "+"가 그대로 보이는 문제 방지). */
function naverWalkQuery(destination: DirectionPoint, via: DirectionPoint[], appname: string): string {
  const params: [string, string][] = [
    ["dlat", String(destination.lat)],
    ["dlng", String(destination.lng)],
    ["dname", destination.name],
  ];
  via.slice(0, NAVER_MAX_VIA).forEach((p, i) => {
    params.push([`v${i + 1}lat`, String(p.lat)], [`v${i + 1}lng`, String(p.lng)], [`v${i + 1}name`, p.name]);
  });
  params.push(["appname", appname]);
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

export function naverWalkSchemeUrl(destination: DirectionPoint, via: DirectionPoint[], appname: string): string {
  return `nmap://route/walk?${naverWalkQuery(destination, via, appname)}`;
}

export function naverWalkIntentUrl(destination: DirectionPoint, via: DirectionPoint[], appname: string): string {
  return (
    `intent://route/walk?${naverWalkQuery(destination, via, appname)}` +
    `#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=${NAVER_ANDROID_PACKAGE};end`
  );
}

/** 위경도(WGS84) → 네이버 지도 웹이 쓰는 EPSG:3857 미터 좌표 */
export function toNaverWebXY(lat: number, lng: number): { x: string; y: string } {
  const R = 20037508.34;
  const x = (lng * R) / 180;
  const y = ((Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * R) / 180;
  return { x: x.toFixed(4), y: y.toFixed(4) };
}

/** 네이버 웹 경로의 한 지점: "x,y,이름,," (이름의 쉼표·슬래시는 구분자와 겹쳐서 제거) */
function naverWebPoint(p: DirectionPoint): string {
  const { x, y } = toNaverWebXY(p.lat, p.lng);
  return `${x},${y},${encodeURIComponent(kakaoName(p.name))},,`;
}

/**
 * PC용 네이버 지도 웹 도보 길찾기 URL. 경유지가 없으면 "-", 여러 곳이면 ":"로 잇습니다.
 * @param origin 출발지. null이면 "-"(네이버가 출발지를 비워 둠 — 사용자가 직접 입력)
 */
export function naverWebWalkUrl(origin: DirectionPoint | null, destination: DirectionPoint, via: DirectionPoint[] = []): string {
  const start = origin ? naverWebPoint(origin) : "-";
  const waypoints = via.length > 0 ? via.slice(0, NAVER_MAX_VIA).map(naverWebPoint).join(":") : "-";
  return `https://map.naver.com/p/directions/${start}/${naverWebPoint(destination)}/${waypoints}/walk`;
}

/**
 * 외부 URL을 새 탭에서만 엽니다 — 현재 탭(우리 사이트)은 절대 이동시키지 않습니다.
 * ⚠ window.open(url, "_blank", "noopener")는 명세상 새 탭을 열고도 null을 돌려줘서, 예전
 * 코드는 이를 "팝업 차단"으로 오해해 현재 탭까지 같은 주소로 보냈습니다. 링크 클릭 방식은
 * 사용자 클릭 직후라 팝업 차단에 걸리지 않고, rel=noopener로 새 탭이 우리 페이지를 조작하지
 * 못하게 막습니다.
 */
function openInNewTab(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 카카오맵 도보 길찾기를 새 탭으로 엽니다. */
export function openKakaoWalk(points: DirectionPoint[]): void {
  openInNewTab(kakaoWalkUrl(points));
}

/** 출발지를 모를 때 쓰는 카카오 목적지 URL(이동수단은 카카오 기본값 — 도보는 사용자가 선택) */
export function kakaoToUrl(destination: DirectionPoint): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(kakaoName(destination.name))},${destination.lat},${destination.lng}`;
}

/**
 * 현재 위치를 출발지로 카카오맵 도보 길찾기를 엽니다(장소 상세처럼 코스 출발지가 없는 곳용).
 * 위치를 못 구하면(권한 거부·시간 초과) 목적지만 지정한 길찾기로 대신 엽니다.
 * 위치 조회(비동기)가 끝난 뒤에 새 탭을 열면 브라우저가 팝업으로 막을 수 있어서, 클릭 직후
 * 빈 탭을 먼저 열어두고 위치가 정해지면 그 탭의 주소만 바꿉니다(현재 탭은 그대로).
 */
/**
 * 현재 위치를 구한 뒤 그 위치로 만든 URL을 새 탭에 엽니다(위치를 못 구하면 null로 호출).
 * 위치 조회(비동기)가 끝난 뒤에 새 탭을 열면 브라우저가 팝업으로 막을 수 있어서, 클릭 직후
 * 빈 탭을 먼저 열어두고 위치가 정해지면 그 탭의 주소만 바꿉니다(현재 탭은 그대로).
 */
function openFromHere(buildUrl: (here: DirectionPoint | null) => string): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    openInNewTab(buildUrl(null));
    return;
  }
  // features 인자 없이 열어야 탭 핸들을 돌려받습니다. opener는 바로 끊어 새 탭이 우리 페이지에 접근 못 하게 합니다.
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  const openUrl = (url: string) => {
    if (tab && !tab.closed) tab.location.href = url;
    else openInNewTab(url);
  };
  navigator.geolocation.getCurrentPosition(
    (pos) => openUrl(buildUrl({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: "현재 위치" })),
    () => openUrl(buildUrl(null)),
    // 출발지가 어긋나면 길찾기 전체가 틀어지므로 정확도를 우선하되, 1분 이내 위치는 재사용해 빨리 엽니다.
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 60 * 1000 }
  );
}

/** 현재 위치를 출발지로 카카오맵 도보 길찾기를 엽니다. 위치를 못 구하면 목적지만 지정해 엽니다. */
export function openKakaoWalkFromHere(destination: DirectionPoint): void {
  openFromHere((here) => (here ? kakaoWalkUrl([here, destination]) : kakaoToUrl(destination)));
}

/**
 * 네이버지도로 도보 길찾기를 엽니다. 휴대폰은 네이버지도 앱, PC는 네이버 지도 웹(새 탭).
 * @param origin PC에서 쓸 출발지(코스 출발지 등). 없으면 현재 위치를 구해 쓰고, 그것도 안 되면
 *               출발지를 비워 둔 채 엽니다. 휴대폰 앱은 항상 기기의 현재 위치를 출발지로 씁니다.
 */
export function openNaverWalk(destination: DirectionPoint, via: DirectionPoint[] = [], origin?: DirectionPoint): void {
  const platform = currentPlatform();
  if (platform === "desktop") {
    if (origin) openInNewTab(naverWebWalkUrl(origin, destination, via));
    else openFromHere((here) => naverWebWalkUrl(here, destination, via));
    return;
  }

  const appname = window.location.origin;
  if (platform === "android") {
    window.location.href = naverWalkIntentUrl(destination, via, appname);
    return;
  }

  // iOS: 앱이 열리면 페이지가 백그라운드로 가므로, 일정 시간 뒤에도 화면이 그대로면
  // 앱이 없는 것으로 보고 설치를 안내합니다.
  let left = false;
  const markLeft = () => { left = true; };
  document.addEventListener("visibilitychange", markLeft, { once: true });
  window.addEventListener("pagehide", markLeft, { once: true });
  window.location.href = naverWalkSchemeUrl(destination, via, appname);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", markLeft);
    window.removeEventListener("pagehide", markLeft);
    if (!left && document.visibilityState === "visible") {
      if (window.confirm("네이버지도 앱이 설치되어 있지 않은 것 같아요.\nApp Store에서 설치할까요?")) {
        openInNewTab(NAVER_APP_STORE_URL);
      }
    }
  }, APP_OPEN_CHECK_MS);
}
