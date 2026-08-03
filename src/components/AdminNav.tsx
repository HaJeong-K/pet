"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, Flag, FileText, RefreshCw, BarChart3, BadgeCheck } from "lucide-react";

// ── 관리자 페이지 공통 상단 탭 — 대시보드 / 신고 관리 / 제보 관리 / 통계 분석 / 사장님 인증을
// 어느 관리자 화면에서든 한 번에 오가며 확인할 수 있도록 하는 공용 네비게이션입니다.
// 새로고침 버튼(onRefresh)을 넘기면 이 탭 행의 가장 우측에 아이콘만 있는 버튼으로 출력됩니다.

const TABS = [
  { key: "dashboard", href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { key: "reports", href: "/admin/reports", label: "신고 관리", icon: Flag },
  { key: "tips", href: "/admin/tips", label: "제보 관리", icon: FileText },
  { key: "owners", href: "/admin/owners", label: "사장님 인증", icon: BadgeCheck },
  { key: "analytics", href: "/admin/analytics", label: "통계 분석", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminNav({ active, onRefresh }: { active: TabKey; onRefresh?: () => void }) {
  const router = useRouter();
  const [counts, setCounts] = useState<{ reports: number; tips: number; owners: number }>({ reports: 0, tips: 0, owners: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      const [{ count: reportsCount }, { count: tipsCount }, { count: ownersCount }] = await Promise.all([
        supabase.from("reports").select("*", { count: "exact", head: true }).eq("is_resolved", false),
        supabase.from("proposals").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("users").select("*", { count: "exact", head: true }).eq("owner_status", "pending"),
      ]);
      setCounts({ reports: reportsCount ?? 0, tips: tipsCount ?? 0, owners: ownersCount ?? 0 });
    };
    fetchCounts();
  }, []);

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
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "10px 28px",
        }}
      >
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            const badge = tab.key === "reports" ? counts.reports : tab.key === "tips" ? counts.tips : tab.key === "owners" ? counts.owners : 0;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
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
