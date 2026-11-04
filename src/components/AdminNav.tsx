"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, LayoutDashboard, Flag, FileText, RefreshCw, BarChart3, BadgeCheck, Crown, AlertTriangle, TrendingUp, ShieldCheck, ScanSearch, Users, HeartHandshake, Handshake, Calculator, BedDouble, Route } from "lucide-react";

// ── 관리자 페이지 공통 틀 — 사장님 센터(/owner)와 같은 구성입니다.
//   위 고정 막대(로고·관리자 센터·새로고침), 넓은 화면은 왼쪽 묶음 메뉴, 좁은 화면은 옆으로 미는 메뉴,
//   그리고 화면마다 아이콘·제목·한 줄 설명. 새로고침 버튼(onRefresh)을 넘기면 위 막대에 나옵니다.

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

export default function AdminNav({ active, onRefresh }: { active: TabKey; onRefresh?: () => void }) {
  const router = useRouter();
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
  }, []);

  // 탭 줄은 화면마다 새로 그려져서, 휴대폰에서 줄을 옆으로 넘긴 뒤 탭을 누르면 줄이 다시 맨 앞으로
  // 돌아가 버렸습니다. 넘겨 둔 가로 위치를 기억했다가(lastScrollLeft) 그려지자마자 그대로 되돌려서,
  // 다른 탭으로 옮겨도 줄이 움직이지 않게 합니다.
  // 주소를 직접 열었을 때처럼 현재 탭이 화면 밖이면, 그 탭이 보일 만큼만 옮깁니다.
  const rowRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const row = rowRef.current, btn = activeRef.current;
    if (!row) return;
    if (lastScrollLeft != null) row.scrollLeft = lastScrollLeft;
    if (btn) {
      const left = btn.offsetLeft - row.offsetLeft, right = left + btn.offsetWidth;
      if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left - 8);
      else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + 8;
    }
    lastScrollLeft = row.scrollLeft;
  }, [active]);

  const badgeOf = (key: TabKey) => key === "reports" ? counts.reports : key === "tips" ? counts.tips : key === "owners" ? counts.owners : key === "premium" ? counts.premium : key === "review" ? counts.review : key === "inquiries" ? counts.inquiries : 0;
  const Badge = ({ n, on }: { n: number; on: boolean }) => n > 0 ? <span aria-label={`${n}건`} style={{ marginLeft: "auto", minWidth: 19, padding: "0 6px", borderRadius: 999, background: on ? "#F6D7BE" : "#DC2626", color: on ? "#3B2A20" : "white", fontSize: 11, fontWeight: 800, textAlign: "center", lineHeight: "19px" }}>{n}</span> : null;
  const activeTab = TABS.find((t) => t.key === active)!;
  const ActiveIcon = activeTab.icon;
  const groupOf = GROUPS.find((g) => (g.keys as readonly string[]).includes(active))?.title ?? "";

  return (
    <>
      <style>{`
        .ad-side { display: none; }
        .ad-top { position: sticky; top: 0; z-index: 30; height: 58px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 clamp(14px, 3vw, 28px); background: rgba(255,255,255,0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid #E7E6E5; box-sizing: border-box; }
        .ad-chips { display: flex; flex-shrink: 0; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 14px clamp(14px, 3vw, 28px) 0; }
        .ad-chips::-webkit-scrollbar { display: none; }
        .ad-title { flex-shrink: 0; width: 100%; max-width: 1200px; margin: 0 auto; padding: 18px clamp(14px, 4vw, 28px) 0; box-sizing: border-box; }
        .ad-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 11px; border: none; background: transparent; color: #2A1C14; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; text-align: left; text-decoration: none; box-sizing: border-box; transition: background .12s ease, color .12s ease; }
        .ad-item:hover { background: #EDECEB; }
        .ad-item[aria-current="page"] { background: #3B2A20; color: white; font-weight: 800; box-shadow: 0 6px 16px rgba(59, 42, 32, 0.18); }
        .ad-top-logo { display: flex; align-items: center; }
        @media (min-width: 980px) {
          .ad-page { padding-left: 252px; }
          .ad-chips, .ad-top-logo, .ad-top-sep { display: none; }
          .ad-title { padding-top: 28px; }
          .ad-side { position: fixed; top: 0; left: 0; bottom: 0; width: 252px; z-index: 40; display: flex; flex-direction: column; box-sizing: border-box; overflow-y: auto; background: #F7F6F5; border-right: 1px solid #E7E6E5; }
        }
      `}</style>

      {/* 왼쪽 메뉴(넓은 화면) */}
      <aside className="ad-side ggk-body">
        <div style={{ height: 58, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: "1px solid #E7E6E5", background: "white" }}>
          <a href="/" aria-label="펫츠로드 메인" style={{ display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/petsroad_lockup.png" alt="펫츠로드" style={{ height: 26, width: "auto", display: "block" }} />
          </a>
        </div>
        <div style={{ padding: "18px 14px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ padding: 14, borderRadius: 16, background: "linear-gradient(160deg,#8A5A3E 0%,#A0704F 100%)", color: "white", marginBottom: 18 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 11, fontWeight: 800 }}>
              <BadgeCheck size={11} color="#F6D7BE" />펫츠로드 운영
            </div>
            <div className="ggk-logo" style={{ fontSize: 16.5, fontWeight: 800, marginTop: 8 }}>관리자 센터</div>
          </div>
          {GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#4A3F38", letterSpacing: "0.3px", padding: "0 12px 6px" }}>{g.title}</div>
              <div style={{ display: "grid", gap: 2 }}>
                {TABS.filter((t) => (g.keys as readonly string[]).includes(t.key)).map((tab) => {
                  const Icon = tab.icon;
                  const on = tab.key === active;
                  return (
                    <button key={tab.key} className="ad-item" aria-current={on ? "page" : undefined} onClick={() => router.push(tab.href)}>
                      <Icon size={16} />{tab.label}<Badge n={badgeOf(tab.key)} on={on} />
                    </button>
                  );
                })}
              </div>
            </nav>
          ))}
          <a className="ad-item" href="/" style={{ marginTop: "auto", borderTop: "1px solid #E7E6E5", borderRadius: 0, paddingTop: 14 }}><ArrowLeft size={16} />메인 페이지로 돌아가기</a>
        </div>
      </aside>

      {/* 위 고정 막대 */}
      <header className="ad-top ggk-body">
        <a href="/" aria-label="펫츠로드 메인" className="ad-top-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/petsroad_lockup.png" alt="펫츠로드" style={{ height: 24, width: "auto", display: "block" }} />
        </a>
        <span className="ad-top-sep" style={{ width: 1, height: 18, background: "#E0DFDE" }} />
        <span className="ggk-logo" style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 10, background: "#FBEDE3", border: "1px solid #EECFBB", fontSize: 14.5, fontWeight: 800, color: "#3B2A20", whiteSpace: "nowrap" }}>관리자 센터</span>
        {onRefresh && (
          <button onClick={onRefresh} title="새로고침" aria-label="새로고침" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", border: "1px solid #E0DFDE", borderRadius: 10, background: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#2A1C14", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            <RefreshCw size={14} />새로고침
          </button>
        )}
      </header>

      {/* 휴대폰 메뉴(옆으로 밀어 보기) */}
      <div ref={rowRef} className="ad-chips ggk-body" onScroll={(e) => { lastScrollLeft = e.currentTarget.scrollLeft; }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const on = tab.key === active;
          const n = badgeOf(tab.key);
          return (
            <button key={tab.key} ref={on ? activeRef : undefined} aria-current={on ? "page" : undefined} onClick={() => router.push(tab.href)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 999, border: on ? "1px solid #3B2A20" : "1px solid #E0DFDE", background: on ? "#3B2A20" : "white", color: on ? "white" : "#2A1C14", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon size={14} />{tab.label}
              {n > 0 && <span style={{ minWidth: 17, padding: "0 5px", borderRadius: 999, background: on ? "#F6D7BE" : "#DC2626", color: on ? "#3B2A20" : "white", fontSize: 11, fontWeight: 800, textAlign: "center" }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* 화면 제목 — 사장님 센터와 같은 모양 */}
      <div className="ad-title ggk-body">
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4A3F38" }}>관리자 센터<span style={{ margin: "0 6px", color: "#C9C3BE" }}>/</span>{groupOf}</div>
        <h1 className="ggk-logo" style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 0", fontSize: "clamp(21px, 2.4vw, 26px)", fontWeight: 800, color: "#1f1a12", letterSpacing: "-0.4px" }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: "#FBEDE3", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ActiveIcon size={18} color="#3B2A20" /></span>
          {activeTab.label}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "#2A1C14", lineHeight: 1.6 }}>{TAB_DESC[active]}</p>
      </div>
    </>
  );
}
