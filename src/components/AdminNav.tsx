"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, LayoutDashboard, Flag, FileText, RefreshCw, BarChart3, BadgeCheck, Crown, AlertTriangle, TrendingUp, ShieldCheck, ScanSearch, Users, HeartHandshake, Handshake, Calculator, BedDouble, Route } from "lucide-react";

// ── 관리자 페이지 공통 메뉴 — 사장님 센터처럼 넓은 화면은 왼쪽 메뉴, 좁은 화면은 옆으로 미는 메뉴입니다.
// 새로고침 버튼(onRefresh)을 넘기면 메뉴 아래쪽에 함께 나옵니다.

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
  { title: "운영", keys: ["dashboard", "reports", "tips", "review", "members", "owners", "premium", "stays", "inquiries", "support"] },
  { title: "분석", keys: ["analytics", "traffic", "kpi", "business", "quality", "errors"] },
] as const;

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
  const Badge = ({ n, on }: { n: number; on: boolean }) => n > 0 ? <span style={{ marginLeft: "auto", minWidth: 19, padding: "0 6px", borderRadius: 999, background: on ? "#F3DA9B" : "#DC2626", color: on ? "#3B2A20" : "white", fontSize: 11, fontWeight: 800, textAlign: "center", lineHeight: "19px" }}>{n}</span> : null;

  return (
    <>
      {/* 사장님 센터와 같은 구성 — 넓은 화면은 왼쪽 메뉴, 좁은 화면은 위쪽 막대와 옆으로 미는 메뉴 */}
      <style>{`
        .ad-side { display: none; }
        .ad-top { position: sticky; top: 0; z-index: 30; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 14px; background: white; border-bottom: 1px solid #E7E6E5; }
        .ad-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 10px 14px; background: white; border-bottom: 1px solid #E7E6E5; }
        .ad-chips::-webkit-scrollbar { display: none; }
        .ad-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 11px; border: none; background: transparent; color: #4a4437; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; text-align: left; text-decoration: none; box-sizing: border-box; }
        .ad-item:hover { background: #F4F3F2; }
        .ad-item[aria-current="page"] { background: #3B2A20; color: white; }
        @media (min-width: 980px) {
          .ad-page { padding-left: 252px; }
          .ad-top, .ad-chips { display: none; }
          .ad-side { position: fixed; top: 0; left: 0; bottom: 0; width: 252px; z-index: 40; display: flex; flex-direction: column; box-sizing: border-box; padding: 16px 14px 14px; overflow-y: auto; background: white; border-right: 1px solid #E7E6E5; }
        }
      `}</style>

      <aside className="ad-side ggk-body">
        <a href="/" aria-label="펫츠로드 메인" style={{ display: "block", padding: "0 6px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/petsroad_lockup.png" alt="펫츠로드" style={{ height: 30, width: "auto", display: "block" }} />
        </a>
        <div style={{ margin: "14px 0 16px", padding: "14px", borderRadius: 16, background: "linear-gradient(160deg,#2A1C14,#3B2A20 55%,#70482F)", color: "white" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#F3DA9B" }}>펫츠로드 운영</div>
          <div className="ggk-logo" style={{ fontSize: 16.5, fontWeight: 800, marginTop: 4 }}>관리자 센터</div>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#6a6253", padding: "0 12px 6px" }}>{g.title}</div>
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
        <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid #E7E6E5", display: "grid", gap: 2 }}>
          {onRefresh && <button className="ad-item" onClick={onRefresh}><RefreshCw size={16} />새로고침</button>}
          <a className="ad-item" href="/"><ArrowLeft size={16} />메인 페이지로 돌아가기</a>
        </div>
      </aside>

      <div className="ad-top ggk-body">
        <a href="/" aria-label="메인 페이지로 돌아가기" style={{ display: "flex", alignItems: "center", gap: 6, color: "#3B2A20", textDecoration: "none", fontSize: 13, fontWeight: 700 }}><ArrowLeft size={16} />메인</a>
        <span className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#3B2A20" }}>관리자 센터</span>
        {onRefresh && <button onClick={onRefresh} title="새로고침" aria-label="새로고침" style={{ marginLeft: "auto", width: 34, height: 34, border: "1px solid #E7E6E5", borderRadius: 10, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><RefreshCw size={14} color="#6B5E55" /></button>}
      </div>
      <div ref={rowRef} className="ad-chips ggk-body" onScroll={(e) => { lastScrollLeft = e.currentTarget.scrollLeft; }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const on = tab.key === active;
          const n = badgeOf(tab.key);
          return (
            <button key={tab.key} ref={on ? activeRef : undefined} aria-current={on ? "page" : undefined} onClick={() => router.push(tab.href)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 999, border: on ? "1px solid #3B2A20" : "1px solid #E0DFDE", background: on ? "#3B2A20" : "white", color: on ? "white" : "#4a4437", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon size={14} />{tab.label}
              {n > 0 && <span style={{ minWidth: 17, padding: "0 5px", borderRadius: 999, background: on ? "#F3DA9B" : "#DC2626", color: on ? "#3B2A20" : "white", fontSize: 11, fontWeight: 800, textAlign: "center" }}>{n}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
