"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, LayoutDashboard, Flag, FileText, RefreshCw, BarChart3, BadgeCheck, Crown, AlertTriangle, TrendingUp, ShieldCheck, ScanSearch, Users, HeartHandshake, Handshake, Calculator, BedDouble, Route } from "lucide-react";

// ── 관리자 페이지 공통 틀 — 사장님 센터(/owner)·마이페이지(/mypage)와 똑같은 구성입니다.
//   전체 폭 위 고정 막대(로고 | 관리자 센터 · 새로고침) → 그 아래 넓은 화면은 왼쪽 묶음 메뉴(252px) + 본문,
//   좁은 화면은 옆으로 미는 메뉴 + 본문. 본문 맨 위에는 화면마다 아이콘·제목·한 줄 설명.
//   틀(AdminFrame)은 admin/layout.tsx가 한 번만 그리고, 각 화면은 <AdminNav active onRefresh />로
//   새로고침 버튼만 등록합니다(AdminNav 자체는 화면에 아무것도 그리지 않습니다).
//   ⚠ 각 화면의 바깥 상자는 높이·폭·배경·바깥 여백을 정하지 말고 내용만 두세요 — 폭·여백·스크롤은 틀이 정합니다.

const TABS = [
  { key: "dashboard", href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { key: "reports", href: "/admin/reports", label: "신고 관리", icon: Flag },
  { key: "tips", href: "/admin/tips", label: "제보 관리", icon: FileText },
  { key: "review", href: "/admin/review", label: "글 검토", icon: ScanSearch },
  { key: "members", href: "/admin/members", label: "회원 관리", icon: Users },
  { key: "owners", href: "/admin/owners", label: "사장님 인증", icon: BadgeCheck },
  { key: "premium", href: "/admin/premium", label: "프리미엄", icon: Crown },
  { key: "stays", href: "/admin/stays", label: "숙박 예약", icon: BedDouble },
  { key: "analytics", href: "/admin/analytics", label: "통계 분석", icon: BarChart3 },
  { key: "traffic", href: "/admin/traffic", label: "유입 경로", icon: Route },
  { key: "kpi", href: "/admin/kpi", label: "성과 지표", icon: TrendingUp },
  { key: "business", href: "/admin/business", label: "사업성 계산", icon: Calculator },
  { key: "quality", href: "/admin/quality", label: "데이터 품질", icon: ShieldCheck },
  { key: "inquiries", href: "/admin/inquiries", label: "광고·제휴 문의", icon: Handshake },
  { key: "support", href: "/admin/support", label: "후원 단체", icon: HeartHandshake },
  { key: "errors", href: "/admin/errors", label: "에러 로그", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const GROUPS = [
  { title: "홈", keys: ["dashboard"] },
  { title: "검토·처리", keys: ["reports", "tips", "review", "owners", "premium"] },
  { title: "회원·예약", keys: ["members", "stays"] },
  { title: "문의·후원", keys: ["inquiries", "support"] },
  { title: "분석", keys: ["analytics", "traffic", "kpi", "business"] },
  { title: "점검", keys: ["quality", "errors"] },
] as const;

// 화면 제목 아래 한 줄 설명
const TAB_DESC: Record<TabKey, string> = {
  dashboard: "오늘 처리할 일과 서비스 현황을 한눈에 확인해요.",
  reports: "회원이 신고한 장소·글·댓글과 자동 점검(폐업 의심)을 처리해요.",
  tips: "회원이 제보한 새 장소와 정보 수정을 확인하고 반영해요.",
  review: "규칙 위반이 의심돼 자동으로 보류된 글을 확인하고 게시하거나 반려해요.",
  members: "가입 회원의 활동과 신고받은 횟수를 보고 조치해요.",
  owners: "사장님 가입 신청을 확인하고 승인하거나 반려해요.",
  premium: "프리미엄 신청과 배너 한도 변경 요청을 처리해요.",
  stays: "숙박 예약의 문제 접수·정산·환불과 입점 신청을 관리해요.",
  analytics: "방문·검색·장소 조회 흐름을 통계로 확인해요.",
  traffic: "채널별로 몇 명이 들어와 다시 오고, 회원이 됐는지 봐요.",
  kpi: "지원사업 보고용 핵심 지표를 월별로 확인해요.",
  business: "매달 비용을 메우려면 유료 가게가 몇 곳 필요한지 계산해요.",
  quality: "장소 데이터와 사진의 빈칸·오류를 점검해요.",
  inquiries: "광고·제휴 문의를 확인하고 처리 상태를 남겨요.",
  support: "'후원하러 가기' 버튼을 붙일 단체를 관리해요.",
  errors: "사이트에서 난 오류를 최근 순으로 확인해요.",
};

/** 탭 줄을 옆으로 넘겨 둔 위치 — 관리자 화면 사이를 옮겨 다녀도 유지합니다(새로고침하면 처음으로). */
let lastScrollLeft: number | null = null;

/** 주소로 지금 화면(탭)을 찾습니다. /admin 은 대시보드, 나머지는 가장 길게 맞는 주소. */
function tabOfPath(pathname: string): TabKey {
  const path = pathname.replace(/\/+$/, "") || "/admin";
  let best: (typeof TABS)[number] = TABS[0];
  for (const t of TABS) {
    if (t.href === "/admin") continue;
    if ((path === t.href || path.startsWith(t.href + "/")) && t.href.length > best.href.length) best = t;
  }
  return best.key;
}

// 화면(page)이 넘긴 새로고침 함수를 틀의 위 막대 버튼에 연결합니다.
type RefreshCtx = { setRefresh: (fn: (() => void) | null) => void };
const AdminRefreshContext = createContext<RefreshCtx | null>(null);

/** 각 관리자 화면에서 부르는 자리표시 — 새로고침 버튼만 등록하고 화면에는 아무것도 그리지 않습니다. */
export default function AdminNav({ onRefresh }: { active: TabKey; onRefresh?: () => void }) {
  const ctx = useContext(AdminRefreshContext);
  const latest = useRef(onRefresh);
  useEffect(() => { latest.current = onRefresh; });
  const has = !!onRefresh;
  useEffect(() => {
    if (!ctx) return;
    ctx.setRefresh(has ? () => latest.current?.() : null);
    return () => ctx.setRefresh(null);
  }, [ctx, has]);
  return null;
}

/** 관리자 화면 전체 틀(admin/layout.tsx에서 한 번만 그립니다). */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const active = tabOfPath(pathname);
  const [refresh, setRefreshFn] = useState<(() => void) | null>(null);
  const [ctx] = useState<RefreshCtx>(() => ({ setRefresh: (fn) => setRefreshFn(() => fn) }));
  const [counts, setCounts] = useState<{ reports: number; tips: number; owners: number; premium: number; review: number; inquiries: number }>({ reports: 0, tips: 0, owners: 0, premium: 0, review: 0, inquiries: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      const [{ count: reportsCount }, { count: tipsCount }, { count: ownersCount }, { count: premiumCount }, { count: reviewCount }] = await Promise.all([
        supabase.from("reports").select("*", { count: "exact", head: true }).eq("is_resolved", false),
        supabase.from("proposals").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("users").select("*", { count: "exact", head: true }).eq("owner_status", "pending"),
        supabase.from("premium_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        // 자동 검토 대기 글(컬럼이 아직 없으면 오류 → 0건으로 표시)
        supabase.from("community_posts").select("*", { count: "exact", head: true }).eq("review_status", "pending").eq("deleted", false),
      ]);
      // 새 광고·제휴 문의와 배너 한도 변경 요청 수(서버에서만 셀 수 있는 표라 따로 물어봅니다. 실패하면 0)
      let extra = { fresh: 0, bannerRequests: 0 };
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch("/api/admin/inquiries?count=1", { headers: { Authorization: `Bearer ${session.access_token}` } });
          if (res.ok) extra = { ...extra, ...(await res.json()) };
        }
      } catch { /* 숫자를 못 받아도 탭은 그대로 */ }
      // 프리미엄 탭의 숫자 = 프리미엄 신청 + 배너 한도 변경 요청
      setCounts({ reports: reportsCount ?? 0, tips: tipsCount ?? 0, owners: ownersCount ?? 0, premium: (premiumCount ?? 0) + (Number(extra.bannerRequests) || 0), review: reviewCount ?? 0, inquiries: Number(extra.fresh) || 0 });
    };
    fetchCounts();
    // 틀은 화면을 옮겨도 그대로 남아 있어서, 화면을 옮길 때마다 처리 대기 숫자를 다시 셉니다.
  }, [pathname]);

  // 휴대폰 메뉴 줄: 넘겨 둔 가로 위치를 지키고, 지금 탭이 화면 밖이면 보일 만큼만 옮깁니다.
  const rowRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const row = rowRef.current, btn = activeRef.current;
    if (!row) return;
    if (lastScrollLeft != null) row.scrollLeft = lastScrollLeft;
    if (btn) {
      const rb = row.getBoundingClientRect(), bb = btn.getBoundingClientRect();
      if (bb.left < rb.left) row.scrollLeft -= rb.left - bb.left + 14;
      else if (bb.right > rb.right) row.scrollLeft += bb.right - rb.right + 14;
    }
    lastScrollLeft = row.scrollLeft;
    // 처리 대기 숫자(빨간 배지)가 늦게 붙으면 칩 폭이 늘어나 지금 탭이 밀려나므로, 숫자가 바뀔 때도 다시 맞춥니다.
  }, [active, counts]);

  // 화면을 옮기면 본문을 맨 위부터 보여 줍니다(틀이 스크롤 칸이라 저절로 올라가지 않습니다).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [pathname]);

  const badgeOf = (key: TabKey) => key === "reports" ? counts.reports : key === "tips" ? counts.tips : key === "owners" ? counts.owners : key === "premium" ? counts.premium : key === "review" ? counts.review : key === "inquiries" ? counts.inquiries : 0;
  const activeTab = TABS.find((t) => t.key === active)!;
  const ActiveIcon = activeTab.icon;
  const groupOf = GROUPS.find((g) => (g.keys as readonly string[]).includes(active))?.title ?? "";
  const go = (href: string) => { if (href !== pathname) router.push(href); };

  return (
    <AdminRefreshContext.Provider value={ctx}>
      {/* 사이트 전체의 body가 overflow:hidden(지도 화면용)이라, 이 틀 자체를 스크롤 칸으로 둡니다(사장님 센터와 같음). */}
      <div ref={scrollRef} className="ggk-body ad-shell">
        <style>{`
          .ad-shell { height: 100dvh; overflow-y: auto; background: #F4F3F2; color: #2A1C14; }
          .ad-top { position: sticky; top: 0; z-index: 30; height: 58px; display: flex; align-items: center; gap: 12px; padding: 0 clamp(14px, 3vw, 28px); background: rgba(255,255,255,0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid #E7E6E5; box-sizing: border-box; }
          .ad-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
          .ad-side { display: none; }
          .ad-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 14px clamp(14px, 3vw, 28px) 0; }
          .ad-chips::-webkit-scrollbar { display: none; }
          .ad-main { min-width: 0; padding: 20px clamp(14px, 3vw, 36px) calc(var(--ggk-tabbar-space) + 12px); box-sizing: border-box; }
          .ad-inner { max-width: 1120px; }
          .ad-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 11px; border: none; background: transparent; color: #2A1C14; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; text-align: left; text-decoration: none; box-sizing: border-box; transition: background .12s ease, color .12s ease; }
          .ad-item:hover { background: #EDECEB; }
          .ad-item[aria-current="page"] { background: #3B2A20; color: white; font-weight: 800; box-shadow: 0 6px 16px rgba(59, 42, 32, 0.18); }
          @media (min-width: 980px) {
            .ad-grid { grid-template-columns: 252px minmax(0, 1fr); }
            .ad-side { display: flex; flex-direction: column; position: sticky; top: 58px; height: calc(100dvh - 58px); overflow-y: auto; border-right: 1px solid #E7E6E5; background: #F9F8F7; padding: 18px 14px var(--ggk-tabbar-space); box-sizing: border-box; }
            .ad-chips { display: none; }
            .ad-main { padding-top: 28px; }
          }
        `}</style>

        {/* 위 고정 막대 */}
        <header className="ad-top">
          <Link href="/" aria-label="펫츠로드 지도로" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/icons/petsroad_lockup.png" alt="펫츠로드" width={721} height={231} style={{ height: 26, width: "auto" }} priority />
          </Link>
          <span style={{ width: 1, height: 18, background: "#E0DFDE" }} />
          <span className="ggk-logo" style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 10, background: "#FBEDE3", border: "1px solid #EECFBB", fontSize: 14.5, fontWeight: 800, color: "#3B2A20", whiteSpace: "nowrap" }}>관리자 센터</span>
          {refresh && (
            <button onClick={refresh} title="새로고침" aria-label="새로고침" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", border: "1px solid #E0DFDE", borderRadius: 10, background: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#2A1C14", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              <RefreshCw size={14} />새로고침
            </button>
          )}
        </header>

        <div className="ad-grid">
          {/* 왼쪽 메뉴(넓은 화면) */}
          <aside className="ad-side">
            <div style={{ padding: 14, borderRadius: 16, background: "linear-gradient(160deg,#8A5A3E 0%,#A0704F 100%)", color: "white", marginBottom: 18 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 11, fontWeight: 800 }}>
                <BadgeCheck size={11} color="#F6D7BE" />펫츠로드 운영
              </div>
              <div className="ggk-logo" style={{ fontSize: 16.5, fontWeight: 800, marginTop: 8, lineHeight: 1.35 }}>관리자 센터</div>
            </div>
            {GROUPS.map((g) => (
              <nav key={g.title} aria-label={g.title} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#4A3F38", letterSpacing: "0.3px", padding: "0 12px 6px" }}>{g.title}</div>
                <div style={{ display: "grid", gap: 2 }}>
                  {TABS.filter((t) => (g.keys as readonly string[]).includes(t.key)).map((tab) => {
                    const Icon = tab.icon;
                    const on = tab.key === active;
                    const n = badgeOf(tab.key);
                    return (
                      <button key={tab.key} className="ad-item" aria-current={on ? "page" : undefined} onClick={() => go(tab.href)}>
                        <Icon size={16} />{tab.label}
                        {n > 0 && <span aria-label={`${n}건`} style={{ marginLeft: "auto", minWidth: 19, padding: "0 6px", borderRadius: 999, background: on ? "#F6D7BE" : "#DC2626", color: on ? "#3B2A20" : "white", fontSize: 11, fontWeight: 800, textAlign: "center", lineHeight: "19px" }}>{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </nav>
            ))}
            <Link href="/" className="ad-item" style={{ marginTop: "auto", borderTop: "1px solid #E7E6E5", borderRadius: 0, paddingTop: 14 }}>
              <ArrowLeft size={16} />메인 페이지로 돌아가기
            </Link>
          </aside>

          <div style={{ minWidth: 0 }}>
            {/* 휴대폰 메뉴(옆으로 밀어 보기) */}
            <div ref={rowRef} className="ad-chips" onScroll={(e) => { lastScrollLeft = e.currentTarget.scrollLeft; }}>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const on = tab.key === active;
                const n = badgeOf(tab.key);
                return (
                  <button key={tab.key} ref={on ? activeRef : undefined} aria-current={on ? "page" : undefined} onClick={() => go(tab.href)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 999, border: on ? "1px solid #3B2A20" : "1px solid #E0DFDE", background: on ? "#3B2A20" : "white", color: on ? "white" : "#2A1C14", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <Icon size={14} />{tab.label}
                    {n > 0 && <span style={{ marginLeft: 2, minWidth: 17, padding: "0 5px", borderRadius: 999, background: on ? "#F6D7BE" : "#DC2626", color: on ? "#3B2A20" : "white", fontSize: 10.5, fontWeight: 800, lineHeight: "17px", textAlign: "center" }}>{n}</span>}
                  </button>
                );
              })}
            </div>

            <main className="ad-main">
              <div className="ad-inner">
                {/* 화면 제목 — 사장님 센터와 같은 모양 */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4A3F38" }}>관리자 센터<span style={{ margin: "0 6px", color: "#C9C3BE" }}>/</span>{groupOf}</div>
                  <h1 className="ggk-logo" style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 0", fontSize: "clamp(21px, 2.4vw, 26px)", fontWeight: 800, color: "#1f1a12", letterSpacing: "-0.4px" }}>
                    <span style={{ width: 36, height: 36, borderRadius: 11, background: "#FBEDE3", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ActiveIcon size={18} color="#3B2A20" /></span>
                    {activeTab.label}
                  </h1>
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: "#2A1C14", lineHeight: 1.6 }}>{TAB_DESC[active]}</p>
                </div>
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </AdminRefreshContext.Provider>
  );
}
