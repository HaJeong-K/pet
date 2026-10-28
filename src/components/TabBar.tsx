"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Map, Users, ShieldCheck, User, LogIn, PawPrint, Store, ClipboardList, Package, Crown, ShoppingBag, BedDouble, CalendarDays } from "lucide-react";
import { getOwnerTab, getOwnerTabOnServer, setOwnerTab, subscribeOwnerTab } from "@/lib/ownerTab";
import { supabase } from "@/lib/supabase";
import { playBark } from "@/lib/ownerAlertSound";
import { isMissingOwnerKind, ownerKindOf } from "@/lib/ownerKind";

/** 아래 탭에 필요한 내 계정 정보(사장님 유형 칸이 아직 없으면 유형 없이 — 가게로 봅니다) */
async function tabProfile(uid: string) {
  const query = (columns: string) => supabase.from("users").select(columns).eq("auth_user_id", uid).single<{ is_admin: boolean | null; owner_status: string | null; owner_place_id: number | null; owner_kind?: string | null }>();
  const first = await query("is_admin, owner_status, owner_place_id, owner_kind");
  return isMissingOwnerKind(first.error) ? (await query("is_admin, owner_status, owner_place_id")).data : first.data;
}

export default function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  // 사장님 센터에서 지금 보는 메뉴(아래의 화면 숨김 판단보다 먼저 불러야 합니다 — 훅은 항상 같은 순서로)
  const ownerTab = useSyncExternalStore(subscribeOwnerTab, getOwnerTab, getOwnerTabOnServer);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  // 숙소 사장님이면 사장님 센터 아래 탭이 "객실" 중심으로 바뀝니다(src/lib/ownerKind.ts)
  const [isLodgingOwner, setIsLodgingOwner] = useState(false);

  useEffect(() => {
    const checkLogin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
      if (session?.user) {
        const profile = await tabProfile(session.user.id);
        setIsAdmin(!!profile?.is_admin);
        setIsOwner(profile?.owner_status === "verified" && profile?.owner_place_id != null);
        setIsLodgingOwner(ownerKindOf(profile?.owner_kind) === "lodging");
      }
    };
    checkLogin();
    // ⚠ 이 콜백 안에서 supabase 호출을 await하면 안 됩니다. 콜백은 인증 잠금을 쥔 채 실행돼서,
    // 토큰이 갱신되는 순간(로그인 약 1시간 뒤·탭 복귀 시) 교착에 빠지고 그 뒤 모든 supabase
    // 호출이 영영 멈춥니다(마이페이지 흰 화면의 원인). 조회는 setTimeout으로 잠금이 풀린 뒤에 합니다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      if (session?.user) {
        const uid = session.user.id;
        setTimeout(async () => {
          const profile = await tabProfile(uid);
          setIsAdmin(!!profile?.is_admin);
          setIsOwner(profile?.owner_status === "verified" && profile?.owner_place_id != null);
          setIsLodgingOwner(ownerKindOf(profile?.owner_kind) === "lodging");
        }, 0);
      } else {
        setIsAdmin(false);
        setIsOwner(false);
        setIsLodgingOwner(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── 사장님 알림 숫자: 카카오톡처럼 빨간 원에 숫자로 보여 줍니다(/api/owner/alerts) ──
  //   "예약" 탭: 확인을 기다리는 예약 + 의견을 기다리는 숙박 문제 접수
  //   "사장님" 탭: 위 + 최근 14일 동안 사장님 답글이 없는 후기(사장님 센터의 "후기·답글"에도 숫자 — ggk-owner-alerts)
  // 1분마다, 그리고 다른 창에서 돌아올 때 다시 셉니다. 사장님 센터의 예약 화면에서 처리하면 그 화면이 바로 고쳐 줍니다(ggk-owner-waiting).
  const [waitingReservations, setWaitingReservations] = useState(0);
  const [unansweredReviews, setUnansweredReviews] = useState(0);
  const lastWaitingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/owner/alerts", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (cancelled || !res.ok) return;
        const waiting = (Number(json.reservations) || 0) + (Number(json.issues) || 0);
        const reviews = Number(json.reviews) || 0;
        setUnansweredReviews(reviews);
        window.dispatchEvent(new CustomEvent("ggk-owner-alerts", { detail: { reviews } }));
        // 기다리는 예약이 늘었으면 "멍멍!"(처음 셀 때는 울리지 않습니다 — 화면을 열 때마다 짖지 않게)
        if (lastWaitingRef.current != null && waiting > lastWaitingRef.current) playBark();
        lastWaitingRef.current = waiting;
        setWaitingReservations(waiting);
      } catch { /* 알림 숫자를 못 받아도 화면은 그대로 */ }
    };
    // 화면을 열어 둔 채 새 예약 알림이 도착하면(서비스 워커가 알려 줌) 바로 다시 셉니다 → 숫자가 늘고 소리가 납니다.
    const onPush = (e: MessageEvent) => { if (e.data?.type === "ggk-push" && /^ggk-(order|stay)/.test(String(e.data.tag || ""))) check(); };
    navigator.serviceWorker?.addEventListener("message", onPush);
    const onLocal = (e: Event) => { const waiting = Number((e as CustomEvent<number>).detail) || 0; lastWaitingRef.current = waiting; setWaitingReservations(waiting); };
    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("ggk-owner-waiting", onLocal);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("ggk-owner-waiting", onLocal); navigator.serviceWorker?.removeEventListener("message", onPush); };
  }, [isOwner, isLodgingOwner]);

  // ⚠ 속도: 탭은 버튼(router.push)이라 화면 코드를 미리 받아 두지 않았습니다 — 누른 뒤에야 받기 시작해 반 박자 늦었습니다.
  // 화면이 한가해지면 탭 화면들을 미리 받아 둬서, 누르는 순간 바로 바뀌게 합니다.
  useEffect(() => {
    const routes = ["/", "/stay", "/community", "/shelter-notices", "/shop", isLoggedIn ? "/mypage" : "/login", ...(isAdmin ? ["/admin"] : []), ...(isOwner || isAdmin ? ["/owner"] : [])];
    const warm = () => { for (const route of routes) { try { router.prefetch(route); } catch { /* 미리 받기 실패는 무시 */ } } };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const timer = window.setTimeout(() => (idle ? idle(warm, { timeout: 3000 }) : warm()), 3000);
    return () => window.clearTimeout(timer);
  }, [router, isLoggedIn, isAdmin, isOwner]);

  // ── 탭바가 실제로 가리는 높이를 재서 --ggk-tabbar-space에 넣습니다 ──
  // 스크롤 화면들은 이 값만큼 아래 여백을 둡니다(globals.css). 숫자를 고정하지 않고 재는 이유:
  // 폰 화면 크기, 글자 크기 설정, 탭 개수, 아래 제스처 바 유무에 따라 탭바가 차지하는 높이가 달라서입니다.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const bar = barRef.current;
      // 탭바가 없는 화면(로그인·장소 상세 등)은 기본 여백만 둡니다.
      if (!bar) { root.style.setProperty("--ggk-tabbar-space", "24px"); return; }
      const rect = bar.getBoundingClientRect();
      if (rect.height === 0) return;
      // 화면 아래 끝에서 탭바 윗변까지 = 탭바가 가리는 높이. 여기에 숨 쉴 틈 16px.
      const covered = Math.max(0, window.innerHeight - rect.top);
      root.style.setProperty("--ggk-tabbar-space", `${Math.ceil(covered) + 16}px`);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" && barRef.current ? new ResizeObserver(measure) : null;
    if (observer && barRef.current) observer.observe(barRef.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [pathname, isLoggedIn, isAdmin, isOwner]);

  const hideTabBar =
    pathname.includes("/login") ||
    pathname.includes("/signup") ||
    pathname.includes("/place/") ||
    pathname === "/report" ||
    pathname === "/jebo";  

  if (hideTabBar) return null;

  const getActiveTab = () => {
    if (pathname === "/" || pathname === "") return "map";
    if (pathname.startsWith("/community")) return "community";
    if (pathname.startsWith("/shelter-notices")) return "adopt";
    if (pathname.startsWith("/shop")) return "shop";
    if (pathname.startsWith("/stay")) return "stay";
    if (pathname.startsWith("/admin")) return "admin";
    if (pathname.startsWith("/owner")) return isOwner || isAdmin ? "owner" : "mypage";
    if (pathname.startsWith("/mypage")) return "mypage";
    if (pathname.startsWith("/login")) return "login";
    return "map";
  };

  // ── 사장님 센터(/owner) 안에서는 손님용 탭 대신 사장님용 탭을 보여 줍니다 ──
  // 대시보드·예약·상품·광고는 바로 누를 수 있게 하고, 마지막 칸으로 손님 화면(지도)에 돌아갑니다.
  const inOwnerCenter = pathname.startsWith("/owner") && (isOwner || isAdmin);

  const activeTab = inOwnerCenter ? `owner-${ownerTab}` : getActiveTab();

  const tabs = inOwnerCenter && isOwner && isLodgingOwner ? [
    { key: "owner-dashboard",    label: "홈",       icon: Store,         onClick: () => setOwnerTab("dashboard"),    isReport: false },
    { key: "owner-stays",        label: "예약",     icon: CalendarDays,  onClick: () => setOwnerTab("stays"),        isReport: false, badge: waitingReservations },
    { key: "owner-lodging",      label: "객실",     icon: BedDouble,     onClick: () => setOwnerTab("lodging"),      isReport: false },
    { key: "owner-ads",          label: "광고",     icon: Crown,         onClick: () => setOwnerTab("ads"),          isReport: false },
    { key: "owner-exit",         label: "손님 화면", icon: Map,           onClick: () => router.push("/"),            isReport: false },
  ] : inOwnerCenter ? [
    { key: "owner-dashboard",    label: "홈",       icon: Store,         onClick: () => setOwnerTab("dashboard"),    isReport: false },
    { key: "owner-reservations", label: "예약",     icon: ClipboardList, onClick: () => setOwnerTab("reservations"), isReport: false, badge: waitingReservations },
    { key: "owner-products",     label: "상품",     icon: Package,       onClick: () => setOwnerTab("products"),     isReport: false },
    { key: "owner-ads",          label: "광고",     icon: Crown,         onClick: () => setOwnerTab("ads"),          isReport: false },
    { key: "owner-exit",         label: "손님 화면", icon: Map,           onClick: () => router.push("/"),            isReport: false },
  ] : [
    { key: "map",       label: "맵",      icon: Map,      onClick: () => router.push("/"),                isReport: false },
    // 반려동물 동반 숙소 찾기·예약(/stay) — 숙박 앱처럼 쓰고 싶은 사람을 위한 탭
    { key: "stay",      label: "숙소",     icon: BedDouble, onClick: () => router.push("/stay"),          isReport: false },
    { key: "community", label: "커뮤니티", icon: Users,    onClick: () => router.push("/community"),       isReport: false },
    // 유기동물 보호소 공고(전체 목록·지역 알림) — 예전엔 이 화면으로 가는 링크가 어디에도 없었습니다.
    { key: "adopt",     label: "입양",     icon: PawPrint, onClick: () => router.push("/shelter-notices"), isReport: false },
    // 동네 가게가 올린 상품을 모아 보고 예약 포장을 넣는 화면(/shop)
    { key: "shop",      label: "쇼핑",     icon: ShoppingBag, onClick: () => router.push("/shop"),         isReport: false },
    ...(isAdmin ? [
      { key: "admin", label: "관리자", icon: ShieldCheck, onClick: () => router.push("/admin"), isReport: true },
    ] : []),
    // 인증된 사장님 전용 — 가게 성과·후기 답글·광고 상품(관리자 탭과 같은 자리).
    // 관리자에게도 보여서, 사장님 화면을 그대로 확인하고 사장님 요청이 있을 때 대신 처리할 수 있습니다.
    ...(isOwner || isAdmin ? [
      { key: "owner", label: "사장님", icon: Store, onClick: () => router.push("/owner"), isReport: false, badge: waitingReservations + unansweredReviews },
    ] : []),
    {
      key:      isLoggedIn ? "mypage" : "login",
      label:    isLoggedIn ? "마이페이지" : "로그인",
      icon:     isLoggedIn ? User : LogIn,
      onClick:  () => router.push(isLoggedIn ? "/mypage" : "/login"),
      isReport: false,
    },
  ];

  // 사장님 센터에서 아래 탭에 없는 메뉴(후기·가게 정보·보고서)를 보는 중이면 강조할 칸이 없습니다(-1).
  const activeIdx = tabs.findIndex((t) => t.key === activeTab);
  const TAB_COUNT = tabs.length;

  return (
    <>
      <style>{`
        @keyframes tabPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        .tab-btn-ggk { transition: opacity 0.15s ease; }
        .tab-btn-ggk:hover { opacity: 0.75; }
        .tab-btn-ggk:active { animation: tabPop 0.2s ease; }
      `}</style>

      <div
        ref={barRef}
        data-guide="tabbar"
        style={{
          position: "fixed",
          // 아래 제스처 바·홈 표시줄이 있는 기기에서는 그만큼 위로 띄웁니다.
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          left: "50%",
          transform: "translateX(-50%)",
          width: "450px",
          zIndex: 998,
          /* 모바일 뷰 대응 */
          maxWidth: "calc(100vw - 28px)",
        }}
      >
        {/* 탭 바 본체 */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "999px",
            padding: "5px",
            boxShadow:
              "0 4px 28px rgba(0,0,0,0.09), 0 1px 6px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.07)",
          }}
        >
          {/* ── 슬라이딩 강조 필 ── */}
          {activeIdx >= 0 && (
            <div
              style={{
                position: "absolute",
                top: "5px",
                /* 각 탭 너비를 동적으로 계산해서 정확히 이동 */
                left: `calc(5px + ${activeIdx} * ((100% - 10px) / ${TAB_COUNT}))`,
                width: `calc((100% - 10px) / ${TAB_COUNT})`,
                height: "calc(100% - 10px)",
                borderRadius: "999px",
                background: tabs[activeIdx]?.isReport
                  ? "linear-gradient(135deg, #FEE2E2, #FECACA)"
                  : "linear-gradient(135deg, #E4EBDC, #DCE7CD)",
                transition: "left 0.38s cubic-bezier(0.34, 1.15, 0.64, 1)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}

          {/* ── 탭 버튼들 ── */}
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const badge = isOwner ? Number((tab as { badge?: number }).badge) || 0 : 0;
            const isActive = activeTab === tab.key;
            const activeColor   = tab.isReport ? "#DC2626" : "#5C7A4A";
            const inactiveColor = "#1a1a1a";

            return (
              <button
                key={tab.key}
                className="tab-btn-ggk"
                onClick={tab.onClick}
                style={{
                  position: "relative",
                  zIndex: 1,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                  height: "48px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  borderRadius: "999px",
                  padding: 0,
                  fontFamily: "'Noto Sans KR', sans-serif",
                }}
              >
                <span style={{ position: "relative", display: "flex" }}>
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.3 : 1.7}
                    color={isActive ? activeColor : inactiveColor}
                  />
                  {badge > 0 && (
                    <span aria-label={`확인할 알림 ${badge}건`} style={{ position: "absolute", top: -8, left: 10, minWidth: 18, height: 18, padding: "0 5px", boxSizing: "border-box", borderRadius: 999, background: "#EF4444", border: "1.5px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", color: "white", fontSize: 10.5, fontWeight: 800, lineHeight: "15px", textAlign: "center", fontFamily: "inherit" }}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? activeColor : inactiveColor,
                    letterSpacing: "0.15px",
                    lineHeight: 1,
                    transition: "color 0.2s ease",
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}