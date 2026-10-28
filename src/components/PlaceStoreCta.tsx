"use client";

// 장소 상세 위쪽의 "예약하러 가기" 안내(쇼핑 입점 가게) — 판매 중인 상품이 있는 가게에서만 보입니다.
//   누르면 쇼핑 탭(/shop?store=번호)에서 그 가게를 펼쳐 보여 줍니다. 지도 위 상세 창(모달)에서도 창을 닫고 이동하도록 새로 엽니다.
// 상품·예약 칸 자체는 상세 아래쪽 PlaceStoreSection에도 그대로 있습니다.

import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";

export default function PlaceStoreCta({ placeId }: { placeId: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/${placeId}`).then((r) => r.json())
      .then((d: { enabled?: boolean; products?: { sold_out?: boolean }[] }) => { if (!cancelled && d.enabled) setCount((d.products ?? []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);

  if (count === 0) return null;
  return (
    <div style={{ margin: "-6px 0 14px", padding: "16px 16px", borderRadius: 16, background: "linear-gradient(135deg,#B45309,#D97706)", color: "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, opacity: 0.92 }}><ShoppingBag size={13} />같이가개 입점 가게</div>
      <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, marginTop: 6, lineHeight: 1.45 }}>상품을 미리 예약하고 가게에서 받아 가세요</div>
      <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 4, lineHeight: 1.65 }}>판매 중인 상품 {count}개 · 결제는 가게에서 해요.</div>
      <a href={`/shop?store=${placeId}`} style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0", borderRadius: 12, background: "white", color: "#B45309", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>
        <ShoppingBag size={15} />상품 보고 예약하러 가기
      </a>
    </div>
  );
}
