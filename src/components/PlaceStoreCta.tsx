"use client";

// 장소 상세 위쪽의 쇼핑 안내.
//   · 입점 가게(판매 중인 메뉴가 있음): "같이가개 입점 가게" + 주문·예약하러 가기(/shop?store=번호)
//   · 아직 입점하지 않은 카페·식당·간식 가게: 사장님에게 입점 상담 안내(/partner/store?place=번호)
//   · 공원·병원·숙소 등은 아무것도 보이지 않습니다(lib/storeCategories.ts).
// 지도 위 상세 창(모달)에서도 창을 닫고 이동하도록 새로 엽니다. 주문 칸 자체는 상세 아래쪽 PlaceStoreSection에도 있습니다.

import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { isStoreEligibleCategory } from "@/lib/storeCategories";
import { ORDER_TYPE_LABEL, type OrderType } from "@/lib/storeRules";

export default function PlaceStoreCta({ placeId, category }: { placeId: number; category?: string | null }) {
  const [info, setInfo] = useState<{ count: number; modes: OrderType[] } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/${placeId}`).then((r) => r.json())
      .then((d: { enabled?: boolean; products?: unknown[]; orderModes?: OrderType[] }) => {
        if (cancelled) return;
        setInfo(d.enabled ? { count: (d.products ?? []).length, modes: d.orderModes ?? ["pickup"] } : null);
        setChecked(true);
      })
      .catch(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [placeId]);

  if (!checked) return null;
  if (!info || info.count === 0) {
    if (!isStoreEligibleCategory(category)) return null;
    return (
      <a href={`/partner/store?place=${placeId}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "-6px 0 14px", padding: "11px 13px", borderRadius: 12, border: "1px dashed #D9C7A8", background: "#FFFBF3", color: "#6B4426", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
        <ShoppingBag size={15} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>이 가게 사장님이신가요? 쇼핑 입점 상담 받기 →</span>
      </a>
    );
  }
  const modeText = info.modes.map((m) => ORDER_TYPE_LABEL[m]).join(" · ");
  return (
    <div style={{ margin: "-6px 0 14px", padding: "16px 16px", borderRadius: 16, background: "linear-gradient(135deg,#8C5E3A,#A0663A)", color: "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700 }}><ShoppingBag size={13} />같이가개 입점 가게</div>
      <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, marginTop: 6, lineHeight: 1.45 }}>쇼핑 탭에서 미리 주문하고 편하게 오세요</div>
      <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.65 }}>{modeText} · 메뉴 {info.count}개</div>
      <a href={`/shop?store=${placeId}`} style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0", borderRadius: 12, background: "white", color: "#6B4426", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>
        <ShoppingBag size={15} />메뉴 보고 주문하러 가기
      </a>
    </div>
  );
}
