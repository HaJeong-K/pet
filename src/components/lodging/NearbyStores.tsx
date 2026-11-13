"use client";

// 숙소 화면의 "근처 반려 가게" — 2026-11-13
// 숙소에서 가까운(20km 안) 입점 가게를 보여 줘, 체크인 날 간식·케이크 포장이나 매장 식사를 이어서 주문할 수 있게 합니다.
// 쇼핑 탭 목록(/api/store/list — CDN이 1분간 대신 응답)을 그대로 받아 가까운 순으로 고릅니다. 근처에 가게가 없으면 아무것도 그리지 않습니다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Star } from "lucide-react";

type Store = { id: number; name: string; category: string | null; image: string | null; lat: number | null; lng: number | null; orderModes: string[]; closedToday: boolean; rating: number | null; reviewCount: number; preview: { name: string; price: number }[] };

const NEAR_KM = 20;
const MAX_STORES = 4;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const distanceText = (d: number) => (d < 1 ? `${Math.max(100, Math.round(d * 10) * 100)}m` : `${d.toFixed(1)}km`);

export default function NearbyStores({ lat, lng, cardStyle, headingStyle }: { lat: number | null; lng: number | null; cardStyle: React.CSSProperties; headingStyle: React.CSSProperties }) {
  const [stores, setStores] = useState<(Store & { distance: number })[]>([]);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    fetch("/api/store/list")
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((json: { stores?: Store[] }) => {
        if (cancelled) return;
        const near = (json.stores ?? [])
          .filter((s) => s.lat != null && s.lng != null)
          .map((s) => ({ ...s, distance: km(lat, lng, s.lat as number, s.lng as number) }))
          .filter((s) => s.distance <= NEAR_KM)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, MAX_STORES);
        setStores(near);
      })
      .catch(() => { /* 가게 목록을 못 받아도 숙소 화면은 그대로 */ });
    return () => { cancelled = true; };
  }, [lat, lng]);

  if (stores.length === 0) return null;
  return (
    <section id="stay-stores" style={cardStyle}>
      <h2 className="ggk-logo" style={headingStyle}>근처 반려 가게</h2>
      <div style={{ fontSize: 13, color: "#5c5c5c", marginTop: 4, lineHeight: 1.6 }}>
        체크인 날 받을 간식·케이크를 미리 주문해 두세요.<br />포장은 주문한 당일에 받을 수 있어요.
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {stores.map((s) => (
          <Link key={s.id} href={`/shop/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, border: "1px solid #EDECEB", background: "white", textDecoration: "none", color: "#222" }}>
            <span style={{ width: 58, height: 58, borderRadius: 12, overflow: "hidden", background: "#FCF1E9", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.image ? <img src={s.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ShoppingBag size={20} color="#A05A32" />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <b style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</b>
                {s.closedToday && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#F1EFEE", color: "#5c5c5c" }}>오늘 주문 마감</span>}
              </span>
              <span style={{ display: "block", marginTop: 3, fontSize: 12.5, color: "#5c5c5c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                숙소에서 {distanceText(s.distance)}
                {s.orderModes.includes("pickup") ? " · 포장" : ""}{s.orderModes.includes("dine_in") ? " · 매장 식사" : ""}
                {s.rating != null ? <> · <Star size={11} color="#A05A32" fill="#A05A32" style={{ verticalAlign: -1 }} /> {s.rating.toFixed(1)}</> : null}
              </span>
              {s.preview[0] && (
                <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: "#3B2A20", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.preview[0].name} {Number(s.preview[0].price).toLocaleString("ko-KR")}원{s.preview.length > 1 ? ` 외 ${s.preview.length - 1}개` : ""}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
