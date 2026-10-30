"use client";

// 사장님 센터 "예약" 아래의 쇼핑 후기 — 답글을 달거나 신고합니다. 후기가 없으면 아무것도 그리지 않습니다. 서버는 /api/owner/store-reviews.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Review = { id: number; display_name: string | null; rating: number; content: string; owner_reply: string | null; reported_at: string | null; hidden: boolean; created_at: string };
const button: React.CSSProperties = { padding: "7px 11px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", color: "#444", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };

export default function OwnerStoreReviews({ placeId }: { placeId: number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch(`/api/owner/store-reviews?placeId=${placeId}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId]);
  const load = useCallback(() => call().then((j) => setReviews(j.reviews ?? [])).catch(() => {}), [call]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const send = async (body: Record<string, unknown>, done: string) => {
    setMessage(null);
    try { await call({ method: "PATCH", body: JSON.stringify(body) }); setMessage(done); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "처리하지 못했어요."); }
  };
  const report = (id: number) => {
    const reason = window.prompt("신고 사유를 적어 주세요. 같이가개가 확인한 뒤 가림 여부를 정해요.");
    if (reason?.trim()) send({ id, report: reason }, "신고를 보냈어요.");
  };

  if (reviews.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>쇼핑 후기 {reviews.length}개</div>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#555" }}>{message}</div>}
      {reviews.map((r) => (
        <div key={r.id} style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid #f0ece0", background: "white", fontSize: 13, color: "#333", lineHeight: 1.6 }}>
          <div style={{ fontSize: 12, color: "#666" }}>{r.display_name ?? "손님"} · 별점 {r.rating} · {r.created_at.slice(0, 10)}{r.hidden ? " · 가려짐" : r.reported_at ? " · 신고 검토 중" : ""}</div>
          {r.content}
          {r.owner_reply
            ? <div style={{ marginTop: 4, color: "#6B4426" }}>내 답글: {r.owner_reply}</div>
            : (
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <input value={drafts[r.id] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} placeholder="답글" aria-label="답글" maxLength={500} style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 9, border: "1px solid #ddd", fontSize: 13, fontFamily: "inherit" }} />
                <button onClick={() => send({ id: r.id, reply: drafts[r.id] ?? "" }, "답글을 달았어요.")} disabled={!(drafts[r.id] ?? "").trim()} style={button}>등록</button>
                {!r.reported_at && <button onClick={() => report(r.id)} style={{ ...button, color: "#b42318" }}>신고</button>}
              </div>
            )}
        </div>
      ))}
    </div>
  );
}
