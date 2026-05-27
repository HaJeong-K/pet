"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Heart, Eye, Send, Mail, X,
  ChevronLeft, ChevronRight,
  MoreVertical, Pencil, Trash2, AlertCircle, ThumbsUp, ThumbsDown,
} from "lucide-react";

const ADMIN_EMAIL = "infoker12@naver.com";

const FONT_STYLE = `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css');
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .ggk-logo { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; }
  .ggk-body  { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif; }

  /* 세로 스크롤 */
  .post-scroll { overflow-y: auto; }
  .post-scroll::-webkit-scrollbar { width: 4px; }
  .post-scroll::-webkit-scrollbar-thumb { background: #ddd; border-radius: 999px; }

  /* 이미지 가로 스크롤 */
  .img-scroll { overflow-x: auto; }
  .img-scroll::-webkit-scrollbar { height: 4px; }
  .img-scroll::-webkit-scrollbar-thumb { background: #ddd; border-radius: 999px; }

  /* 이미지 hover 효과 */
  .img-thumb { cursor: zoom-in; transition: opacity 0.15s; }
  .img-thumb:hover { opacity: 0.85; }

  /* 이미지 모달 화살표 버튼 */
  .modal-nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px; height: 40px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.18);
    backdrop-filter: blur(6px);
    color: white;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
    z-index: 10;
  }
  .modal-nav-btn:hover { background: rgba(255,255,255,0.32); }
  .modal-nav-btn:disabled { opacity: 0.25; cursor: default; }
`;

import { supabase } from "@/lib/supabase";

interface Post {
  id: string;
  title: string;
  content: string;
  board_id: string;
  post_type?: string | null;
  image_urls?: string[];
  nickname: string;
  avatar_url?: string | null;
  created_at: string;
  likes?: number;
  views?: number;
}

