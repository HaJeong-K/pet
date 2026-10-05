"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, Flag, FileText, RefreshCw, BarChart3, BadgeCheck, Crown, AlertTriangle, TrendingUp, ShieldCheck, ScanSearch } from "lucide-react";

// ── 관리자 페이지 공통 상단 탭 — 대시보드 / 신고 관리 / 제보 관리 / 통계 분석 / 사장님 인증을
// 어느 관리자 화면에서든 한 번에 오가며 확인할 수 있도록 하는 공용 네비게이션입니다.
// 새로고침 버튼(onRefresh)을 넘기면 이 탭 행의 가장 우측에 아이콘만 있는 버튼으로 출력됩니다.

const TABS = [
  { key: "dashboard", href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { key: "reports", href: "/admin/reports", label: "신고 관리", icon: Flag },
  { key: "tips", href: "/admin/tips", label: "제보 관리", icon: FileText },
  { key: "review", href: "/admin/review", label: "글 검토", icon: ScanSearch },
  { key: "owners", href: "/admin/owners", label: "사장님 인증", icon: BadgeCheck },
  { key: "premium", href: "/admin/premium", label: "프리미엄", icon: Crown },
  { key: "analytics", href: "/admin/analytics", label: "통계 분석", icon: BarChart3 },
  { key: "kpi", href: "/admin/kpi", label: "성과 지표", icon: TrendingUp },
  { key: "quality", href: "/admin/quality", label: "데이터 품질", icon: ShieldCheck },
  { key: "errors", href: "/admin/errors", label: "에러 로그", icon: AlertTriangle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 탭 줄을 옆으로 넘겨 둔 위치 — 관리자 화면 사이를 옮겨 다녀도 유지합니다(새로고침하면 처음으로). */
let lastScrollLeft: number | null = null;

export default function AdminNav({ active, onRefresh }: { active: TabKey; onRefresh?: () => void }) {
  const router = useRouter();
  const [counts, setCounts] = useState<{ reports: number; tips: number; owners: number; premium: number; review: number }>({ reports: 0, tips: 0, owners: 0, premium: 0, review: 0 });

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
      setCounts({ reports: reportsCount ?? 0, tips: tipsCount ?? 0, owners: ownersCount ?? 0, premium: premiumCount ?? 0, review: reviewCount ?? 0 });
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

  return (
    // 최상단 탭 영역 — 뷰포트 가로 전체(full-bleed)로 펼치고, 내부 탭 행만
    // 페이지 본문과 동일한 maxWidth 1200으로 가운데 정렬해 시각적으로 정렬을 맞춥니다.
    <div
      className="ggk-body"
      style={{
        width: "100%", flexShrink: 0,
        background: "#F7F3E8", borderBottom: "1px solid #D9E4CE",
        display: "flex", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: "1200px", boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "10px clamp(14px, 4vw, 28px)",
        }}
      >
        <div ref={rowRef} onScroll={(e) => { lastScrollLeft = e.currentTarget.scrollLeft; }} style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", minWidth: 0 }}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            const badge = tab.key === "reports" ? counts.reports : tab.key === "tips" ? counts.tips : tab.key === "owners" ? counts.owners : tab.key === "premium" ? counts.premium : tab.key === "review" ? counts.review : 0;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                ref={isActive ? activeRef : undefined}
                aria-current={isActive ? "page" : undefined}
                onClick={() => router.push(tab.href)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                  padding: "8px 14px", borderRadius: 10, border: "none",
                  background: isActive ? "#5C7A4A" : "white",
                  color: isActive ? "white" : "#555",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                  fontFamily: "'Noto Sans KR', sans-serif",
                  transition: "background 0.15s ease",
                  boxShadow: isActive ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <Icon size={13} />
                {tab.label}
                {badge > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999,
                    background: isActive ? "rgba(255,255,255,0.25)" : "#ef4444",
                    color: "white", minWidth: 15, textAlign: "center",
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            title="새로고침"
            style={{
              border: "none", background: "white", borderRadius: 10,
              width: 32, height: 32, cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <RefreshCw size={14} color="#888" />
          </button>
        )}
      </div>
    </div>
  );
}
