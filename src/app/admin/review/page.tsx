"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminNav from "@/components/AdminNav";
import { ScanSearch, Check, X } from "lucide-react";
import { boardLabel } from "@/lib/communityBoards";

// ── 글 검토(자동 감지된 커뮤니티 글) ──
// 게시판 규칙 위반이 의심돼 자동으로 보류된 글을 확인합니다(나눔의 판매 글, 유기동물의 유료 분양, 광고·홍보 등).
// "게시"를 누르면 바로 공개되고, "반려"를 누르면 공개되지 않습니다. 규칙은 moderation_rules 표에서 관리합니다.

type Post = { id: number; title: string; content: string; nickname: string; board_id: string; post_type: string | null; image_urls: string[] | null; created_at: string; review_status: string; review_reason: string | null };

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/post-review", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}

const fmt = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AdminReview() {
  const [data, setData] = useState<{ ready: boolean; pending: Post[]; rejected: Post[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setError(null);
    try { setData(await call("GET")); } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
  };
  useEffect(() => { load(); }, []);

  const act = async (postId: number, action: "approve" | "reject") => {
    if (busyId != null) return;
    if (action === "reject" && !window.confirm("이 글을 반려할까요? 공개되지 않고 작성자에게만 '반려됨'으로 보여요.")) return;
    setBusyId(postId);
    try { await call("POST", { postId, action }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "처리하지 못했어요."); }
    finally { setBusyId(null); }
  };

  const renderPost = (post: Post, pending: boolean) => (
    <div key={post.id} style={{ background: "white", borderRadius: 16, border: `1px solid ${pending ? "#FDE68A" : "#eee"}`, padding: "15px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11.5, color: "#888" }}>
        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#E4EBDC", color: "#48603A", fontWeight: 700 }}>{boardLabel(post.board_id)}</span>
        {post.post_type && <span style={{ fontWeight: 700 }}>[{post.post_type}]</span>}
        <span>{post.nickname}</span>
        <span>· {fmt(post.created_at)}</span>
      </div>
      <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 9, background: pending ? "#FFFBEB" : "#f5f5f5", color: pending ? "#92400E" : "#777", fontSize: 12, fontWeight: 700 }}>
        감지 사유: {post.review_reason ?? "게시판 규칙 위반 의심"}
      </div>
      <div style={{ marginTop: 10, fontSize: 15, fontWeight: 700, color: "#222", wordBreak: "break-word" }}>{post.title}</div>
      <div style={{ marginTop: 5, fontSize: 13.5, color: "#444", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{post.content}</div>
      {Array.isArray(post.image_urls) && post.image_urls.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {post.image_urls.map((url) => <img key={url} src={url} alt="첨부 사진" style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => act(post.id, "approve")} disabled={busyId === post.id} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: "none", background: "#5C7A4A", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Check size={14} />{pending ? "문제없음 · 게시" : "다시 게시"}
        </button>
        {pending && (
          <button onClick={() => act(post.id, "reject")} disabled={busyId === post.id} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#b91c1c", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <X size={14} />반려
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="ggk-body" style={{ height: "100dvh", overflowY: "auto", background: "#F7F3E8" }}>
      <AdminNav active="review" onRefresh={load} />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px clamp(14px, 4vw, 28px) var(--ggk-tabbar-space)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <ScanSearch size={18} color="#5C7A4A" />
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>글 검토</div>
          {data?.ready && <span style={{ fontSize: 12, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: data.pending.length ? "#FEF3C7" : "#E4EBDC", color: data.pending.length ? "#92400E" : "#48603A" }}>대기 {data.pending.length}건</span>}
        </div>
        <p style={{ fontSize: 12.5, color: "#777", lineHeight: 1.65, margin: "0 0 16px" }}>
          게시판 규칙 위반이 의심돼 자동으로 보류된 글이에요. 승인하기 전까지 다른 사람에게 보이지 않아요.
          잘못 걸린 정상 글은 "문제없음 · 게시"를 눌러 주세요.
        </p>

        {error && <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", marginBottom: 14 }}>{error}</div>}
        {data && !data.ready && (
          <div style={{ padding: 16, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 13, color: "#9a3412", lineHeight: 1.7 }}>
            자동 검토 기능이 아직 켜지지 않았어요. Supabase SQL 편집기에서 <b>scripts/sql/post-review.sql</b>을 실행해 주세요.
          </div>
        )}
        {data?.ready && data.pending.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 0", color: "#5C7A4A", fontSize: 14, fontWeight: 700 }}>검토할 글이 없어요 👍</div>
        )}
        {data?.pending.map((p) => renderPost(p, true))}

        {data?.ready && data.rejected.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#777", margin: "26px 0 10px" }}>최근 반려한 글</div>
            {data.rejected.map((p) => renderPost(p, false))}
          </>
        )}
      </div>
    </div>
  );
}
