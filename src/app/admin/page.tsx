"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import PetIllustration from "@/components/illustrations/PetIllustration";
import {
  ArrowLeft, Flag, FileText,
  MapPin, MessageCircle, Users, RefreshCw, ChevronRight,
} from "lucide-react";

const STYLES = `
  * { box-sizing: border-box; }
  .dash-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .dash-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; transform: translateY(-2px); }
`;

// ── 관리자 대시보드
// 예전에는 이 페이지가 댓글/답글 신고만 별도로 처리했지만, 그 기능은 모든 신고 유형
// (장소/댓글/답글/커뮤니티)을 통합해서 다루는 /admin/reports 에 이미 포함되어 있어
// 중복이었습니다. 그래서 이 페이지는 "신고 관리"와 "제보 관리"를 한눈에 보고
// 바로 이동할 수 있는 허브(대시보드)로 재구성했습니다.
export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({
    pendingReports: 0,
    pendingTips: 0,
    totalPlaces: 0,
    totalMembers: 0, // auth_user_id가 있는 실제 가입 회원
    totalGuests: 0,  // user_key만 있는 비회원(익명 닉네임)
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // ⚠ 관리자 인증(세션 + is_admin)은 이제 src/app/admin/layout.tsx가 한 번만 확인하고,
  // 통과한 뒤에만 이 페이지가 마운트됩니다 — 여기서 다시 확인할 필요가 없습니다.
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    // 가입 회원 = auth_user_id가 저장된 행(실제 로그인 계정), 비회원 = user_key만
    // 저장된 행(리뷰·댓글 작성용 익명 닉네임). 두 값은 upsert 시 conflict 키가
    // 서로 달라(auth_user_id / user_key) 겹치지 않지만, 혹시 모를 중복을 막기 위해
    // 비회원 카운트는 auth_user_id가 비어있는 행만 셉니다.
    const [
      { count: pendingReports },
      { count: pendingTips },
      { count: totalPlaces },
      { count: totalMembers },
      { count: totalGuests },
    ] = await Promise.all([
      supabase.from("reports").select("*", { count: "exact", head: true }).eq("is_resolved", false),
      supabase.from("proposals").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("places").select("*", { count: "exact", head: true }),
      supabase.from("users").select("*", { count: "exact", head: true }).not("auth_user_id", "is", null),
      supabase.from("users").select("*", { count: "exact", head: true }).not("user_key", "is", null).is("auth_user_id", null),
    ]);
    setStats({
      pendingReports: pendingReports ?? 0,
      pendingTips: pendingTips ?? 0,
      totalPlaces: totalPlaces ?? 0,
      totalMembers: totalMembers ?? 0,
      totalGuests: totalGuests ?? 0,
    });

    // ── 최근 제보·신고 — 시안 .panel "최근 제보·신고" 리스트용
    const [{ data: recentReports }, { data: recentTips }] = await Promise.all([
      supabase.from("reports").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
    ]);
    const REPORT_TYPE_LABEL: Record<string, string> = {
      place: "장소 신고", review: "댓글 신고", reply: "답글 신고", community: "커뮤니티 신고",
    };
    // admin/reports 페이지와 동일한 사유 코드 → 한글 라벨 매핑 (영문 원본 코드가 그대로
    // 노출되지 않도록 대시보드 "최근 제보·신고" 목록에도 동일하게 적용)
    const CATEGORY_LABEL: Record<string, string> = {
      spam: "광고/도배", abuse: "욕설/비방", sexual: "음란물", hate: "혐오 표현", etc: "기타",
      closed: "폐업", no_pets: "반려동물 동반 불가", changed: "업종 변경", wrong_info: "가게 정보 오류",
      different: "실제와 다름", duplicate: "중복 등록", inappropriate: "허위/부적절 장소",
    };
    const merged = [
      ...(recentReports || []).map((r: any) => ({
        id: `report-${r.id}`,
        title: `${REPORT_TYPE_LABEL[r.type] || "신고"} · ${CATEGORY_LABEL[r.report_category] || r.report_category || "기타"}`,
        status: "신고", statusColor: "#ef4444",
        created_at: r.created_at,
      })),
      ...(recentTips || []).map((t: any) => ({
        id: `tip-${t.id}`,
        title: t.place_name || "제보 장소",
        status: "제보", statusColor: "#5C7A4A",
        created_at: t.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);
    setRecentActivity(merged);

    setLoading(false);
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="ggk-body" style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#F7F3E8", overflow: "hidden" }}>
        <AdminNav active="dashboard" onRefresh={fetchStats} />

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", justifyContent: "center", scrollbarWidth: "thin" }}>
          <div style={{ width: "100%", maxWidth: "1200px", padding: "24px 28px 60px", boxSizing: "border-box" }}>

            {/* ── 웰컴 배너 — 시안 .hero 스펙: solid primaryDark, no radius ── */}
            <div style={{
              position: "relative", overflow: "hidden",
              background: "#48603A",
              padding: "48px 40px", marginBottom: 24,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div>
                <div className="ggk-logo" style={{ fontSize: 28, fontWeight: 700, color: "white", marginBottom: 8 }}>
                  안녕하세요, 관리자님
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.88)", lineHeight: 1.6 }}>
                  오늘도 같이가개 커뮤니티를 안전하게 지켜주셔서 감사합니다.
                </div>
              </div>
            </div>

            {/* ── 시안 .stat-grid 스펙: 아이콘 없는 4개 플랫 카드 ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <button
                className="dash-card"
                onClick={() => router.push("/admin/reports")}
                style={{ textAlign: "left", cursor: "pointer", background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: 20 }}
              >
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>미처리 신고</div>
                <div className="ggk-logo" style={{ fontSize: 26, fontWeight: 700, color: "#6B5240" }}>
                  {loading ? "–" : stats.pendingReports}
                </div>
              </button>
              <button
                className="dash-card"
                onClick={() => router.push("/admin/tips")}
                style={{ textAlign: "left", cursor: "pointer", background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: 20 }}
              >
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>미처리 제보</div>
                <div className="ggk-logo" style={{ fontSize: 26, fontWeight: 700, color: "#6B5240" }}>
                  {loading ? "–" : stats.pendingTips}
                </div>
              </button>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: 20 }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>등록된 장소</div>
                <div className="ggk-logo" style={{ fontSize: 26, fontWeight: 700, color: "#6B5240" }}>
                  {loading ? "–" : stats.totalPlaces}
                </div>
              </div>
              <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: 20 }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>가입 회원</div>
                <div className="ggk-logo" style={{ fontSize: 26, fontWeight: 700, color: "#6B5240" }}>
                  {loading ? "–" : stats.totalMembers}
                </div>
              </div>
            </div>

            {/* ── 시안 .panel "최근 제보·신고" ── */}
            <div style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: 24 }}>
              <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 14 }}>
                최근 제보·신고
              </div>
              {recentActivity.length === 0 ? (
                <div style={{ fontSize: 12, color: "#bbb", padding: "20px 0", textAlign: "center" }}>
                  {loading ? "불러오는 중..." : "최근 접수된 제보·신고가 없습니다."}
                </div>
              ) : (
                recentActivity.map((item, i) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 0",
                      borderTop: i === 0 ? "none" : "1px solid #f2f3f5",
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#333", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, marginRight: 12 }}>
                      {item.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
                        color: item.statusColor, background: item.statusColor + "22",
                      }}>
                        {item.status}
                      </span>
                      <span style={{ fontSize: 11, color: "#aaa" }}>
                        {new Date(item.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
