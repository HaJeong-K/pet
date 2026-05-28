"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Flag, CheckCircle, Trash2,
  AlertCircle, RefreshCw, MessageSquare, MessageCircle,
  MapPin, X,
} from "lucide-react";

/* ── 폰트/스타일 공통 ── */
const STYLES = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
  .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }
  .report-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .report-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10) !important; transform: translateY(-1px); }
  .action-btn { transition: all 0.15s ease; }
  .action-btn:hover { filter: brightness(0.94); }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
  ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
`;

const CATEGORY_LABEL: Record<string, string> = {
  spam:          "광고/도배",
  abuse:         "욕설/비방",
  sexual:        "음란물",
  hate:          "혐오 표현",
  etc:           "기타",
  closed:        "폐업",
  no_pets:       "반려동물 동반 불가",
  changed:       "업종 변경",
  wrong_info:    "가게 정보 오류",
  different:     "실제와 다름",
  duplicate:     "중복 등록",
  inappropriate: "허위/부적절 장소",
};

const CATEGORY_COLOR: Record<string, { bg: string; color: string }> = {
  spam:          { bg: "#fef3c7", color: "#92400e" },
  abuse:         { bg: "#fee2e2", color: "#991b1b" },
  sexual:        { bg: "#fce7f3", color: "#9d174d" },
  hate:          { bg: "#ede9fe", color: "#5b21b6" },
  etc:           { bg: "#f0f9ff", color: "#0369a1" },
  closed:        { bg: "#f1f5f9", color: "#475569" },
  no_pets:       { bg: "#fef9c3", color: "#854d0e" },
  changed:       { bg: "#eff6ff", color: "#1d4ed8" },
  wrong_info:    { bg: "#fef3c7", color: "#92400e" },
  different:     { bg: "#f0fdf4", color: "#15803d" },
  duplicate:     { bg: "#fdf4ff", color: "#7e22ce" },
  inappropriate: { bg: "#fff1f2", color: "#be123c" },
};

const TYPE_BADGE: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  place: {
    bg: "#fee2e2",
    color: "#dc2626",
    label: "장소 신고",
  },

  review: {
    bg: "#ffedd5",
    color: "#ea580c",
    label: "장소 댓글",
  },

  reply: {
    bg: "#fff7ed",
    color: "#f97316",
    label: "장소 답글",
  },

  community_post: {
    bg: "#dbeafe",
    color: "#2563eb",
    label: "게시글 신고",
  },

  community_comment: {
    bg: "#dbeafe",
    color: "#1d4ed8",
    label: "게시글 댓글",
  },

  community_reply: {
    bg: "#eff6ff",
    color: "#60a5fa",
    label: "게시글 답글",
  },
};

const formatDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuth,     setIsAuth]     = useState(false);
  const [reports,    setReports]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [activeFilter, setActiveFilter] = useState<"pending"|"done">("pending");
  const [resolvedReports, setResolvedReports] = useState<any[]>([]);

  /* ── 관리자 인증 ── */
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsChecking(false); router.push("/login?redirect=/admin/reports"); return; }
      const { data: profile } = await supabase
        .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
      if (!profile?.is_admin) { setIsChecking(false); router.push("/"); return; }
      setIsAuth(true);
      setIsChecking(false);
    };
    checkAdmin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (isAuth) {
      fetchReports();
      fetchResolvedReports();
    }
  }, [isAuth]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 미처리 신고 불러오기 ── */
  const fetchReports = async () => {
    setLoading(true);
    const { data: reportsData, error } = await supabase
      .from("reports")
      .select("*")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    if (error || !reportsData) { setLoading(false); return; }

    const enriched = await Promise.all(
      reportsData.map(async (report) => {
        if (report.type === "review") {
          const { data: review } = await supabase
            .from("reviews")
            .select("id, content, nickname, place_id, is_admin_deleted") // ★ 추가
            .eq("id", report.target_id).single();
          if (!review) return null;

          // ★ 이미 삭제된 댓글이면 DB 정리 후 스킵
          if (review.is_admin_deleted) {
            await supabase.from("reports")
              .update({ is_resolved: true })
              .eq("type", "review")
              .eq("target_id", report.target_id);
            return null;
          }

          const placeId = report.place_id || report.target_id;

          const { data: place } = await supabase
            .from("places")
            .select("name, address")
            .eq("id", placeId)
            .single();
          return { ...report, content: review.content, nickname: report.nickname || "—",
            place_name: place?.name || "—", place_address: place?.address || "—" };
        }
        if (report.type === "reply") {
          const { data: reply } = await supabase
            .from("review_replies")
            .select("id, content, nickname, review_id, is_admin_deleted") // ★ 추가
            .eq("id", report.target_id).single();
          if (!reply) return null;

          // ★ 이미 삭제된 답글이면 DB 정리 후 스킵
          if (reply.is_admin_deleted) {
            await supabase.from("reports")
              .update({ is_resolved: true })
              .eq("type", "reply")
              .eq("target_id", report.target_id);
            return null;
          }

          const { data: review } = await supabase
            .from("reviews").select("place_id").eq("id", reply.review_id).single();
          const { data: place } = await supabase
            .from("places").select("name, address").eq("id", review?.place_id).single();
          return { ...report, content: reply.content, nickname: reply.nickname,
            place_name: place?.name || "—", place_address: place?.address || "—" };
        }
        if (report.type === "place") {

          const placeId = report.place_id || report.target_id;

          // 장소 조회
          const { data: place } = await supabase
            .from("places")
            .select("name, address")
            .eq("id", placeId)
            .single();

          return {
            ...report,

            // 장소 신고 카테고리 표시
            content:
              CATEGORY_LABEL[report.report_category] ||
              report.report_category ||
              "장소 신고",

            // ★ reports 테이블에 저장된 닉네임 사용
            nickname: report.nickname || "—",

            place_name: place?.name || "—",
            place_address: place?.address || "—",
          };
        }
        if (report.type === "community_post") {
          const { data: post } = await supabase
            .from("community_posts")
            .select("id, title, content, nickname, board_id")
            .eq("id", report.target_id).single();
          if (!post) return null;
          return {
            ...report,
            content: post.content,
            nickname: post.nickname || "—",
            post_title: post.title,
            board_id: post.board_id,
            place_name: null,
            place_address: null,
          };
        }

        if (report.type === "community_comment" || report.type === "community_reply") {
          const { data: comment } = await supabase
            .from("community_comments")
            .select("id, content, nickname, post_id, parent_id, is_admin_deleted") // ★ is_admin_deleted 추가
            .eq("id", report.target_id).single();
          if (!comment) return null;

          // ★ 이미 관리자 삭제된 댓글이면 DB 정리 후 스킵
          if (comment.is_admin_deleted) {
            await supabase.from("reports")
              .update({ is_resolved: true })
              .eq("type", report.type)
              .eq("target_id", report.target_id);
            return null;
          }

          const { data: post } = await supabase
            .from("community_posts")
            .select("id, title, board_id")
            .eq("id", comment.post_id).single();
          return {
            ...report,
            content: comment.content,
            nickname: comment.nickname || "—",
            post_title: post?.title || "—",
            board_id: post?.board_id || "—",
            post_id: comment.post_id,
            place_name: null,
            place_address: null,
          };
        }
        return null;
      })
    );

    setReports(enriched.filter(Boolean));
    setLoading(false);
  };

  /* ── 처리완료 신고 불러오기 ── */
  const fetchResolvedReports = async () => {
    const { data: reportsData } = await supabase
      .from("reports")
      .select("*")
      .eq("is_resolved", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!reportsData) return;

    const enriched = await Promise.all(
      reportsData.map(async (report) => {
        if (report.type === "review") {
          const { data: review } = await supabase
            .from("reviews").select("id, content, nickname, place_id")
            .eq("id", report.target_id).single();
          if (!review) return { ...report, content: "(삭제됨)", nickname: "—", place_name: "—", place_address: "—" };
          const { data: place } = await supabase
            .from("places").select("name, address").eq("id", review.place_id).single();
          return { ...report, content: review.content, nickname: review.nickname, place_name: place?.name || "—", place_address: place?.address || "—" };
        }
        if (report.type === "reply") {
          const { data: reply } = await supabase
            .from("review_replies").select("id, content, nickname, review_id")
            .eq("id", report.target_id).single();
          if (!reply) return { ...report, content: "(삭제됨)", nickname: "—", place_name: "—", place_address: "—" };
          const { data: review } = await supabase.from("reviews").select("place_id").eq("id", reply.review_id).single();
          const { data: place } = await supabase.from("places").select("name, address").eq("id", review?.place_id).single();
          return { ...report, content: reply.content, nickname: reply.nickname, place_name: place?.name || "—", place_address: place?.address || "—" };
        }
        if (report.type === "place") {
            const placeId = report.place_id || report.target_id;

            // 장소 조회
            const { data: place } = await supabase
              .from("places")
              .select("name, address")
              .eq("id", placeId)
              .single();

            return {
              ...report,

              // 장소 신고 카테고리 표시
              content:
                CATEGORY_LABEL[report.report_category] ||
                report.report_category ||
                "장소 신고",

              // ★ reports 테이블에 저장된 닉네임 사용
              nickname: report.nickname || "—",

              place_name: place?.name || "—",
              place_address: place?.address || "—",
            };
        }
        if (report.type === "community_post") {
          const { data: post } = await supabase
            .from("community_posts")
            .select("id, title, content, nickname, board_id")
            .eq("id", report.target_id).single();
          return {
            ...report,
            content: post?.content || "(삭제됨)",
            nickname: post?.nickname || "—",
            post_title: post?.title || "(삭제됨)",
            board_id: post?.board_id || "—",
            place_name: null,
            place_address: null,
          };
        }

        if (report.type === "community_comment" || report.type === "community_reply") {
          const { data: comment } = await supabase
            .from("community_comments")
            .select("id, content, nickname, post_id")
            .eq("id", report.target_id).single();
          const { data: post } = comment
            ? await supabase.from("community_posts").select("id, title, board_id").eq("id", comment.post_id).single()
            : { data: null };
          return {
            ...report,
            content: comment?.content || "(삭제됨)",
            nickname: comment?.nickname || "—",
            post_title: post?.title || "(삭제됨)",
            board_id: post?.board_id || "—",
            place_name: null,
            place_address: null,
          };
        }
        return null;
      })
    );

    setResolvedReports(enriched.filter(Boolean));
  };

  /* ── 관리자 삭제 ── */
  const handleAdminDelete = async (type: "review"|"reply", targetId: string, reportId: number) => {
    if (!confirm("해당 내용을 삭제하시겠습니까?")) return;

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

    // ★ 해당 target_id의 모든 신고를 한꺼번에 처리 (id 하나만 처리하던 것 수정)
    await supabase.from("reports")
      .update({ is_resolved: true })
      .eq("type", type)
      .eq("target_id", targetId);

    const movedItems = reports.filter((r) => r.target_id === targetId);
    if (movedItems.length > 0) {
      setReports((prev) => prev.filter((r) => r.target_id !== targetId));
      setResolvedReports((prev) => [
        ...movedItems.map((r) => ({ ...r, is_resolved: true })),
        ...prev,
      ]);
    }
  };

  /* ── 커뮤니티 댓글/답글 삭제 ── */
  const handleAdminDeleteCommunity = async (
    type: "community_comment" | "community_reply",
    targetId: string
  ) => {
    if (!confirm("해당 내용을 삭제하시겠습니까?")) return;

    // ★ 하드 삭제 → 소프트 삭제로 변경 (장소 댓글/답글과 동일한 구조)
    await supabase.from("community_comments").update({
      is_admin_deleted: true,
      content: "부적절한 내용으로 관리자에 의해 삭제되었습니다.",
    }).eq("id", targetId);

    // ★ 해당 target_id의 모든 신고를 일괄 처리완료
    await supabase.from("reports")
      .update({ is_resolved: true })
      .eq("type", type)
      .eq("target_id", targetId);

    const movedItems = reports.filter(r => r.target_id === targetId);
    setReports(prev => prev.filter(r => r.target_id !== targetId));
    setResolvedReports(prev => [
      ...movedItems.map(r => ({ ...r, is_resolved: true })),
      ...prev,
    ]);
  };

  /* ── 커뮤니티 게시글 삭제 ── */
  const handleAdminDeletePost = async (targetId: string) => {
    if (!confirm("게시글을 삭제하시겠습니까?\n댓글도 함께 삭제됩니다.")) return;

    await supabase.from("community_comments").delete().eq("post_id", targetId);
    await supabase.from("community_posts").delete().eq("id", targetId);

    await supabase.from("reports")
      .update({ is_resolved: true })
      .eq("type", "community_post")
      .eq("target_id", targetId);

    const movedItems = reports.filter(r => r.target_id === targetId);
    setReports(prev => prev.filter(r => r.target_id !== targetId));
    setResolvedReports(prev => [
      ...movedItems.map(r => ({ ...r, is_resolved: true })),
      ...prev,
    ]);
  };

  const handleAdminDeletePlace = async (placeId: string | number) => {
    if (!confirm(
      `이 장소를 완전히 삭제하시겠습니까?\n\n` +
      `⚠️ 댓글·답글·이미지·반응 데이터가\n` +
      `모두 삭제되며 복구가 불가능합니다.`
    )) return;

    try {
      // 현재 세션에서 access_token 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("로그인이 필요합니다.");
        return;
      }

      const res = await fetch("/api/admin/delete-place", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ placeId: Number(placeId) }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("API 오류:", data);
        alert(`삭제 실패: ${data.error || "알 수 없는 오류"}`);
        return;
      }

      // ── UI 업데이트: 이 장소 관련 신고 제거
      const removed = reports.filter(
        (r) => String(r.place_id) === String(placeId)
      );
      setReports((prev) =>
        prev.filter((r) => String(r.place_id) !== String(placeId))
      );
      setResolvedReports((prev) => [
        ...removed.map((r) => ({ ...r, is_resolved: true })),
        ...prev,
      ]);

      alert("장소가 완전히 삭제되었습니다.");

    } catch (err: any) {
      console.error("장소 삭제 중 예외:", err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  /* ── 보류 처리 ── */
  const handleResolve = async (reportId: number) => {
    await supabase.from("reports").update({ is_resolved: true }).eq("id", reportId);

    // 낙관적 업데이트: 미처리에서 제거하고 처리완료로 이동
    const moved = reports.find((r) => r.id === reportId);
    if (moved) {
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setResolvedReports((prev) => [{ ...moved, is_resolved: true }, ...prev]);
    }
  };

  const handleDeleteResolved = async (reportId: number) => {
    if (!confirm("해당 신고 기록을 완전히 삭제하시겠습니까?")) return;

    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      alert("삭제 실패");
      console.error(error);
      return;
    }

    // 화면에서도 즉시 제거
    setResolvedReports((prev) =>
      prev.filter((r) => r.id !== reportId)
    );
  };

  if (isChecking) {
    return (
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f2f5" }}>
        <div className="ggk-body" style={{ fontSize:13, color:"#888" }}>권한 확인 중...</div>
      </div>
    );
  }

  const displayReports = activeFilter === "pending" ? reports : resolvedReports;

  return (
    <>
      <style>{STYLES}</style>

      {/* 전체 페이지: 중앙 정렬 컨테이너 */}
      <div className="ggk-body" style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#f0f2f5",
        overflow: "hidden",
        alignItems: "center",      // 수평 중앙
      }}>

        {/* ── 내부 콘텐츠: 최대 폭 480px ── */}
        <div style={{
          width: "100%",
          maxWidth: "480px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}>

          {/* ── 헤더 ── */}
          <div style={{
            background: "white",
            borderBottom: "1px solid #e8eaed",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexShrink: 0,
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
          }}>
            <button onClick={() => router.push("/")} style={{ border:"none", background:"transparent", cursor:"pointer", padding:4, borderRadius:8, display:"flex" }}>
              <ArrowLeft size={20} color="#444" />
            </button>

            <div style={{ display:"flex", alignItems:"center", gap:"8px", flex:1 }}>
              <div style={{ width:32, height:32, borderRadius:10, background:"#fee2e2", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Flag size={16} color="#ef4444" />
              </div>
              <div className="ggk-logo" style={{ fontSize:16, fontWeight:800, color:"#111" }}>신고 관리</div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              {reports.length > 0 && (
                <div style={{ background:"#ef4444", color:"white", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999 }}>
                  미처리 {reports.length}건
                </div>
              )}
              <button
                onClick={() => { fetchReports(); fetchResolvedReports(); }}
                style={{ border:"none", background:"#f5f6f8", borderRadius:8, padding:"6px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, color:"#555" }}
              >
                <RefreshCw size={13} color="#888" />
                새로고침
              </button>
            </div>
          </div>

          {/* ── 필터 탭 ── */}
          <div style={{ padding:"12px 16px 8px", flexShrink:0 }}>
            <div style={{ display:"flex", background:"#e8eaed", borderRadius:12, padding:"3px", gap:"3px" }}>
              {([
                { key:"pending", label:"미처리",  count: reports.length,         icon: AlertCircle,  color:"#ef4444" },
                { key:"done",    label:"처리완료", count: resolvedReports.length, icon: CheckCircle,  color:"#22c55e" },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className="ggk-body"
                    style={{
                      flex:1, padding:"9px 14px", borderRadius:10, border:"none",
                      background: isActive ? "white" : "transparent",
                      fontWeight:700, fontSize:12,
                      color: isActive ? "#111" : "#888",
                      cursor:"pointer",
                      boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                      transition:"all 0.15s ease",
                      display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                    }}
                  >
                    <Icon size={13} color={isActive ? tab.color : "#aaa"} />
                    {tab.label}
                    <span style={{
                      fontSize:10, fontWeight:800, padding:"1px 7px", borderRadius:999,
                      background: isActive ? (tab.key === "pending" ? "#fee2e2" : "#dcfce7") : "#f0f2f5",
                      color: isActive ? (tab.key === "pending" ? "#dc2626" : "#16a34a") : "#999",
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 리스트 영역 ── */}
          <div style={{
            flex:1,
            minHeight:0,
            overflowY:"auto",
            padding:"0 14px 120px",
            scrollbarWidth:"thin",
            scrollbarColor:"#d1d5db transparent",
          }}>

            {loading ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#bbb", fontSize:13 }}>불러오는 중...</div>
            ) : displayReports.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ width:64, height:64, borderRadius:20, background: activeFilter === "pending" ? "#fee2e2" : "#dcfce7", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                  {activeFilter === "pending"
                    ? <Flag size={28} color="#fca5a5" />
                    : <CheckCircle size={28} color="#22c55e" />}
                </div>
                <div className="ggk-logo" style={{ fontSize:15, fontWeight:800, color:"#222", marginBottom:6 }}>
                  {activeFilter === "pending" ? "미처리 신고가 없습니다" : "처리완료 내역이 없습니다"}
                </div>
                <div style={{ fontSize:12, color:"#999" }}>
                  {activeFilter === "pending" ? "모든 신고가 처리되었습니다 🎉" : "처리된 신고가 여기에 표시됩니다"}
                </div>
              </div>
            ) : (
              displayReports.map((report) => {
                const catStyle = CATEGORY_COLOR[report.report_category] || { bg:"#f5f6f8", color:"#666" };
                return (
                  <div
                    key={report.id}
                    className="report-card"
                    onClick={() => {
                      // 커뮤니티 이동
                      if (
                        report.type === "community_post" ||
                        report.type === "community_comment" ||
                        report.type === "community_reply"
                      ) {
                        router.push(`/community/${report.post_id || report.target_id}`);
                        return;
                      }

                      // 장소 이동
                      if (
                        report.type === "place" ||
                        report.type === "review" ||
                        report.type === "reply"
                      ) {
                        router.push(`/place/${report.place_id}`);
                      }
                    }}
                    style={{
                      cursor: "pointer",
                      background:"white",
                      borderRadius:18,
                      border:`1.5px solid ${activeFilter === "pending" ? "#fecaca" : "#e8eaed"}`,
                      marginBottom:10,
                      overflow:"hidden",
                      boxShadow:"0 2px 10px rgba(0,0,0,0.05)",
                      opacity: activeFilter === "done" ? 0.82 : 1,
                    }}
                  >
                    {/* 카드 헤더 */}
                    <div style={{
                      padding:"10px 14px",
                      background: activeFilter === "pending" ? "#fef2f2" : "#f8fafc",
                      borderBottom:`1px solid ${activeFilter === "pending" ? "#fecaca" : "#e8eaed"}`,
                      display:"flex", alignItems:"center", justifyContent:"space-between", gap:8,
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                        {/* 타입 뱃지 */}
                        {(() => {
                          const t = TYPE_BADGE[report.type] || { bg:"#f5f6f8", color:"#666", label: report.type };
                          return (
                            <span style={{
                              fontSize:10, padding:"3px 8px", borderRadius:999, fontWeight:700,
                              background: t.bg, color: t.color,
                              display:"flex", alignItems:"center", gap:3,
                            }}>
                              {report.type === "community_post"    && <MessageSquare size={9} />}
                              {report.type === "community_comment" && <MessageCircle size={9} />}
                              {report.type === "community_reply"   && <MessageCircle size={9} />}
                              {report.type === "review"            && <MessageSquare size={9} />}
                              {report.type === "reply"             && <MessageCircle size={9} />}
                              {report.type === "place"             && <Flag size={9} />}
                              {t.label}
                            </span>
                          );
                        })()}

                        {report.report_category && (
                          <span style={{
                            fontSize:10, padding:"3px 8px", borderRadius:999, fontWeight:700,
                            background: catStyle.bg, color: catStyle.color,
                          }}>
                            {CATEGORY_LABEL[report.report_category] || report.report_category}
                          </span>
                        )}

                        {activeFilter === "done" && (
                          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:999, fontWeight:700, background:"#dcfce7", color:"#15803d", display:"flex", alignItems:"center", gap:3 }}>
                            <CheckCircle size={9} /> 처리완료
                          </span>
                        )}
                      </div>

                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{
                          fontSize:10,
                          color:"#aaa",
                          whiteSpace:"nowrap",
                          flexShrink:0
                        }}>
                          {formatDate(report.created_at)}
                        </span>

                        {activeFilter === "done" && (
                          <button
                            onClick={() => handleDeleteResolved(report.id)}
                            style={{
                              width:20,
                              height:20,
                              border:"none",
                              borderRadius:"50%",
                              background:"#f3f4f6",
                              cursor:"pointer",
                              display:"flex",
                              alignItems:"center",
                              justifyContent:"center",
                              padding:0,
                            }}
                          >
                            <X size={11} color="#888" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ padding:"12px 14px" }}>
                      {/* ✅ 장소 or 게시글 정보 */}
                      <div style={{
                        padding:"9px 12px", background:"#f8fafc", borderRadius:11,
                        border:"1px solid #e8eaed", marginBottom:10,
                        display:"flex", alignItems:"flex-start", gap:8,
                      }}>
                        <div style={{ width:26, height:26, borderRadius:7,
                          background: report.place_name ? "#f3e8ff" : "#ede9fe",
                          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                          {report.place_name
                            ? <MapPin size={12} color="#8b5cf6" />
                            : <MessageSquare size={12} color="#6d28d9" />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div className="ggk-logo" style={{ fontSize:13, fontWeight:700, color:"#111", marginBottom:1 }}>
                            {report.place_name || report.post_title || "—"}
                          </div>
                          <div style={{ fontSize:11, color:"#888", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {report.place_address || (report.board_id ? `${report.board_id} 게시판` : "—")}
                          </div>
                        </div>
                      </div>

                      {/* 신고된 내용 */}
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:10, color:"#aaa", fontWeight:700, letterSpacing:"0.3px", marginBottom:4, textTransform:"uppercase" }}>신고된 내용</div>
                        <div style={{ padding:"10px 12px", background:"#fafafa", borderRadius:10, border:"1px solid #eee" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#333", marginBottom:4 }}>{report.nickname}</div>
                          {(report.type === "community_comment" ||
                            report.type === "community_reply") ? (

                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                              }}
                            >
                              {/* 부모 게시글 카드 */}
                              <div
                                style={{
                                  padding: "12px",
                                  borderRadius: "12px",
                                  background: "#f8fafc",
                                  border: "1px solid #e5e7eb",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: "#888",
                                    marginBottom: "4px",
                                  }}
                                >
                                  게시글
                                </div>

                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 700,
                                    color: "#111",
                                    lineHeight: 1.5,
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {report.post_title || "(삭제된 게시글)"}
                                </div>
                              </div>

                              {/* 신고된 댓글/답글 */}
                              <div
                                style={{
                                  padding: "12px",
                                  borderRadius: "12px",
                                  background: "white",
                                  border: "1px solid #eee",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: "#999",
                                    marginBottom: "5px",
                                  }}
                                >
                                  신고된 내용
                                </div>

                                <div
                                  style={{
                                    color: "#555",
                                    lineHeight: 1.7,
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {report.content}
                                </div>
                              </div>
                            </div>

                          ) : (

                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                              }}
                            >
                              {(report.type === "place" ||
                                report.type === "review" ||
                                report.type === "reply") && (

                                <div
                                  style={{
                                    padding: "12px",
                                    borderRadius: "12px",
                                    background: "#f8fafc",
                                    border: "1px solid #e5e7eb",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      color: "#888",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    장소
                                  </div>

                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 700,
                                      color: "#111",
                                      lineHeight: 1.5,
                                      wordBreak: "break-word",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    {report.place_name || "(삭제된 장소)"}
                                  </div>

                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#888",
                                      lineHeight: 1.4,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {report.place_address || ""}
                                  </div>
                                </div>
                              )}

                              <div
                                style={{
                                  padding: "12px",
                                  borderRadius: "12px",
                                  background: "white",
                                  border: "1px solid #eee",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: "#999",
                                    marginBottom: "5px",
                                  }}
                                >
                                  신고된 내용
                                </div>

                                <div
                                  style={{
                                    color: "#555",
                                    lineHeight: 1.7,
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {report.content}
                                </div>
                              </div>
                            </div>

                          )}
                        </div>
                      </div>

                      {/* 신고 사유 */}
                      {report.report_reason && (
                        <div style={{
                          padding:"9px 12px", background:"#fffbeb", borderRadius:10,
                          border:"1px solid #fde68a", marginBottom:12,
                          display:"flex", gap:8, alignItems:"flex-start",
                        }}>
                          <AlertCircle size={13} color="#f59e0b" style={{ flexShrink:0, marginTop:1 }} />
                          <div>
                            <div style={{ fontSize:10, color:"#92400e", fontWeight:700, marginBottom:2 }}>신고 사유</div>
                            <div style={{ fontSize:12, color:"#78350f", lineHeight:1.6 }}>{report.report_reason}</div>
                          </div>
                        </div>
                      )}

                      {activeFilter === "pending" && (
                        <div style={{ display:"flex", gap:7 }}>
                          {/* 보류 */}
                          <button className="action-btn ggk-body" onClick={() => handleResolve(report.id)}
                            style={{ flex:1, padding:"10px 12px", borderRadius:11, border:"1px solid #e8eaed",
                              background:"white", color:"#555", fontWeight:700, cursor:"pointer", fontSize:12,
                              display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                              fontFamily:"'Noto Sans KR', sans-serif" }}>
                            <CheckCircle size={14} color="#22c55e" />보류
                          </button>

                          {/* 장소 댓글/답글 삭제 */}
                          {(report.type === "review" || report.type === "reply") && (
                            <button className="action-btn ggk-body"
                              onClick={() => handleAdminDelete(report.type, report.target_id, report.id)}
                              style={{ flex:1, padding:"10px 12px", borderRadius:11, border:"none",
                                background:"linear-gradient(135deg,#ef4444,#dc2626)", color:"white",
                                fontWeight:700, cursor:"pointer", fontSize:12,
                                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                boxShadow:"0 2px 8px rgba(239,68,68,0.30)",
                                fontFamily:"'Noto Sans KR', sans-serif" }}>
                              <Trash2 size={13} />내용 삭제
                            </button>
                          )}

                          {/* 장소 삭제 */}
                          {report.type === "place" && (
                            <button className="action-btn ggk-body"
                              onClick={() => handleAdminDeletePlace(report.place_id)}
                              style={{ flex:1, padding:"10px 12px", borderRadius:11, border:"none",
                                background:"linear-gradient(135deg,#7c3aed,#6d28d9)", color:"white",
                                fontWeight:700, cursor:"pointer", fontSize:12,
                                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                boxShadow:"0 2px 8px rgba(109,40,217,0.30)",
                                fontFamily:"'Noto Sans KR', sans-serif" }}>
                              <Trash2 size={13} />장소 삭제
                            </button>
                          )}

                          {/* 커뮤니티 댓글/답글 삭제 */}
                          {(report.type === "community_comment" || report.type === "community_reply") && (
                            <button className="action-btn ggk-body"
                              onClick={() => handleAdminDeleteCommunity(report.type, report.target_id)}
                              style={{ flex:1, padding:"10px 12px", borderRadius:11, border:"none",
                                background:"linear-gradient(135deg,#ef4444,#dc2626)", color:"white",
                                fontWeight:700, cursor:"pointer", fontSize:12,
                                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                boxShadow:"0 2px 8px rgba(239,68,68,0.30)",
                                fontFamily:"'Noto Sans KR', sans-serif" }}>
                              <Trash2 size={13} />내용 삭제
                            </button>
                          )}

                          {/* 커뮤니티 게시글 삭제 */}
                          {report.type === "community_post" && (
                            <button className="action-btn ggk-body"
                              onClick={() => handleAdminDeletePost(report.target_id)}
                              style={{ flex:1, padding:"10px 12px", borderRadius:11, border:"none",
                                background:"linear-gradient(135deg,#7c3aed,#6d28d9)", color:"white",
                                fontWeight:700, cursor:"pointer", fontSize:12,
                                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                boxShadow:"0 2px 8px rgba(109,40,217,0.30)",
                                fontFamily:"'Noto Sans KR', sans-serif" }}>
                              <Trash2 size={13} />게시글 삭제
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}