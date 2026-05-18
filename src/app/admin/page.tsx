"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuth, setIsAuth] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<number, any>>({});
  const [replies, setReplies] = useState<Record<number, any>>({});

  const handleLogin = () => {
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setIsAuth(true);
    } else {
      alert("비밀번호가 틀렸습니다.");
    }
  };

  const fetchReports = async () => {
    const { data: reportsData } = await supabase
      .from("reports")
      .select("*")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    if (!reportsData) return;

    const result = await Promise.all(
      reportsData.map(async (report) => {

        // 댓글 신고
        if (report.type === "review") {
          const { data: review } = await supabase
            .from("reviews")
            .select("*")
            .eq("id", report.target_id)
            .single();

          if (!review) return null;

          const { data: place } = await supabase
            .from("places")
            .select("name, address")
            .eq("id", review.place_id)
            .single();

          return {
            ...report,
            content: review.content,
            nickname: review.nickname,
            place_name: place?.name || "",
            place_address: place?.address || "",
          };
        }

        // 답글 신고
        if (report.type === "reply") {
          const { data: reply } = await supabase
            .from("review_replies")
            .select("*")
            .eq("id", report.target_id)
            .single();

          if (!reply) return null;

          const { data: review } = await supabase
            .from("reviews")
            .select("place_id")
            .eq("id", reply.review_id)
            .single();

          const { data: place } = await supabase
            .from("places")
            .select("name, address")
            .eq("id", review?.place_id)
            .single();

          return {
            ...report,
            content: reply.content,
            nickname: reply.nickname,
            place_name: place?.name || "",
            place_address: place?.address || "",
          };
        }

        return null;
      })
    );

    setReports(result.filter(Boolean));
  };

  useEffect(() => {
    if (isAuth) fetchReports();
  }, [isAuth]);

  const handleAdminDelete = async (type: "review" | "reply", targetId: number) => {
    if (type === "review") {
      await supabase
        .from("reviews")
        .update({
          is_admin_deleted: true,
          content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
        })
        .eq("id", targetId);
    } else {
      await supabase
        .from("review_replies")
        .update({
          is_admin_deleted: true,
          content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
        })
        .eq("id", targetId);
    }

    // 신고 처리 완료 표시
    await supabase
      .from("reports")
      .update({ reason: "처리완료" })
      .eq("type", type)
      .eq("target_id", targetId);

    alert("삭제되었습니다.");
    fetchReports();
  };

  if (!isAuth) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", flexDirection: "column", gap: "12px",
      }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800 }}>관리자 로그인</h1>
        <input
          type="password"
          placeholder="관리자 비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={{
            padding: "12px 16px", borderRadius: "10px",
            border: "1px solid #ddd", fontSize: "14px", width: "280px",
          }}
        />
        <button
          onClick={handleLogin}
          style={{
            padding: "12px 24px", borderRadius: "10px",
            border: "none", background: "#111", color: "white",
            fontWeight: 700, cursor: "pointer", width: "280px",
          }}
        >
          로그인
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "24px" }}>
        신고 관리
      </h1>

      {reports.length === 0 && (
        <p style={{ color: "#888" }}>신고된 내용이 없습니다.</p>
      )}

      {reports.map((report) => {
        const target =
          report.type === "review"
            ? reviews[report.target_id]
            : replies[report.target_id];

        const isDeleted = target?.is_admin_deleted;

        return (
          <div
            key={report.id}
            style={{
              padding: "20px", borderRadius: "16px",
              border: "1px solid #eee", marginBottom: "16px",
              background: isDeleted ? "#f9f9f9" : "white",
            }}
          >
            {/* 신고 정보 */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{
                fontSize: "12px", padding: "3px 10px",
                borderRadius: "99px", fontWeight: 700,
                background: report.type === "review" ? "#e8f0fe" : "#fef3c7",
                color: report.type === "review" ? "#1a73e8" : "#b45309",
              }}>
                {report.type === "review" ? "댓글" : "답글"}
              </span>
              <span style={{ fontSize: "12px", color: "#999" }}>
                {new Date(report.created_at).toLocaleString("ko-KR")}
              </span>
            </div>

            {/* 신고된 내용 */}
            <div style={{
              padding: "12px",
              background: "#f5f6f8",
              borderRadius: "10px",
              marginBottom: "12px",
              fontSize: "14px",
              color: "#333",
            }}>

              {/* 가게 정보 */}
              <div
                style={{
                  marginBottom: "12px",
                  padding: "10px 12px",
                  background: "white",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#111",
                    marginBottom: "4px",
                  }}
                >
                  {report.place_name}
                </div>

                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",
                  }}
                >
                  {report.place_address}
                </div>
              </div>

              {/* 작성자 */}
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                {target?.nickname || "알 수 없음"}
              </div>

              {/* 댓글 내용 */}
              <div>
                {target?.content || "삭제되었거나 찾을 수 없는 내용입니다."}
              </div>
            </div>

            {/* 처리 상태 / 삭제 버튼 */}
            {isDeleted || report.reason === "처리완료" ? (
              <span style={{ fontSize: "13px", color: "#22c55e", fontWeight: 700 }}>
                ✅ 처리완료
              </span>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>

                {/* 처리완료 */}
                <button
                  onClick={async () => {
                    await supabase
                      .from("reports")
                      .update({ is_resolved: true })
                      .eq("id", report.id);

                    fetchReports();
                  }}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "1px solid #ddd",
                    background: "white",
                    color: "#111",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  처리완료
                </button>

                {/* 삭제 */}
                <button
                  onClick={() =>
                    handleAdminDelete(report.type, report.target_id)
                  }
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#ef4444",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  삭제하기
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}