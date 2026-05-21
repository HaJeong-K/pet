"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, CheckCircle, MapPin, Clock, PawPrint } from "lucide-react";

export default function AdminTipsPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [tips, setTips]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [activeFilter, setActiveFilter] = useState<"pending" | "done">("pending");

  // 관리자 권한 체크
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login?redirect=/admin/tips"); return; }
      const { data: profile } = await supabase
        .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
      if (!profile?.is_admin) { router.push("/"); return; }
      setIsChecking(false);
      fetchTips();
    };
    checkAdmin();
  }, []);

  const fetchTips = async () => {
    setLoading(true);
    // reports 테이블에서 type이 "tip" 또는 제보 관련 데이터 가져오기
    // (실제 테이블 구조에 따라 컬럼명 조정 필요)
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("type", "tip")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("제보 불러오기 오류:", error);
      // type 컬럼이 없거나 다른 경우를 대비해 전체 제보 데이터를 가져오는 대안
      // 실제 테이블 구조에 맞게 아래 쿼리 중 하나를 사용하세요
      setLoading(false);
      return;
    }
    setTips(data || []);
    setLoading(false);
  };

  const handleMarkDone = async (tipId: number) => {
    await supabase.from("reports").update({ is_resolved: true }).eq("id", tipId);
    fetchTips();
  };

  const pendingTips = tips.filter((t) => !t.is_resolved);
  const doneTips    = tips.filter((t) => t.is_resolved);
  const displayTips = activeFilter === "pending" ? pendingTips : doneTips;

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
        @import url('https://fonts.googleapis.com/css2?family=Noto Sans+KR:wght@400;500;600;700&display=swap');
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
            <FileText size={18} color="#5C7CFA" />
            <div className="ggk-logo" style={{ fontSize: "16px", fontWeight: 800, color: "#111" }}>제보 관리</div>
          </div>
          {pendingTips.length > 0 && (
            <div
              style={{
                marginLeft: "auto",
                background: "#5C7CFA",
                color: "white",
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "999px",
              }}
            >
              미처리 {pendingTips.length}건
            </div>
          )}
        </div>

        {/* 필터 탭 */}
        <div style={{ margin: "16px 16px 12px", display: "flex", background: "#f0f1f3", borderRadius: "10px", padding: "3px" }}>
          {(["pending", "done"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "8px",
                border: "none",
                background: activeFilter === key ? "white" : "transparent",
                fontWeight: 700,
                fontSize: "12px",
                color: activeFilter === key ? "#111" : "#888",
                cursor: "pointer",
                boxShadow: activeFilter === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >
              {key === "pending" ? `📋 미처리 (${pendingTips.length})` : `✅ 처리완료 (${doneTips.length})`}
            </button>
          ))}
        </div>

        <div style={{ padding: "0 16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#bbb", fontSize: "13px" }}>불러오는 중...</div>
          ) : displayTips.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>
                {activeFilter === "pending" ? "📭" : "✅"}
              </div>
              <div style={{ fontSize: "14px", color: "#666", fontWeight: 600 }}>
                {activeFilter === "pending" ? "미처리 제보가 없습니다" : "처리완료된 제보가 없습니다"}
              </div>
            </div>
          ) : (
            displayTips.map((tip) => (
              <div
                key={tip.id}
                style={{
                  background: "white",
                  borderRadius: "16px",
                  border: `1px solid ${tip.is_resolved ? "#e8eaed" : "#c7d7fe"}`,
                  marginBottom: "12px",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  opacity: tip.is_resolved ? 0.75 : 1,
                }}
              >
                {/* 제보 헤더 */}
                <div
                  style={{
                    padding: "12px 16px",
                    background: tip.is_resolved ? "#f8f9fb" : "#eef2ff",
                    borderBottom: `1px solid ${tip.is_resolved ? "#e8eaed" : "#c7d7fe"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: tip.is_resolved ? "#888" : "#5C7CFA" }}>
                      {tip.is_resolved ? "✅ 처리완료" : "📋 처리 대기"}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#999" }}>
                    {new Date(tip.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>

                <div style={{ padding: "14px 16px" }}>
                  {/* 제보 상세 — reports 테이블 컬럼에 맞게 표시 */}
                  {/* 장소명 */}
                  {tip.place_name && (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "8px" }}>
                      <MapPin size={13} color="#5C7CFA" />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111" }}>{tip.place_name}</div>
                    </div>
                  )}

                  {/* 주소 */}
                  {tip.address && (
                    <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px", paddingLeft: "18px" }}>
                      {tip.address}
                    </div>
                  )}

                  {/* 카테고리 */}
                  {tip.category && (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "6px" }}>
                      <PawPrint size={12} color="#888" />
                      <span style={{ fontSize: "12px", color: "#666" }}>{tip.category}</span>
                    </div>
                  )}

                  {/* 운영시간 */}
                  {tip.hours && (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "6px" }}>
                      <Clock size={12} color="#888" />
                      <span style={{ fontSize: "12px", color: "#666" }}>{tip.hours}</span>
                    </div>
                  )}

                  {/* 내용/메모 */}
                  {(tip.content || tip.report_reason || tip.description) && (
                    <div
                      style={{
                        padding: "10px 12px",
                        background: "#f8f9fb",
                        borderRadius: "8px",
                        border: "1px solid #e8eaed",
                        marginTop: "8px",
                        marginBottom: "12px",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#aaa", fontWeight: 600, marginBottom: "4px" }}>제보 내용</div>
                      <div style={{ fontSize: "13px", color: "#333", lineHeight: 1.6 }}>
                        {tip.content || tip.report_reason || tip.description}
                      </div>
                    </div>
                  )}

                  {/* 제보자 */}
                  {(tip.nickname || tip.reporter_key) && (
                    <div style={{ fontSize: "11px", color: "#bbb", marginBottom: "10px" }}>
                      제보자: {tip.nickname || tip.reporter_key?.slice(0, 8) + "..."}
                    </div>
                  )}

                  {/* 처리완료 버튼 */}
                  {!tip.is_resolved && (
                    <button
                      onClick={() => handleMarkDone(tip.id)}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "none",
                        background: "linear-gradient(145deg, #5C7CFA, #4263eb)",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        fontFamily: "'Noto Sans KR', sans-serif",
                      }}
                    >
                      <CheckCircle size={14} />
                      처리완료 표시
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}