interface CommentItem {
  id: string;
  content: string;
  nickname: string;
  avatar_url?: string | null;
  parent_id: string | null;
  created_at: string;
}

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params?.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [comment, setComment] = useState("");
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // ── 게시글 메뉴 & 편집/신고
  const [showPostMenu,       setShowPostMenu]       = useState(false);
  const [editingPost,        setEditingPost]         = useState(false);
  const [editPostTitle,      setEditPostTitle]       = useState("");
  const [editPostContent,    setEditPostContent]     = useState("");
  const [deletingPost,       setDeletingPost]        = useState(false);
  const [postReportOpen,     setPostReportOpen]      = useState(false);
  const [postReportCategory, setPostReportCategory] = useState("");
  const [postReportReason,   setPostReportReason]   = useState("");

  // ── 댓글/답글 메뉴 & 편집/삭제/신고
  const [openedCommentMenuId,  setOpenedCommentMenuId]  = useState<string | null>(null);
  const [editingCommentId,     setEditingCommentId]     = useState<string | null>(null);
  const [editCommentContent,   setEditCommentContent]   = useState("");
  const [deletingCommentId,    setDeletingCommentId]    = useState<string | null>(null);

  const [openedReplyMenuId2,   setOpenedReplyMenuId2]   = useState<string | null>(null);
  const [editingReplyId2,      setEditingReplyId2]      = useState<string | null>(null);
  const [editReplyContent2,    setEditReplyContent2]    = useState("");
  const [deletingReplyId2,     setDeletingReplyId2]     = useState<string | null>(null);

  const [commentReportOpen,    setCommentReportOpen]    = useState(false);
  const [commentReportTargetId, setCommentReportTargetId] = useState<string | null>(null);
  const [commentReportType,    setCommentReportType]    = useState<"comment"|"reply">("comment");
  const [commentReportCategory,setCommentReportCategory]= useState("");
  const [commentReportReason,  setCommentReportReason] = useState("");

  // 이미지 확대 모달: 인덱스로 관리 (prev/next 지원)
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const [session, setSession] = useState<any>(null);

  // ─────────────────────────────
  // 게시글 불러오기
  // ─────────────────────────────
  const fetchPost = async () => {
    const { data } = await supabase
      .from("community_posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (data) {
      setPost(data);
      await supabase
        .from("community_posts")
        .update({ views: (data.views || 0) + 1 })
        .eq("id", postId);
    }
  };

  // ─────────────────────────────
  // 댓글 불러오기
  // ─────────────────────────────
  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("community_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("댓글 fetch 에러:", JSON.stringify(error, null, 2));
      alert(error.message || "댓글을 불러오지 못했습니다.");
      return;
    }
    setComments(data || []);
  };

  // ─────────────────────────────
  // 댓글 작성
  // ─────────────────────────────
  const handleComment = async () => {
    if (!session) return;
    if (!comment.trim()) return;

    const user = session.user;
    const { error } = await supabase
      .from("community_comments")
      .insert([
        {
          post_id: postId,
          parent_id: null,
          author_auth_key: user.id,
          nickname:
            user.user_metadata?.nickname ||
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "사용자",
          avatar_url: user.user_metadata?.avatar_url || null,
          content: comment.trim(),
        },
      ]);

    if (error) { console.error(error); return; }
    setComment("");
    fetchComments();
  };

  // ─────────────────────────────
  // 답글 작성
  // ─────────────────────────────
  const handleReply = async (parentId: string) => {
    if (!session) return;
    const value = replyMap[parentId];
    if (!value?.trim()) return;

    const user = session.user;
    const { error } = await supabase
      .from("community_comments")
      .insert([
        {
          post_id: postId,
          parent_id: parentId,
          author_auth_key: user.id,
          nickname:
            user.user_metadata?.nickname ||
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "사용자",
          avatar_url: user.user_metadata?.avatar_url || null,
          content: value.trim(),
        },
      ]);

    if (error) { console.error(error); return; }
    setReplyMap((prev) => ({ ...prev, [parentId]: "" }));
    setReplyTarget(null);
    fetchComments();
  };

  // ── 게시글 수정
  const handlePostEdit = async () => {
    if (!editPostTitle.trim() || !editPostContent.trim()) return;
    const { error } = await supabase
      .from("community_posts")
      .update({ title: editPostTitle, content: editPostContent })
      .eq("id", postId);
    if (error) { console.error(error); return; }
    setPost((prev: any) => prev ? { ...prev, title: editPostTitle, content: editPostContent } : prev);
    setEditingPost(false);
  };

  // ── 게시글 삭제
  const handlePostDelete = async () => {
    if (!confirm("게시글을 삭제하시겠습니까?")) return;
    await supabase.from("community_posts").delete().eq("id", postId);
    alert("삭제되었습니다.");
    router.back();
  };

  // ── 게시글 신고 제출
  const handlePostReport = async () => {
    if (!postReportCategory || !postReportReason.trim()) return;
    const userKey = session?.user?.id || (() => {
      let k = localStorage.getItem("user_key");
      if (!k) { k = crypto.randomUUID(); localStorage.setItem("user_key", k); }
      return k;
    })();
    await supabase.from("reports").insert([{
      type: "community_post",
      target_id: String(postId),
      reporter_key: userKey,
      reason: postReportCategory,
      report_reason: postReportReason,
    }]);
    alert("신고가 접수되었습니다.");
    setPostReportOpen(false);
    setPostReportCategory(""); setPostReportReason("");
  };

  // ── 댓글 수정
  const handleCommentEdit = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    const { error } = await supabase
      .from("community_comments")
      .update({ content: editCommentContent })
      .eq("id", commentId);
    if (error) { console.error(error); return; }
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentContent } : c));
    setEditingCommentId(null);
  };

  // ── 댓글 삭제
  const handleCommentDelete = async (commentId: string) => {
    await supabase.from("community_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId));
    setDeletingCommentId(null);
  };

  // ── 답글 수정
  const handleReplyEdit2 = async (replyId: string) => {
    if (!editReplyContent2.trim()) return;
    const { error } = await supabase
      .from("community_comments")
      .update({ content: editReplyContent2 })
      .eq("id", replyId);
    if (error) { console.error(error); return; }
    setComments(prev => prev.map(c => c.id === replyId ? { ...c, content: editReplyContent2 } : c));
    setEditingReplyId2(null);
  };

  // ── 답글 삭제
  const handleReplyDelete2 = async (replyId: string) => {
    await supabase.from("community_comments").delete().eq("id", replyId);
    setComments(prev => prev.filter(c => c.id !== replyId));
    setDeletingReplyId2(null);
  };

  // ── 댓글/답글 신고 제출
  const handleCommentReport = async () => {
    if (!commentReportCategory || !commentReportReason.trim()) return;
    const userKey = session?.user?.id || (() => {
      let k = localStorage.getItem("user_key");
      if (!k) { k = crypto.randomUUID(); localStorage.setItem("user_key", k); }
      return k;
    })();
    await supabase.from("reports").insert([{
      type: commentReportType,
      target_id: commentReportTargetId,
      reporter_key: userKey,
      reason: commentReportCategory,
      report_reason: commentReportReason,
    }]);
    alert("신고가 접수되었습니다.");
    setCommentReportOpen(false);
    setCommentReportCategory(""); setCommentReportReason("");
  };

  // ── 소유자 확인 헬퍼
  const isCommentOwner = (comment: CommentItem) =>
    !!session && session.user.id === (comment as any).author_auth_key;

  // ─────────────────────────────
  // 최초 로딩
  // ─────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session: sess } } = await supabase.auth.getSession();
      setSession(sess);
      await Promise.all([fetchPost(), fetchComments()]);
      setLoading(false);
    };
    init();
  }, []);

  // ─────────────────────────────
  // 날짜 포맷
  // ─────────────────────────────
  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ─────────────────────────────
  // 게시판 이름
  // ─────────────────────────────
  const getBoardLabel = (id: string) => {
    const map: Record<string, string> = {
      free: "자유게시판",
      seoul: "서울",
      gyeonggi: "경기",
      busan: "부산",
      daegu: "대구",
      jeju: "제주",
    };
    return map[id] || "게시판";
  };

  // ─────────────────────────────
  // 이미지 목록 (모달용)
  // ─────────────────────────────
  const images = post?.image_urls ?? [];

  // 모달 닫기
  const closeModal = () => setModalIndex(null);

  // 키보드 이동 지원
  useEffect(() => {
    if (modalIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  setModalIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") setModalIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i));
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalIndex, images.length]);

  if (loading || !post) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f6f8",
        }}
      >
        불러오는 중...
      </div>
    );
  }

  return (
    <>
      <style>{FONT_STYLE}</style>

      {/* ══════════════════════════════════════
          이미지 확대 모달
      ══════════════════════════════════════ */}
      {modalIndex !== null && images.length > 0 && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* 닫기 버튼 (우측 상단) */}
          <button
            onClick={closeModal}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(6px)",
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <X size={20} color="white" />
          </button>

          {/* 이전 버튼 */}
          <button
            className="modal-nav-btn"
            onClick={(e) => { e.stopPropagation(); setModalIndex((i) => (i !== null && i > 0 ? i - 1 : i)); }}
            disabled={modalIndex === 0}
            style={{ left: 16 }}
          >
            <ChevronLeft size={22} color="white" />
          </button>

          {/* 이미지 */}
          <img
            src={images[modalIndex]}
            alt={`image-${modalIndex}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "calc(100vw - 120px)",
              maxHeight: "88vh",
              borderRadius: "14px",
              objectFit: "contain",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
              userSelect: "none",
            }}
          />

          {/* 다음 버튼 */}
          <button
            className="modal-nav-btn"
            onClick={(e) => { e.stopPropagation(); setModalIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : i)); }}
            disabled={modalIndex === images.length - 1}
            style={{ right: 16 }}
          >
            <ChevronRight size={22} color="white" />
          </button>

          {/* 인디케이터 (이미지 2장 이상일 때) */}
          {images.length > 1 && (
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: "6px",
              }}
            >
              {images.map((_, i) => (
                <div
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setModalIndex(i); }}
                  style={{
                    width: i === modalIndex ? 18 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === modalIndex ? "white" : "rgba(255,255,255,0.4)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          개인정보 처리방침 모달
      ══════════════════════════════════════ */}
      {showPrivacy && (
        <>
          <div
            onClick={() => setShowPrivacy(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 300, backdropFilter: "blur(4px)",
            }}
          />
          <div className="ggk-body" style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(480px, 94vw)", maxHeight: "82vh", overflowY: "auto",
            background: "white", borderRadius: "20px", zIndex: 301,
            boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
          }}>
            <div style={{
              position: "sticky", top: 0, background: "white",
              padding: "16px 18px 12px", borderBottom: "1px solid #f0f2f5",
              display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1,
            }}>
              <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>
                개인정보 처리방침
              </div>
              <button
                onClick={() => setShowPrivacy(false)}
                style={{
                  border: "none", background: "#f0f2f5", borderRadius: "50%",
                  width: 28, height: 28, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={14} color="#666" />
              </button>
            </div>
            {/* 본문 */}
            <div style={{ padding:"16px 18px 24px", fontSize:12, color:"#444", lineHeight:1.8 }}>
              <p style={{ fontSize:11, color:"#999", marginBottom:16 }}>최종 수정일: 2025년 1월 1일</p>

              <Section title="1. 개인정보의 수집 및 이용 목적">
                같이가개(이하 "서비스")는 다음의 목적으로 개인정보를 수집·이용합니다.<br/>
                • 회원 가입 및 관리: 회원 식별, 서비스 이용 관리<br/>
                • 서비스 제공: 장소 정보 제공, 댓글·찜 기능 운영<br/>
                • 고객 지원: 문의 응대 및 민원 처리
              </Section>

              <Section title="2. 수집하는 개인정보 항목">
                • <strong>필수 항목:</strong> 이메일 주소, 닉네임, 비밀번호(암호화 저장)<br/>
                • <strong>소셜 로그인 시:</strong> 소셜 계정 고유 식별자, 프로필 사진(선택)<br/>
                • <strong>서비스 이용 시 자동 수집:</strong> 서비스 이용 기록, 접속 로그
              </Section>

              <Section title="3. 개인정보의 보유 및 이용 기간">
                • 회원 탈퇴 시 즉시 삭제(단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관)<br/>
                • 전자상거래 기록: 5년 보관 (전자상거래 등에서의 소비자보호에 관한 법률)<br/>
                • 서비스 이용 관련 분쟁 시 분쟁 해결 시까지 보관
              </Section>

              <Section title="4. 개인정보의 제3자 제공">
                서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.<br/>
                • 이용자가 사전에 동의한 경우<br/>
                • 법령의 규정에 의거하거나 수사 목적으로 관련 기관의 요구가 있는 경우
              </Section>

              <Section title="5. 개인정보 처리 위탁">
                서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다.<br/>
                • <strong>Supabase Inc.:</strong> 데이터베이스 및 인증 서비스<br/>
                • <strong>Vercel Inc.:</strong> 서버 호스팅 및 배포
              </Section>

              <Section title="6. 이용자의 권리 및 행사 방법">
                이용자는 다음의 권리를 가집니다.<br/>
                • 개인정보 열람, 정정·삭제, 처리 정지 요청권<br/>
                • 위 권리 행사는 서비스 내 설정 메뉴 또는 이메일 문의를 통해 가능합니다.<br/>
                • 문의 이메일: <strong>{ADMIN_EMAIL}</strong>
              </Section>

              <Section title="7. 쿠키(Cookie) 운용">
                서비스는 로그인 상태 유지 등을 위해 쿠키를 사용합니다. 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용이 제한될 수 있습니다.
              </Section>

              <Section title="8. 개인정보 보호 책임자">
                • <strong>책임자:</strong> 같이가개 관리자<br/>
                • <strong>이메일:</strong> {ADMIN_EMAIL}<br/>
                개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 연락처로 문의해 주시기 바랍니다.
              </Section>

              <Section title="9. 개인정보 처리방침 변경">
                본 방침은 법령, 정책 또는 서비스 변경 사항을 반영하기 위해 수정될 수 있습니다. 변경 시 서비스 내 공지사항을 통해 사전 안내합니다.
              </Section>

              <div style={{ marginTop:16, padding:"12px 14px", background:"#f8f9fb", borderRadius:10, border:"1px solid #e8eaed" }}>
                <div style={{ fontSize:11, color:"#888", lineHeight:1.7 }}>
                  본 개인정보 처리방침은 <strong>2025년 1월 1일</strong>부터 적용됩니다.<br/>
                  문의사항이 있으시면 <strong>{ADMIN_EMAIL}</strong>로 연락해 주세요.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════
          전체 레이아웃 — 680px 중앙 정렬
          height:100vh + overflow:hidden 으로
          내부 post-scroll 에서만 스크롤 발생
      ══════════════════════════════════════ */}
      <div
        className="ggk-body"
        style={{
          height: "100vh",       /* ← 뷰포트 높이 고정 */
          overflow: "hidden",    /* ← 바깥 스크롤 차단 */
          background: "#f5f6f8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* 680px 컬럼 */}
        <div
          style={{
            width: "100%",
            maxWidth: "680px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ── 상단바 (고정) ── */}
          <div
            style={{
              flexShrink: 0,
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid #eee",
              height: "56px",
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
              zIndex: 20,
            }}
          >
            <button
              onClick={() => router.back()}
              style={{
                border: "none", background: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginRight: "8px",
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="ggk-logo" style={{ fontSize: "16px", fontWeight: 800 }}>
              게시글
            </div>
          </div>

          {/* ══════════════════════════════════════
              스크롤 가능한 본문 영역
          ══════════════════════════════════════ */}
          <div
            className="post-scroll"
            style={{
              flex: 1,
              padding: "14px",
            }}
          >

            {/* ── 게시글 카드 ── */}
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                border: "1px solid #e8eaed",
                padding: "18px",
              }}
            >
              {/* 게시판 배지 + 점세개 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      background: "#f5f6f8",
                      color: "#555",
                      padding: "4px 9px",
                      borderRadius: "999px",
                      marginRight: "6px",
                    }}
                  >
                    {getBoardLabel(post.board_id)}
                  </span>

                  {post.post_type && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        background: "#fff3e8",
                        color: "#ff7a00",
                        padding: "4px 9px",
                        borderRadius: "999px",
                      }}
                    >
                      {post.post_type}
                    </span>
                  )}
                </div>

                {/* 점세개 */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowPostMenu(v => !v)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <MoreVertical size={16} color="#999" />
                  </button>

                  {showPostMenu && (
                    <>
                      <div
                        onClick={() => setShowPostMenu(false)}
                        style={{
                          position: "fixed",
                          inset: 0,
                          zIndex: 50
                        }}
                      />

                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          right: 0,
                          width: 130,
                          background: "white",
                          border: "1px solid #eee",
                          borderRadius: 10,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                          overflow: "hidden",
                          zIndex: 51,
                        }}
                      >
                        {post && session?.user?.id === (post as any).author_auth_key ? (
                          <>
                            <button
                              onClick={() => {
                                setShowPostMenu(false);
                                setEditPostTitle(post.title);
                                setEditPostContent(post.content);
                                setEditingPost(true);
                              }}
                              style={dropdownBtnStyleCom}
                            >
                              수정
                            </button>

                            <button
                              onClick={() => {
                                setShowPostMenu(false);
                                setDeletingPost(true);
                              }}
                              style={{
                                ...dropdownBtnStyleCom,
                                color: "#ef4444"
                              }}
                            >
                              삭제
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setShowPostMenu(false);
                              setPostReportOpen(true);
                            }}
                            style={dropdownBtnStyleCom}
                          >
                            신고
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 제목 */}
              <div
                className="ggk-logo"
                style={{
                  fontSize: "20px", fontWeight: 800, color: "#111",
                  lineHeight: 1.4, marginBottom: "14px",
                }}
              >
                {post.title}
              </div>

              {/* 작성자 + 통계 */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", marginBottom: "18px",
              }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "#ddd", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "13px", fontWeight: 700, color: "white",
                  }}>
                    {post.avatar_url ? (
                      <img
                        src={post.avatar_url}
                        alt={post.nickname}
                        referrerPolicy="no-referrer"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      (post.nickname || "?").charAt(0)
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#222" }}>
                      {post.nickname}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: "2px",
                        width: "100%",
                        fontSize: "11px",
                        color: "#999",
                      }}
                    >
                      <span>{formatDate(post.created_at)}</span>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <Heart size={12} />
                          {post.likes || 0}
                        </span>

                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <Eye size={12} />
                          {post.views || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════
                  이미지 영역
                  · 1장   : 단독 출력 (절반 높이)
                  · 2~3장 : 같은 행에 그리드 (스크롤 없음)
                  · 4장+  : 고정 크기 + 하단 가로 스크롤
              ══════════════════════════════════════ */}
              {images.length > 0 && (
                <div style={{ marginBottom: "18px" }}>

                  {/* ── 1장 ── */}
                  {images.length === 1 && (
                    <img
                      src={images[0]}
                      alt="image-0"
                      className="img-thumb"
                      onClick={() => setModalIndex(0)}
                      style={{
                        width: "100%",
                        height: "160px",      /* 절반 크기 */
                        objectFit: "cover",
                        borderRadius: "10px",
                        border: "1px solid #f0f0f0",
                        display: "block",
                      }}
                    />
                  )}

                  {/* ── 2~3장: 같은 행 그리드 ── */}
                  {images.length >= 2 && images.length <= 3 && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: images.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                      gap: "6px",
                    }}>
                      {images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`image-${i}`}
                          className="img-thumb"
                          onClick={() => setModalIndex(i)}
                          style={{
                            width: "100%",
                            height: images.length === 2 ? "150px" : "120px",
                            objectFit: "cover",
                            borderRadius: "10px",
                            border: "1px solid #f0f0f0",
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* ── 4장 이상: 고정 크기 + 가로 스크롤 ── */}
                  {images.length >= 4 && (
                    <div
                      className="img-scroll"
                      style={{
                        display: "flex",
                        gap: "6px",
                        paddingBottom: "8px",  /* 스크롤바 공간 */
                      }}
                    >
                      {images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`image-${i}`}
                          className="img-thumb"
                          onClick={() => setModalIndex(i)}
                          style={{
                            flexShrink: 0,
                            width: "140px",    /* 절반 수준 고정 너비 */
                            height: "140px",
                            objectFit: "cover",
                            borderRadius: "10px",
                            border: "1px solid #f0f0f0",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 게시글 수정 폼 */}
              {editingPost ? (
                <div style={{ marginBottom: 16 }}>
                  <input
                    value={editPostTitle}
                    onChange={e => setEditPostTitle(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8,
                            border: "1px solid #ddd", fontSize: 14, marginBottom: 8,
                            fontFamily: "'Noto Sans KR', sans-serif" }}
                  />
                  <textarea
                    value={editPostContent}
                    onChange={e => setEditPostContent(e.target.value)}
                    style={{ width: "100%", minHeight: 120, padding: "10px 12px",
                            borderRadius: 8, border: "1px solid #ddd", fontSize: 13,
                            resize: "vertical", fontFamily: "'Noto Sans KR', sans-serif" }}
                  />
                  <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                    <button onClick={handlePostEdit}
                            style={{ padding: "8px 16px", borderRadius: 7, border: "none",
                                    background: "#111", color: "white", fontWeight: 700,
                                    fontSize: 12, cursor: "pointer" }}>저장</button>
                    <button onClick={() => setEditingPost(false)}
                            style={{ padding: "8px 16px", borderRadius: 7,
                                    border: "1px solid #ddd", background: "white",
                                    fontWeight: 700, fontSize: 12, cursor: "pointer" }}>취소</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 기존 본문 텍스트 */}
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#222",
                      lineHeight: 1.8,
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {post.content}
                  </div>

                  {/* 추천 / 비추천 버튼 */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "10px",
                      marginTop: "22px",
                    }}
                  >
                    <button
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "999px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#444",
                      }}
                    >
                      <ThumbsUp size={14} />
                      좋아요
                    </button>

                    <button
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "999px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#444",
                      }}
                    >
                      <ThumbsDown size={14} />
                      싫어요
                    </button>
                  </div>
                </>
              )}

                {/* 게시글 삭제 확인 */}
                {deletingPost && (
                  <div style={{ marginTop: 12, padding: "12px 14px", background: "#fff3f3",
                                borderRadius: 10, border: "1px solid #fecaca" }}>
                    <p style={{ margin: "0 0 8px", fontSize: 13, color: "#c00", fontWeight: 700 }}>
                      정말 게시글을 삭제하시겠습니까?
                    </p>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button onClick={handlePostDelete}
                              style={{ padding: "7px 14px", borderRadius: 7, border: "none",
                                      background: "#ef4444", color: "white", cursor: "pointer",
                                      fontWeight: 700, fontSize: 12 }}>삭제하기</button>
                      <button onClick={() => setDeletingPost(false)}
                              style={{ padding: "7px 14px", borderRadius: 7,
                                      border: "1px solid #ddd", background: "white",
                                      cursor: "pointer", fontSize: 12 }}>취소</button>
                    </div>
                  </div>
                )}
            </div>

            {/* ══════════════════════════════════════
                댓글 영역
            ══════════════════════════════════════ */}
            <div style={{
              marginTop: "14px",
              background: "white",
              borderRadius: "16px",
              border: "1px solid #e8eaed",
              padding: "16px",
            }}>
              <div className="ggk-logo" style={{ fontSize: "15px", fontWeight: 800, marginBottom: "14px" }}>
                <div className="ggk-logo" style={{ fontSize: "15px", fontWeight: 800, marginBottom: "14px" }}>
                  댓글{" "}
                  {comments.filter(c => !c.parent_id).length + comments.filter(c => !!c.parent_id).length}개
                </div>
              </div>

              {/* ── 댓글 입력 영역 ── */}
              <div style={{ marginBottom: "16px" }}>
                {session ? (
                  /* 회원: 실제 입력창 */
                  <>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="댓글을 입력하세요"
                      style={{
                        width: "100%",
                        minHeight: "90px",
                        resize: "none",
                        borderRadius: "14px",
                        border: "1px solid #ddd",
                        padding: "14px",
                        fontSize: "12px",
                        background: "white",
                        color: "#111",
                        fontFamily: "'Noto Sans KR', sans-serif",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handleComment}
                      style={{
                        width: "100%", height: "44px", marginTop: "10px",
                        borderRadius: "12px", border: "none",
                        background: "linear-gradient(145deg, #2a2a2a, #111)",
                        color: "white", fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        fontFamily: "'Noto Sans KR', sans-serif",
                        fontSize: "13px",
                      }}
                    >
                      <Send size={13} />
                      댓글 작성
                    </button>
                  </>
                ) : (
                  /* 비회원: 고정 안내 문구 (수정·삭제 불가) */
                  <div style={{
                    width: "100%",
                    minHeight: "90px",
                    borderRadius: "14px",
                    border: "1px solid #e8eaed",
                    padding: "14px",
                    background: "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span style={{
                      fontSize: "12px",
                      color: "#c0c4cc",
                      fontFamily: "'Noto Sans KR', sans-serif",
                      textAlign: "center",
                      lineHeight: 1.7,
                    }}>
                      회원가입 후 더 많은 기능을 이용해보세요
                    </span>
                  </div>
                )}
              </div>

              {/* ── 댓글 리스트 ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {comments
                  .filter((item) => !item.parent_id)
                  .map((item) => {
                    const replies = comments.filter((r) => r.parent_id === item.id);
                    return (
                      <div key={item.id} style={{ marginBottom: "14px" }}>
                        {/* 댓글 카드 */}
                        <div style={{
                          padding: "12px",
                          borderRadius: "12px",
                          background: "#fafafa",
                          border: "1px solid #f0f0f0",
                        }}>
                          {/* 작성자 행 */}
                          <div style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between", marginBottom: "8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <div
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: "50%",
                                  background: "#ddd",
                                  overflow: "hidden",
                                }}
                              >
                                {item.avatar_url && (
                                  <img
                                    src={item.avatar_url}
                                    alt={item.nickname}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover"
                                    }}
                                  />
                                )}
                              </div>

                              <div>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700
                                  }}
                                >
                                  {item.nickname}
                                </span>

                                <div
                                  style={{
                                    fontSize: "10px",
                                    color: "#999",
                                    marginTop: "2px"
                                  }}
                                >
                                  {formatDate(item.created_at)}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {/* ── 점세개 버튼 */}
                              <div style={{ position: "relative" }}>
                                <button onClick={() => setOpenedCommentMenuId(
                                          openedCommentMenuId === item.id ? null : item.id)}
                                        style={{ border: "none", background: "transparent",
                                                cursor: "pointer", padding: 2 }}>
                                  <MoreVertical size={14} color="#bbb" />
                                </button>
                                {openedCommentMenuId === item.id && (
                                  <>
                                    <div onClick={() => setOpenedCommentMenuId(null)}
                                        style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                                    <div style={{
                                      position: "absolute", top: "calc(100% + 3px)", right: 0,
                                      width: 110, background: "white", border: "1px solid #eee",
                                      borderRadius: 10, boxShadow: "0 4px 14px rgba(0,0,0,0.09)",
                                      overflow: "hidden", zIndex: 51,
                                    }}>
                                      {isCommentOwner(item) ? (
                                        <>
                                          <button onClick={() => {
                                            setOpenedCommentMenuId(null);
                                            setEditingCommentId(item.id);
                                            setEditCommentContent(item.content);
                                          }} style={dropdownBtnStyleCom}>수정</button>
                                          <button onClick={() => {
                                            setOpenedCommentMenuId(null);
                                            setDeletingCommentId(item.id);
                                          }} style={{ ...dropdownBtnStyleCom, color: "#ef4444" }}>삭제</button>
                                        </>
                                      ) : (
                                        <button onClick={() => {
                                          setOpenedCommentMenuId(null);
                                          setCommentReportTargetId(item.id);
                                          setCommentReportType("comment");
                                          setCommentReportOpen(true);
                                        }} style={dropdownBtnStyleCom}>신고</button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {editingCommentId === item.id ? (
                            <div style={{ marginBottom: 8 }}>
                              <textarea
                                value={editCommentContent}
                                onChange={e => setEditCommentContent(e.target.value)}
                                style={{ width: "100%", minHeight: 70, padding: "8px 10px",
                                        borderRadius: 8, border: "1px solid #ddd", fontSize: 13,
                                        resize: "none", fontFamily: "'Noto Sans KR', sans-serif" }}
                              />
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <button onClick={() => handleCommentEdit(item.id)}
                                        style={{ padding: "5px 12px", borderRadius: 6, border: "none",
                                                background: "#111", color: "white", fontSize: 11,
                                                fontWeight: 700, cursor: "pointer" }}>저장</button>
                                <button onClick={() => setEditingCommentId(null)}
                                        style={{ padding: "5px 12px", borderRadius: 6,
                                                border: "1px solid #ddd", background: "white",
                                                fontSize: 11, cursor: "pointer" }}>취소</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {item.content}
                            </div>
                          )}

                          {/* 삭제 확인 */}
                          {deletingCommentId === item.id && (
                            <div style={{ marginTop: 8, padding: "9px 11px", background: "#fff3f3",
                                          borderRadius: 8, border: "1px solid #fecaca" }}>
                              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#c00" }}>
                                정말 삭제하시겠습니까?
                              </p>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => handleCommentDelete(item.id)}
                                        style={{ padding: "5px 10px", borderRadius: 5, border: "none",
                                                background: "#ef4444", color: "white",
                                                cursor: "pointer", fontSize: 11 }}>삭제하기</button>
                                <button onClick={() => setDeletingCommentId(null)}
                                        style={{ padding: "5px 10px", borderRadius: 5,
                                                border: "1px solid #ddd", background: "white",
                                                cursor: "pointer", fontSize: 11 }}>취소</button>
                              </div>
                            </div>
                          )}

                          {/* 답글 버튼 — 회원만 표시 */}
                          {session && (
                            <button
                              onClick={() =>
                                setReplyTarget(replyTarget === item.id ? null : item.id)
                              }
                              style={{
                                marginTop: "10px", border: "none", background: "none",
                                color: "#666", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                                fontFamily: "'Noto Sans KR', sans-serif",
                              }}
                            >
                              답글
                            </button>
                          )}

                          {/* 답글 입력 — 회원 + 해당 댓글 선택 시 */}
                          {session && replyTarget === item.id && (
                            <div style={{ marginTop: "10px" }}>
                              <textarea
                                value={replyMap[item.id] || ""}
                                onChange={(e) =>
                                  setReplyMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                placeholder="답글을 입력하세요"
                                style={{
                                  width: "100%", minHeight: "80px", resize: "none",
                                  borderRadius: "10px", border: "1px solid #ddd",
                                  padding: "10px", fontSize: "12px",
                                  fontFamily: "'Noto Sans KR', sans-serif",
                                  outline: "none",
                                }}
                              />
                              <button
                                onClick={() => handleReply(item.id)}
                                style={{
                                  marginTop: "8px", width: "100%", height: "38px",
                                  borderRadius: "10px", border: "none",
                                  background: "#111", color: "white", fontWeight: 700,
                                  cursor: "pointer", fontFamily: "'Noto Sans KR', sans-serif",
                                }}
                              >
                                답글 작성
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 답글 목록 */}
                        {replies.map((reply) => (
                          <div
                            key={reply.id}
                            style={{
                              marginTop: "8px", marginLeft: "24px",
                              padding: "12px", borderRadius: "12px",
                              background: "#f5f6f8", border: "1px solid #eceef2",
                            }}
                          >
                            {/* 답글 카드 내 작성자 행 우측에 점세개 추가 */}
                            <div style={{ position: "relative" }}>
                              <button onClick={() => setOpenedReplyMenuId2(
                                openedReplyMenuId2 === reply.id ? null : reply.id)}
                                style={{ border: "none", background: "transparent", cursor: "pointer" }}>
                                <MoreVertical size={13} color="#bbb" />
                              </button>
                              {openedReplyMenuId2 === reply.id && (
                                <>
                                  <div onClick={() => setOpenedReplyMenuId2(null)}
                                      style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                                  <div style={{
                                    position: "absolute", top: "calc(100% + 3px)", right: 0,
                                    width: 110, background: "white", border: "1px solid #eee",
                                    borderRadius: 10, boxShadow: "0 4px 14px rgba(0,0,0,0.09)",
                                    overflow: "hidden", zIndex: 51,
                                  }}>
                                    {isCommentOwner(reply) ? (
                                      <>
                                        <button onClick={() => {
                                          setOpenedReplyMenuId2(null);
                                          setEditingReplyId2(reply.id);
                                          setEditReplyContent2(reply.content);
                                        }} style={dropdownBtnStyleCom}>수정</button>
                                        <button onClick={() => {
                                          setOpenedReplyMenuId2(null);
                                          setDeletingReplyId2(reply.id);
                                        }} style={{ ...dropdownBtnStyleCom, color: "#ef4444" }}>삭제</button>
                                      </>
                                    ) : (
                                      <button onClick={() => {
                                        setOpenedReplyMenuId2(null);
                                        setCommentReportTargetId(reply.id);
                                        setCommentReportType("reply");
                                        setCommentReportOpen(true);
                                      }} style={dropdownBtnStyleCom}>신고</button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
                              {reply.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{
              margin: "28px 0 0",
              paddingTop: "16px",
              borderTop: "1px solid #e2e4e8",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              paddingBottom: "40px",
            }}>
              <div className="ggk-logo" style={{ fontSize: 11, color: "#bbb", fontWeight: 600 }}>
                같이가개
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => setShowPrivacy(true)}
                  className="ggk-body"
                  style={{
                    background: "transparent", border: "none",
                    fontSize: 10, color: "#999", cursor: "pointer",
                    fontWeight: 500, padding: "2px 4px",
                    textDecoration: "underline", textUnderlineOffset: "2px",
                    fontFamily: "'Noto Sans KR',sans-serif",
                  }}
                >
                  개인정보 처리방침
                </button>
                <span style={{ fontSize: 10, color: "#ccc" }}>|</span>
                <a
                  href={`mailto:${ADMIN_EMAIL}?subject=[같이가개] 문의하기&body=안녕하세요, 문의 내용을 입력해주세요.`}
                  className="ggk-body"
                  style={{
                    background: "transparent", border: "none",
                    fontSize: 10, color: "#999", cursor: "pointer",
                    fontWeight: 500, padding: "2px 4px",
                    textDecoration: "underline", textUnderlineOffset: "2px",
                    display: "inline-flex", alignItems: "center", gap: "3px",
                    fontFamily: "'Noto Sans KR',sans-serif",
                    textDecorationColor: "#ccc",
                  }}
                >
                  <Mail size={10} color="#bbb" />
                  이메일로 문의하기
                </a>
              </div>
              <div style={{ fontSize: 9, color: "#ccc", marginBottom: 4 }}>
                © 2026 같이가개. All rights reserved.
              </div>
            </div>

          </div>{/* /post-scroll */}
        </div>{/* /680px 컬럼 */}
      </div>{/* /전체 레이아웃 */}
      {postReportOpen && (
        <>
          <div onClick={() => setPostReportOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999 }} />
          <div onClick={e => e.stopPropagation()}
              style={{
                position: "fixed", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(380px, 92vw)", maxHeight: "80vh", overflowY: "auto",
                background: "white", borderRadius: 18, padding: 20, zIndex: 10000,
                boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
                fontFamily: "'Noto Sans KR', sans-serif",
              }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800 }}>신고하기</h2>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#444" }}>신고 유형</div>
              <select value={postReportCategory} onChange={e => setPostReportCategory(e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 8,
                              border: "1px solid #ddd", fontSize: 12 }}>
                <option value="">선택해주세요</option>
                <option value="spam">광고 / 도배</option>
                <option value="abuse">욕설 / 비방</option>
                <option value="sexual">음란물</option>
                <option value="hate">혐오 표현</option>
                <option value="etc">기타</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#444" }}>상세 사유</div>
              <textarea value={postReportReason} onChange={e => setPostReportReason(e.target.value)}
                        placeholder="신고 사유를 입력해주세요."
                        style={{ width: "100%", minHeight: 90, padding: "9px 10px",
                                borderRadius: 8, border: "1px solid #ddd",
                                resize: "none", fontSize: 12, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPostReportOpen(false)}
                      style={{ flex: 1, padding: 11, borderRadius: 8,
                              border: "1px solid #ddd", background: "white",
                              cursor: "pointer", fontWeight: 700, fontSize: 12 }}>취소</button>
              <button onClick={handlePostReport}
                      disabled={!postReportCategory || !postReportReason.trim()}
                      style={{
                        flex: 1, padding: 11, borderRadius: 8, border: "none",
                        background: (!postReportCategory || !postReportReason.trim()) ? "#ccc" : "#ef4444",
                        color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12,
                      }}>신고하기</button>
            </div>
          </div>
        </>
      )}
      {/* 댓글/답글 신고 모달 */}
      {commentReportOpen && (
        <>
          <div
            onClick={() => setCommentReportOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 9999
            }}
          />

          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(380px, 92vw)",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "white",
              borderRadius: 18,
              padding: 20,
              zIndex: 10000,
            }}
          >
            <h2>신고하기</h2>
<div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#444" }}>신고 유형</div>
              <select value={commentReportCategory} onChange={e => setCommentReportCategory(e.target.value)}
                      style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12 }}>
                <option value="">선택해주세요</option>
                <option value="spam">광고 / 도배</option>
                <option value="abuse">욕설 / 비방</option>
                <option value="sexual">음란물</option>
                <option value="hate">혐오 표현</option>
                <option value="etc">기타</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#444" }}>상세 사유</div>
              <textarea value={commentReportReason} onChange={e => setCommentReportReason(e.target.value)}
                        placeholder="신고 사유를 입력해주세요."
                        style={{ width: "100%", minHeight: 90, padding: "9px 10px", borderRadius: 8, border: "1px solid #ddd", resize: "none", fontSize: 12, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setCommentReportOpen(false)}
                      style={{ flex: 1, padding: 11, borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>취소</button>
              <button onClick={handleCommentReport}
                      disabled={!commentReportCategory || !commentReportReason.trim()}
                      style={{ flex: 1, padding: 11, borderRadius: 8, border: "none", background: (!commentReportCategory || !commentReportReason.trim()) ? "#ccc" : "#ef4444", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>신고하기</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* 개인정보 처리방침 섹션 컴포넌트 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 5, fontFamily: "'Pretendard', sans-serif" }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: "#555", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

const dropdownBtnStyleCom: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "none",
  background: "white", cursor: "pointer", textAlign: "left",
  fontSize: 12, fontFamily: "'Noto Sans KR', sans-serif",
};