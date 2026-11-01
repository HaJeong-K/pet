"use client";

// 손님의 "쇼핑 주문" 내역(/orders?tab=store)
//   · 결제 대기: [결제하기]·[주문 지우기]
//   · 가게 확정 전: [주문 취소] — 바로 전액 환불
//   · 확정 뒤: [취소 요청] — 이유를 적어 보내고, 사장님이 받아 주면 전액 환불
//   · 이용 완료: [후기 쓰기](30일 안) · 결제 수단·영수증 · 다시 주문
// 서버는 /api/me/orders, 후기는 /api/store/reviews.

import { useCallback, useEffect, useState } from "react";
import { Phone, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { startPayment } from "@/lib/startPayment";
import { REVIEW_PHOTOS_MAX } from "@/lib/storeRules";

/** 다시 주문할 내역을 가게 화면에 넘길 때 쓰는 이름 */
export const REORDER_KEY = "ggk_store_reorder";
import { ORDER_TYPE_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, type OrderType, type ReservationLine, type ReservationStatus } from "@/lib/storeRules";

type Order = {
  id: number; place_id: number; items: ReservationLine[]; total: number; pickup_at: string | null; memo: string | null; status: ReservationStatus; owner_note: string | null; created_at: string;
  order_type: OrderType | null; party_size: number | null; payment_status: string; refund_amount: number | null;
  cancel_request_status: string; cancel_request_reason: string | null; cancel_request_answer: string | null;
  place: { name: string; address: string | null; phone: string | null } | null;
  payment: { method: string | null; receiptUrl: string | null; paidAt: string | null; refunded: number } | null;
  review: { rating: number; content: string; owner_reply: string | null; photos?: string[] | null } | null;
  discount?: number | null;
  canCancel: boolean; canRequestCancel: boolean; canReview: boolean;
};
const STATUS_TONE: Partial<Record<ReservationStatus, { bg: string; color: string }>> = {
  pending_payment: { bg: "#FEE2E2", color: "#B91C1C" }, requested: { bg: "#FEF3C7", color: "#92400E" }, accepted: { bg: "#DCFCE7", color: "#15803D" }, ready: { bg: "#DBEAFE", color: "#1D4ED8" }, no_show: { bg: "#FEE2E2", color: "#B91C1C" },
};
const button = (kind: "primary" | "plain" | "danger", disabled = false): React.CSSProperties => ({
  padding: "9px 13px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center",
  border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "#f3c7c5" : "#e2e4e8"}`,
  background: disabled ? "#D4D3D2" : kind === "primary" ? "#4A3021" : "white", color: kind === "primary" ? "white" : kind === "danger" ? "#b42318" : "#444",
});
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, fontFamily: "inherit", resize: "vertical" };
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function MyStoreOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [panel, setPanel] = useState<{ id: number; kind: "cancel" | "review" } | null>(null);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const uploadPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setMessage({ ok: false, text: "사진은 5MB까지 올릴 수 있어요." }); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const name = `store-reviews/${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg"}`;
    const { error } = await supabase.storage.from("community-images").upload(name, file, { cacheControl: "3600" });
    if (error) { setMessage({ ok: false, text: "사진을 올리지 못했어요." }); return; }
    setPhotos((all) => [...all, supabase.storage.from("community-images").getPublicUrl(name).data.publicUrl]);
  };
  const authed = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, []);
  const load = useCallback(async () => {
    try { setOrders((await authed("/api/me/orders")).orders ?? []); } catch { setOrders([]); }
  }, [authed]);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const run = async (job: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await job(); setMessage({ ok: true, text: done }); setPanel(null); setText(""); await load(); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };
  const patch = (body: Record<string, unknown>) => authed("/api/me/orders", { method: "PATCH", body: JSON.stringify(body) });

  if (!orders) return null;
  if (orders.length === 0) return <div style={{ padding: "28px 16px", borderRadius: 16, background: "white", border: "1px solid #E8E7E6", textAlign: "center", fontSize: 14, color: "#5F4D3A", lineHeight: 1.7 }}>아직 쇼핑 주문이 없어요.<br /><a href="/shop" style={{ color: "#8C5E3A", fontWeight: 800 }}>쇼핑 탭 둘러보기</a></div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {message && <div role="status" style={{ fontSize: 13.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
      {orders.map((o) => {
        const tone = STATUS_TONE[o.status] ?? { bg: "#f1f5f9", color: "#5f6672" };
        const payLabel = PAYMENT_STATUS_LABEL[o.payment_status];
        return (
          <div key={o.id} style={{ padding: "14px 15px", borderRadius: 16, background: "white", border: "1px solid #E8E7E6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: tone.bg, color: tone.color }}>{STATUS_LABEL[o.status]}</span>
              <a href={`/place/${o.place_id}`} style={{ fontSize: 15, fontWeight: 800, color: "#222", textDecoration: "none" }}>{o.place?.name ?? "가게"}</a>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{when(o.created_at)}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13.5, color: "#444", lineHeight: 1.65 }}>
              <div>{ORDER_TYPE_LABEL[o.order_type ?? "pickup"]}{o.party_size ? ` · ${o.party_size}명` : ""}{o.pickup_at ? ` · ${o.order_type === "dine_in" ? "방문" : "가지러 갈 시간"} ${when(o.pickup_at)}` : ""}</div>
              {o.items.map((line) => <div key={line.name} style={{ display: "flex", gap: 8 }}><span style={{ flex: 1, minWidth: 0 }}>{line.name} × {line.qty}</span><span style={{ color: "#666" }}>{won(line.price * line.qty)}</span></div>)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #eee" }}>
              <b style={{ fontSize: 15, color: "#4A3021" }}>{won(o.total)}</b>
              {(o.discount ?? 0) > 0 && <span style={{ fontSize: 12.5, color: "#555" }}>쿠폰 {won(o.discount ?? 0)} 할인</span>}
              {payLabel && <span style={{ fontSize: 12.5, color: o.payment_status === "refund_failed" ? "#b91c1c" : "#555" }}>{payLabel}{o.payment?.method ? ` · ${o.payment.method}` : ""}</span>}
              {(o.refund_amount ?? 0) > 0 && <span style={{ fontSize: 12.5, color: "#555" }}>환불 {won(o.refund_amount ?? 0)}</span>}
              {o.payment?.receiptUrl && <a href={o.payment.receiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: "#8C5E3A" }}>영수증</a>}
              {o.place?.phone && <a href={`tel:${o.place.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 700, color: "#8C5E3A", textDecoration: "none" }}><Phone size={12} />가게에 전화</a>}
            </div>
            {o.owner_note && <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>가게 안내: {o.owner_note}</div>}
            {o.cancel_request_status === "open" && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#B45309" }}>취소 요청을 보냈어요. 가게 답을 기다리는 중이에요.</div>}
            {o.cancel_request_status === "denied" && <div style={{ marginTop: 6, fontSize: 13, color: "#b42318" }}>가게가 취소 요청을 받지 못했어요{o.cancel_request_answer ? `: ${o.cancel_request_answer}` : "."}</div>}
            {o.review && (
              <div style={{ marginTop: 8, padding: "9px 11px", borderRadius: 10, background: "#F9F8F7", fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                내 후기 · 별점 {o.review.rating}<br />{o.review.content}
                {!!o.review.photos?.length && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {o.review.photos.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="후기 사진" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover" }} />
                    ))}
                  </div>
                )}
                {o.review.owner_reply && <div style={{ marginTop: 4, color: "#6B4426" }}>사장님 답글: {o.review.owner_reply}</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {o.status === "pending_payment" && <button onClick={() => run(() => startPayment("store", o.id), "")} disabled={busy} style={button("primary", busy)}>결제하기</button>}
              {o.status === "pending_payment" && <button onClick={() => run(() => patch({ id: o.id, action: "abandon" }), "주문을 지웠어요.")} disabled={busy} style={button("plain", busy)}>주문 지우기</button>}
              {o.canCancel && <button onClick={() => { if (window.confirm(`주문을 취소할까요?\n${o.payment_status === "paid" ? `${won(o.total)} 전액을 돌려받아요.` : ""}`)) run(() => patch({ id: o.id, action: "cancel" }), "주문을 취소했어요."); }} disabled={busy} style={button("danger", busy)}>주문 취소</button>}
              {o.canRequestCancel && <button onClick={() => { setPanel(panel?.id === o.id && panel.kind === "cancel" ? null : { id: o.id, kind: "cancel" }); setText(""); }} style={button("danger")}>취소 요청</button>}
              {o.canReview && <button onClick={() => { setPanel(panel?.id === o.id && panel.kind === "review" ? null : { id: o.id, kind: "review" }); setText(""); setRating(5); setPhotos([]); }} style={button("primary")}>후기 쓰기</button>}
              {["completed", "rejected", "cancelled", "no_show"].includes(o.status) && <a href={`/shop/${o.place_id}`} onClick={() => { try { sessionStorage.setItem(REORDER_KEY, JSON.stringify({ placeId: o.place_id, lines: o.items })); } catch { /* 저장 못 하면 가게 화면만 엽니다 */ } }} style={button("plain")}>다시 주문</a>}
            </div>
            {panel?.id === o.id && panel.kind === "cancel" && (
              <div style={{ marginTop: 10, display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#F9F8F7" }}>
                <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>가게가 이미 준비를 시작했어요.<br />사장님이 받아 주면 전액 환불돼요.</div>
                <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} rows={2} placeholder="취소하려는 이유" aria-label="취소하려는 이유" style={field} />
                <button onClick={() => run(() => patch({ id: o.id, action: "cancel_request", reason: text }), "취소 요청을 보냈어요.")} disabled={busy || !text.trim()} style={button("primary", busy || !text.trim())}>취소 요청 보내기</button>
              </div>
            )}
            {panel?.id === o.id && panel.kind === "review" && (
              <div style={{ marginTop: 10, display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#F9F8F7" }}>
                <div role="radiogroup" aria-label="별점" style={{ display: "flex", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}점`} onClick={() => setRating(n)} style={{ padding: 2, border: "none", background: "none", cursor: "pointer" }}><Star size={24} color="#D97706" fill={n <= rating ? "#F59E0B" : "none"} /></button>)}
                </div>
                <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={3} placeholder="메뉴와 반려동물 동반 경험을 10자 이상 적어 주세요." aria-label="후기 내용" style={field} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {photos.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="올린 후기 사진" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
                  ))}
                  {photos.length < REVIEW_PHOTOS_MAX && (
                    <label style={{ ...button("plain"), cursor: "pointer" }}>
                      사진 추가 ({photos.length}/{REVIEW_PHOTOS_MAX})
                      <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadPhoto(f); }} />
                    </label>
                  )}
                </div>
                <button onClick={() => run(() => authed("/api/store/reviews", { method: "POST", body: JSON.stringify({ reservationId: o.id, rating, content: text, photos }) }), "후기를 남겼어요. 고마워요!")} disabled={busy || text.trim().length < 10} style={button("primary", busy || text.trim().length < 10)}>후기 남기기</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
