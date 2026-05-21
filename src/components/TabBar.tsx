"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Map, Users, Flag, FileText, User, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkLogin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
      if (session?.user) {
        const { data: profile } = await supabase
          .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
        setIsAdmin(!!profile?.is_admin);
      }
    };
    checkLogin();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsLoggedIn(!!session);
      if (session?.user) {
        const { data: profile } = await supabase
          .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
        setIsAdmin(!!profile?.is_admin);
      } else {
        setIsAdmin(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const hideTabBar =
    pathname.includes("/login") ||
    pathname.includes("/signup") ||
    pathname.includes("/place/") ||
    pathname === "/report";

  if (hideTabBar) return null;

  const getActiveTab = () => {
    if (pathname === "/" || pathname === "") return "map";
    if (pathname.startsWith("/community")) return "community";
    if (pathname.startsWith("/admin/reports")) return "reports";
    if (pathname.startsWith("/admin/tips")) return "tips";
    if (pathname.startsWith("/mypage")) return "mypage";
    if (pathname.startsWith("/login")) return "login";
    return "map";
  };

  const activeTab = getActiveTab();

  const tabs = [
    { key: "map",       label: "맵",      icon: Map,      onClick: () => router.push("/"),                isReport: false },
    { key: "community", label: "커뮤니티", icon: Users,    onClick: () => router.push("/community"),       isReport: false },
    ...(isAdmin ? [
      { key: "reports", label: "신고",    icon: Flag,     onClick: () => router.push("/admin/reports"),   isReport: true  },
      { key: "tips",    label: "제보",    icon: FileText, onClick: () => router.push("/admin/tips"),      isReport: false },
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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        @keyframes tabPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.86); }
          100% { transform: scale(1); }
        }
        .tab-btn-ggk { transition: opacity 0.15s ease; }
        .tab-btn-ggk:hover { opacity: 0.75; }
        .tab-btn-ggk:active { animation: tabPop 0.2s ease; }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: "20px",
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
                  : "linear-gradient(135deg, #EEF2FF, #E0E7FF)",
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
            const activeColor   = tab.isReport ? "#DC2626" : "#4263EB";
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