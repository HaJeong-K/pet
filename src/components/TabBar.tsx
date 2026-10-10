"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Map, Users, ShieldCheck, User, LogIn, PawPrint, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const checkLogin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
      if (session?.user) {
        const { data: profile } = await supabase
          .from("users").select("is_admin, owner_status, owner_place_id").eq("auth_user_id", session.user.id).single();
        setIsAdmin(!!profile?.is_admin);
        setIsOwner(profile?.owner_status === "verified" && profile?.owner_place_id != null);
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
          const { data: profile } = await supabase
            .from("users").select("is_admin, owner_status, owner_place_id").eq("auth_user_id", uid).single();
          setIsAdmin(!!profile?.is_admin);
          setIsOwner(profile?.owner_status === "verified" && profile?.owner_place_id != null);
        }, 0);
      } else {
        setIsAdmin(false);
        setIsOwner(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ⚠ 속도: 탭은 버튼(router.push)이라 화면 코드를 미리 받아 두지 않았습니다 — 누른 뒤에야 받기 시작해 반 박자 늦었습니다.
  // 화면이 한가해지면 탭 화면들을 미리 받아 둬서, 누르는 순간 바로 바뀌게 합니다.
  useEffect(() => {
    const routes = ["/", "/community", "/shelter-notices", isLoggedIn ? "/mypage" : "/login", ...(isAdmin ? ["/admin"] : []), ...(isOwner || isAdmin ? ["/owner"] : [])];
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
    if (pathname.startsWith("/admin")) return "admin";
    if (pathname.startsWith("/owner")) return isOwner || isAdmin ? "owner" : "mypage";
    if (pathname.startsWith("/mypage")) return "mypage";
    if (pathname.startsWith("/login")) return "login";
    return "map";
  };

  const activeTab = getActiveTab();

  const tabs = [
    { key: "map",       label: "맵",      icon: Map,      onClick: () => router.push("/"),                isReport: false },
    { key: "community", label: "커뮤니티", icon: Users,    onClick: () => router.push("/community"),       isReport: false },
    // 유기동물 보호소 공고(전체 목록·지역 알림) — 예전엔 이 화면으로 가는 링크가 어디에도 없었습니다.
    { key: "adopt",     label: "입양",     icon: PawPrint, onClick: () => router.push("/shelter-notices"), isReport: false },
    ...(isAdmin ? [
      { key: "admin", label: "관리자", icon: ShieldCheck, onClick: () => router.push("/admin"), isReport: true },
    ] : []),
    // 인증된 사장님 전용 — 가게 성과·후기 답글·광고 상품(관리자 탭과 같은 자리).
    // 관리자에게도 보여서, 사장님 화면을 그대로 확인하고 사장님 요청이 있을 때 대신 처리할 수 있습니다.
    ...(isOwner || isAdmin ? [
      { key: "owner", label: "사장님", icon: Store, onClick: () => router.push("/owner"), isReport: false },
    ] : []),
    {
      key:      isLoggedIn ? "mypage" : "login",
      label:    isLoggedIn ? "마이페이지" : "로그인",
      icon:     isLoggedIn ? User : LogIn,
      onClick:  () => router.push(isLoggedIn ? "/mypage" : "/login"),
      isReport: false,
    },
  ];

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
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2.3 : 1.7}
                  color={isActive ? activeColor : inactiveColor}
                />
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