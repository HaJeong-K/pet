"use client";

// 쇼핑 탭 화면 — 동네 가게의 상품을 가까운 순으로 보여 주고, 가게를 펼치면 그 자리에서 예약 포장을 넣습니다.
//   · 가게 목록·미리보기: /api/store/list (가까운 순 정렬은 여기서)
//   · /shop?store=번호 로 들어오면(지도 상세의 "예약하러 가기") 그 가게를 펼쳐서 보여 줍니다.
//   · 가게를 펼치면: 장소 상세와 같은 "상품 · 예약 포장" 칸(PlaceStoreSection)이 그대로 열립니다 — 예약 방법이 두 군데서 달라지지 않게.
// 결제는 받지 않습니다(가게에서 결제).
// 바깥 틀은 숙소 탭과 같은 StayFrame — 본문 최대 1000px + 넓은 화면의 좌우 광고·보호소 공고 칸.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, MapPin, Search, ShoppingBag, Store } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import StayFrame from "@/components/lodging/StayFrame";
import PlaceStoreSection from "@/components/PlaceStoreSection";
import { supabase } from "@/lib/supabase";
import { useUserArea } from "@/lib/useUserRegion";
import { won } from "@/lib/ownerPlans";
import { bannerAddress } from "@/lib/bannerCreative";
import { openPlaceDetail } from "@/lib/openPlace";

