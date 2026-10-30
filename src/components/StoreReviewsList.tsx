"use client";

// 쇼핑 후기 목록 — 실제로 주문하고 이용을 마친 손님의 후기만 보입니다. 후기가 없으면 아무것도 그리지 않습니다.

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { ORDER_TYPE_LABEL, type OrderType } from "@/lib/storeRules";

type Review = { id: number; display_name: string | null; order_type: OrderType | null; rating: number; content: string; owner_reply: string | null; created_at: string };

export default function StoreReviewsList({ placeId }: { placeId: number }) {
  const [data, setData] = useState<{ reviews: Review[]; average: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/reviews?placeId=${placeId}`).then((r) => r.json()).then((d) => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);
  if (!data || data.reviews.length === 0) return null;
  return (
    <div className="ggk-body" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800, color: "#333" }}>
        주문 후기 <Star size={13} color="#D97706" fill="#F59E0B" />{data.average} <span style={{ fontWeight: 500, color: "#666" }}>({data.reviews.length})</span>
      </div>
      <div style={{ display: "grid", gap: 7, marginTop: 7 }}>
        {data.reviews.slice(0, 5).map((r) => (
          <div key={r.id} style={{ padding: "9px 11px", borderRadius: 10, background: "white", border: "1px solid #F3E3BC", fontSize: 12.5, color: "#444", lineHeight: 1.6 }}>
            <div style={{ fontSize: 11.5, color: "#666" }}>{r.display_name ?? "손님"} · 별점 {r.rating} · {ORDER_TYPE_LABEL[r.order_type ?? "pickup"]} · {r.created_at.slice(0, 10)}</div>
            {r.content}
            {r.owner_reply && <div style={{ marginTop: 3, color: "#6B4426" }}>사장님: {r.owner_reply}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
