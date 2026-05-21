"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flag, CheckCircle, Trash2, AlertCircle } from "lucide-react";

export default function AdminReportsPage() {
  const router = useRouter();
  const [isAuth, setIsAuth]     = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [reports, setReports]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);

  // 관리자 권한 체크
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login?redirect=/admin/reports"); return; }
      const { data: profile } = await supabase
        .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
      if (!profile?.is_admin) { router.push("/"); return; }
      setIsAuth(true);
      setIsChecking(false);
    };
    checkAdmin();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    const { data: reportsData } = await supabase
      .from("reports")
      .select("*")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    if (!reportsData) { setLoading(false); return; }

    const result = await Promise.all(
      reportsData.map(async (report) => {
        if (report.type === "review") {
          const { data: review } = await supabase
            .from("reviews").select("*").eq("id", report.target_id).single();
          if (!review) return null;
          const { data: place } = await supabase
            .from("places").select("name, address").eq("id", review.place_id).single();
          return { ...report, content: review.content, nickname: review.nickname, place_name: place?.name || "", place_address: place?.address || "" };
        }
        if (report.type === "reply") {
          const { data: reply } = await supabase
            .from("review_replies").select("*").eq("id", report.target_id).single();
          if (!reply) return null;
          const { data: review } = await supabase
            .from("reviews").select("place_id").eq("id", reply.review_id).single();
          const { data: place } = await supabase
            .from("places").select("name, address").eq("id", review?.place_id).single();
          return { ...report, content: reply.content, nickname: reply.nickname, place_name: place?.name || "", place_address: place?.address || "" };
        }
        return null;
      })
    );
    setReports(result.filter(Boolean));
    setLoading(false);
  };

  useEffect(() => {
    if (isAuth) fetchReports();
  }, [isAuth]);

  const handleAdminDelete = async (type: "review" | "reply", targetId: number) => {
    if (type === "review") {
      await supabase.from("reviews").update({
        is_admin_deleted: true,
        content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
      }).eq("id", targetId);
    } else {
      await supabase.from("review_replies").update({
        is_admin_deleted: true,
        content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
      }).eq("id", targetId);
    }
    await supabase.from("reports").update({ is_resolved: true }).eq("type", type).eq("target_id", targetId);
    fetchReports();
  };

  const handleResolve = async (reportId: number) => {
    await supabase.from("reports").update({ is_resolved: true }).eq("id", reportId);
    fetchReports();
  };

  const CATEGORY_LABEL: Record<string, string> = {
    spam: "광고/도배",
    abuse: "욕설/비방",
    sexual: "음란물",
    hate: "혐오 표현",
    etc: "기타",
  };

  if (isChecking) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f6f8" }}>
        <div style={{ fontSize: "13px", color: "#888" }}>확인 중...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
        .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
      `}</style>

      <div className="ggk-body" style={{ minHeight: "100vh", background: "#f5f6f8", paddingBottom: "80px" }}>

        {/* 헤더 */}
        <div
          style={{
            background: "white",
            borderBottom: "1px solid #e8eaed",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <button
            onClick={() => router.push("/")}
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
          >
            <ArrowLeft size={20} color="#444" />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Flag size={18} color="#ef4444" />
            <div className="ggk-logo" style={{ fontSize: "16px", fontWeight: 800, color: "#111" }}>신고 관리</div>
          </div>
          {/* 미처리 건수 뱃지 */}
          {reports.length > 0 && (
            <div
              style={{
                marginLeft: "auto",
                background: "#ef4444",
                color: "white",
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "999px",
              }}
            >
              {reports.length}건
            </div>
          )}
        </div>

        <div style={{ padding: "16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#bbb", fontSize: "13px" }}>불러오는 중...</div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <CheckCircle size={40} color="#22c55e" style={{ marginBottom: "12px" }} />
              <div style={{ fontSize: "14px", color: "#666", fontWeight: 600 }}>처리되지 않은 신고가 없습니다</div>
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                style={{
                  background: "white",
                  borderRadius: "16px",
                  border: "1px solid #e8eaed",
                  marginBottom: "12px",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                }}
              >
                {/* 신고 헤더 */}
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#fef2f2",
                    borderBottom: "1px solid #fecaca",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "99px",
                        fontWeight: 700,
                        background: report.type === "review" ? "#e8f0fe" : "#fef3c7",
                        color: report.type === "review" ? "#1a73e8" : "#b45309",
                      }}
                    >
                      {report.type === "review" ? "댓글" : "답글"}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "99px",
                        fontWeight: 700,
                        background: "#fee2e2",
                        color: "#dc2626",
                      }}
                    >
                      {CATEGORY_LABEL[report.report_category] || report.report_category}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#999" }}>
                    {new Date(report.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {/* 장소 */}
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "#f8f9fb",
                      borderRadius: "10px",
                      marginBottom: "10px",
                      border: "1px solid #e8eaed",
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#111", marginBottom: "2px" }}>{report.place_name}</div>
                    <div style={{ fontSize: "11px", color: "#888" }}>{report.place_address}</div>
                  </div>

                  {/* 신고된 내용 */}
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: 600 }}>신고된 내용</div>
                    <div style={{ fontSize: "12px", color: "#222", fontWeight: 700, marginBottom: "3px" }}>{report.nickname}</div>
                    <div style={{ fontSize: "13px", color: "#444", lineHeight: 1.6 }}>{report.content}</div>
                  </div>

                  {/* 신고 사유 */}
                  {report.report_reason && (
                    <div
                      style={{
                        padding: "10px 12px",
                        background: "#fffbeb",
                        borderRadius: "8px",
                        border: "1px solid #fde68a",
                        marginBottom: "12px",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#92400e", fontWeight: 600, marginBottom: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <AlertCircle size={11} /> 신고 사유
                      </div>
                      <div style={{ fontSize: "12px", color: "#78350f" }}>{report.report_reason}</div>
                    </div>
                  )}

                  {/* 액션 버튼 */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleResolve(report.id)}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "10px",
                        border: "1px solid #e8eaed",
                        background: "white",
                        color: "#444",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        fontFamily: "'Noto Sans KR', sans-serif",
                      }}
                    >
                      <CheckCircle size={14} color="#22c55e" />
                      처리완료
                    </button>
                    <button
                      onClick={() => handleAdminDelete(report.type, report.target_id)}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "10px",
                        border: "none",
                        background: "#ef4444",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "5px",
                        fontFamily: "'Noto Sans KR', sans-serif",
                      }}
                    >
                      <Trash2 size={14} />
                      삭제하기
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}