type Preview = { id: number; name: string; price: number; image: string | null; soldOut: boolean; featured: boolean };
type ShopStore = { id: number; name: string; address: string | null; category: string | null; image: string | null; lat: number | null; lng: number | null; productCount: number; categories: string[]; preview: Preview[] };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const fmtDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`);

export default function ShopClient() {
  const router = useRouter();
  const area = useUserArea();
  const [stores, setStores] = useState<ShopStore[] | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  // ?store=번호 — 지도 상세에서 "예약하러 가기"로 들어온 가게
  const [focusId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const n = Number(new URLSearchParams(window.location.search).get("store"));
    return Number.isInteger(n) && n > 0 ? n : null;
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store/list").then((r) => r.json()).then((data) => { if (!cancelled) setStores(data.stores ?? []); }).catch(() => { if (!cancelled) setStores([]); });
    supabase.auth.getSession().then(({ data: { session } }) => { if (!cancelled) setIsLoggedIn(!!session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(!!session));
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!focusId || !stores?.some((s) => s.id === focusId)) return;
    const t = window.setTimeout(() => {
      setOpenId(focusId);
      document.getElementById(`shop-store-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [focusId, stores]);

  const here = area.lat != null && area.lng != null ? { lat: area.lat, lng: area.lng } : null;
  const hereLat = here?.lat, hereLng = here?.lng;
  const sorted = useMemo(() => {
    const point = hereLat != null && hereLng != null ? { lat: hereLat, lng: hereLng } : null;
    return (stores ?? [])
      .map((s) => ({ ...s, distance: point && s.lat != null && s.lng != null ? distanceKm(point, { lat: s.lat, lng: s.lng }) : null }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name, "ko"));
  }, [stores, hereLat, hereLng]);
  const categories = useMemo(() => [...new Set(sorted.flatMap((s) => s.categories))], [sorted]);
  const term = query.trim().toLowerCase();
  const visible = sorted.filter((s) =>
    (!category || s.categories.includes(category)) &&
    (!term || s.name.toLowerCase().includes(term) || s.preview.some((p) => p.name.toLowerCase().includes(term)) || s.categories.some((c) => c.toLowerCase().includes(term))));

  return (
    <StayFrame>
      {/* 머리말 + 검색 — 숙소 탭과 같은 모양(색만 쇼핑의 초록) */}
      <div style={{ padding: "26px 18px 20px", background: "linear-gradient(160deg,#3F5A30 0%,#5C7A4A 65%,#83A06B 100%)", color: "white", borderRadius: "0 0 26px 26px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.18)", fontSize: 11.5, fontWeight: 800 }}>
          <ShoppingBag size={12} />동네 가게 예약 포장
        </div>
        <h1 className="ggk-logo" style={{ margin: "10px 0 0", fontSize: 24, fontWeight: 800, lineHeight: 1.35 }}>우리 아이 간식·용품,<br />미리 예약하고 받아 가세요</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6, lineHeight: 1.6 }}>결제는 가게에서 해요.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "12px 14px", borderRadius: 14, background: "white", boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}>
          <Search size={17} color="#8a96a8" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="가게나 상품 이름으로 찾기 — 예: 수제 간식, 하네스" aria-label="가게·상품 검색" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 14.5, fontFamily: "inherit", color: "#222", background: "transparent" }} />
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        {/* 분류 */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
            {[null, ...categories].map((name) => {
              const active = category === name;
              return <button key={name ?? "전체"} onClick={() => setCategory(name)} aria-pressed={active} style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 999, border: `1px solid ${active ? "#5C7A4A" : "#e2dcc8"}`, background: active ? "#5C7A4A" : "white", color: active ? "white" : "#555", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{name ?? "전체"}</button>;
            })}
          </div>
        )}

        {stores === null ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}><LogoLoader /></div>
        ) : visible.length === 0 ? (
          <div style={{ marginTop: 14, background: "white", borderRadius: 16, border: "1px solid #ece6d6", padding: "34px 18px", textAlign: "center" }}>
            <Store size={26} color="#b9b39f" />
            <div className="ggk-logo" style={{ marginTop: 10, fontSize: 15.5, fontWeight: 800, color: "#333" }}>{stores.length === 0 ? "아직 상품을 올린 가게가 없어요" : "찾는 가게나 상품이 없어요"}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#888", lineHeight: 1.7 }}>
              {stores.length === 0
                ? <>동네 가게들이 상품을 올리면 여기에 모여요.<br />가게를 운영하신다면 사장님 화면에서 상품을 올려 보세요.</>
                : "다른 이름으로 찾아보거나 분류를 바꿔 보세요."}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 400px), 1fr))", gap: 12, alignItems: "start" }}>
            {!here && area.status !== "pending" && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#999" }}>위치를 알 수 없어 가게 이름순으로 보여 드려요.</div>}
            {visible.map((s) => {
              const open = openId === s.id;
              return (
                <div key={s.id} id={`shop-store-${s.id}`} style={{ scrollMarginTop: 12, background: "white", borderRadius: 16, border: `1px solid ${open ? "#d8cfae" : "#ece6d6"}`, overflow: "hidden" }}>
                  <div style={{ padding: "14px 14px 12px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#111", wordBreak: "break-word" }}>{s.name}</span>
                          {s.category && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#E4EBDC", color: "#48603A" }}>{s.category}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 12, color: "#888" }}>
                          <MapPin size={12} style={{ flexShrink: 0 }} />
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.distance != null && <b style={{ color: "#5C7A4A" }}>{fmtDistance(s.distance)} · </b>}{bannerAddress(s.address) ?? "주소 없음"}</span>
                        </div>
                      </div>
                      <button onClick={() => openPlaceDetail(router, s)} style={{ flexShrink: 0, padding: "7px 11px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 11.5, fontWeight: 700, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>가게 정보</button>
                    </div>

                    {/* 상품 미리보기 — 누르면 아래에 전체 상품과 예약 칸이 열립니다 */}
                    {!open && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", marginTop: 12 }}>
                        {s.preview.map((p) => (
                          <button key={p.id} onClick={() => setOpenId(s.id)} style={{ flex: "0 0 112px", padding: 0, border: "none", background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: "inherit", opacity: p.soldOut ? 0.6 : 1 }}>
                            <div style={{ width: 112, height: 112, borderRadius: 12, background: p.image ? `url("${p.image}") center/cover no-repeat` : "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                              {!p.image && <ShoppingBag size={24} color="#D4A24C" />}
                              {p.soldOut && <span style={{ position: "absolute", top: 6, left: 6, fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C" }}>품절</span>}
                              {p.featured && !p.soldOut && <span style={{ position: "absolute", top: 6, left: 6, fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>대표</span>}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: "#222", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</div>
                            <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 800, color: "#B45309" }}>{won(p.price)}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    <button onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open} style={{ width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 11, border: open ? "1px solid #ddd" : "none", background: open ? "white" : "#B45309", color: open ? "#666" : "white", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      {open ? <>접기 <ChevronUp size={15} /></> : <>상품 {s.productCount}개 보고 예약하기 <ChevronDown size={15} /></>}
                    </button>
                  </div>
                  {open && <div style={{ padding: "0 12px 14px" }}><PlaceStoreSection placeId={s.id} isLoggedIn={isLoggedIn} /></div>}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 11.5, color: "#aaa", lineHeight: 1.7, textAlign: "center" }}>
          상품 정보와 가격은 각 가게가 직접 올린 것이에요.<br />예약을 넣으면 가게에서 확인한 뒤 확정돼요.
        </div>
      </div>
    </StayFrame>
  );
}
