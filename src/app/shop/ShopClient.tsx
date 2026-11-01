"use client";

// 쇼핑 탭 화면 — 입점한 동네 가게(카페·식당·수제 간식 등)를 가까운 순으로 보여 줍니다. 가게를 누르면 가게 화면(/shop/번호)으로 갑니다.
//   · 가게 목록·미리보기: /api/store/list (가까운 순 정렬은 여기서)
//   · 지역(지역 게시판과 같은 분류)과 메뉴 분류로 좁혀 볼 수 있습니다.
//   · 검색은 말하듯이("대구 수제간식") — 가게 이름·주소·분류·해시태그·메뉴 이름에서 찾습니다(src/lib/talkSearch.ts).
//   · /shop?store=번호 로 들어오면 그 가게 화면으로 넘깁니다(지도 상세의 "예약하러 가기").
// 바깥 틀은 숙소 탭과 같은 StayFrame — 본문 최대 1000px + 넓은 화면의 좌우 광고·보호소 공고 칸.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bone, Brush, Cake, ChevronRight, Coffee, Cookie, Footprints, Gift, LayoutGrid, Package, Pill, Scissors, Search, Shirt, ShoppingBag, Soup, Star, Store, type LucideIcon } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import PageGuide from "@/components/PageGuide";
import { SHOP_GUIDE_KEY, SHOP_GUIDE_STEPS } from "@/lib/pageGuides";
import StayFrame from "@/components/lodging/StayFrame";
import { useUserArea } from "@/lib/useUserRegion";
import { won } from "@/lib/ownerPlans";
import { bannerAddress } from "@/lib/bannerCreative";
import { matchesTalk } from "@/lib/talkSearch";
import { REGION_BOARDS } from "@/lib/communityBoards";
import { normalizeSidoName } from "@/lib/shelterNotices";
import { ORDER_TYPE_LABEL, PRODUCT_CATEGORY_SUGGESTIONS, type OrderType } from "@/lib/storeRules";

type Preview = { id: number; name: string; price: number; image: string | null; soldOut: boolean; featured: boolean };
type ShopStore = { id: number; name: string; address: string | null; category: string | null; image: string | null; lat: number | null; lng: number | null; productCount: number; categories: string[]; preview: Preview[]; orderModes?: OrderType[]; tags?: string[]; menuNames?: string[]; rating?: number | null; reviewCount?: number; closedToday?: boolean };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const fmtDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`);
const sidoOf = (address: string | null) => { const t = (address ?? "").trim().split(/\s+/)[0]; return t ? normalizeSidoName(t) : ""; };

const INK = "#2A1C14", SUB = "#6B5E55", LINE = "#EDECEB", WASH = "#F4F3F2";
const REGIONS = REGION_BOARDS.map((b) => b.label);
const wrap: React.CSSProperties = { padding: "0 clamp(18px, 4vw, 32px)" };
const CATEGORY_ICON: [RegExp, LucideIcon][] = [[/간식/, Cookie], [/화식/, Soup], [/음료|멍푸치노/, Coffee], [/사료|영양/, Pill], [/케이크|특식/, Cake], [/장난감/, Bone], [/의류|액세서리/, Shirt], [/산책/, Footprints], [/위생/, Brush], [/미용/, Scissors], [/선물|세트/, Gift]];
const iconOf = (name: string) => CATEGORY_ICON.find(([re]) => re.test(name))?.[1] ?? Package;
// 사진이 없을 때 쓰는 기본 그림은 대표 사진으로 쓰지 않습니다
const thumbOf = (s: ShopStore) => s.preview.find((p) => p.featured && p.image)?.image ?? s.preview.find((p) => p.image)?.image ?? (s.image && !s.image.includes("default-place") ? s.image : null);

export default function ShopClient() {
  const router = useRouter();
  const area = useUserArea();
  const [stores, setStores] = useState<ShopStore[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("store"));
    if (Number.isInteger(n) && n > 0) router.replace(`/shop/${n}`);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store/list", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { if (!cancelled) setStores(data.stores ?? []); })
      // 불러오지 못한 것을 "가게가 없다"고 보여 주지 않습니다
      .catch(() => { if (!cancelled) { setFailed(true); setStores([]); } });
    return () => { cancelled = true; };
  }, []);

  const here = area.lat != null && area.lng != null ? { lat: area.lat, lng: area.lng } : null;
  const hereLat = here?.lat, hereLng = here?.lng;
  const sorted = useMemo(() => {
    const point = hereLat != null && hereLng != null ? { lat: hereLat, lng: hereLng } : null;
    return (stores ?? [])
      .map((s) => ({ ...s, distance: point && s.lat != null && s.lng != null ? distanceKm(point, { lat: s.lat, lng: s.lng }) : null }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name, "ko"));
  }, [stores, hereLat, hereLng]);
  // 지역과 분류는 가게가 있든 없든 늘 같은 자리에 보입니다. 가게가 직접 만든 분류만 뒤에 덧붙입니다.
  const categories = useMemo(() => [...new Set([...PRODUCT_CATEGORY_SUGGESTIONS, ...sorted.flatMap((s) => s.categories)])], [sorted]);
  const visible = sorted.filter((s) =>
    (!region || sidoOf(s.address) === region) &&
    (!category || s.categories.includes(category)) &&
    matchesTalk(query, [s.name, s.address, s.category, ...s.categories, ...(s.tags ?? []), ...(s.menuNames ?? s.preview.map((p) => p.name))]));

  return (
    <StayFrame wide>
      <PageGuide storageKey={SHOP_GUIDE_KEY} steps={SHOP_GUIDE_STEPS} enabled={stores !== null} />
      {/* 넓은 화면은 사진을 넓히고, 행 오른쪽에 다른 메뉴와 "메뉴 보기"를 놓아 가로 폭을 다 씁니다 */}
      <style>{`
        .shop-thumb { width: clamp(100px, 18vw, 128px); aspect-ratio: 1; }
        .shop-side { display: none; }
        .shop-cats { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
        .shop-cats > button { flex: 0 0 78px; }
        @media (min-width: 720px) {
          .shop-thumb { width: 200px; aspect-ratio: 4 / 3; }
          .shop-side { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
          .shop-cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 16px 6px; overflow: visible; }
        }
      `}</style>
      {/* 머리말 + 검색 — 숙소 탭과 같은 모양 */}
      <div style={{ padding: "34px clamp(18px, 4vw, 32px) 28px", background: "linear-gradient(160deg,#2A1C14 0%,#3B2A20 50%,#70482F 100%)", color: "white", borderRadius: "0 0 26px 26px" }}>
        <h1 className="ggk-logo" style={{ margin: 0, fontSize: "clamp(23px, 4vw, 29px)", fontWeight: 800, lineHeight: 1.35 }}>우리 아이 간식·용품,<br />미리 주문하고 받아 가세요</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22, padding: "15px 18px", borderRadius: 16, background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.16)" }}>
          <Search size={19} color={SUB} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="가게나 상품을 말하듯이 찾기 — 예: 대구 수제간식" aria-label="가게·상품 검색" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 15.5, fontFamily: "inherit", color: INK, background: "transparent" }} />
        </div>
      </div>

      {/* 분류 */}
      <div role="group" aria-label="분류" className="shop-cats" style={{ ...wrap, marginTop: 26 }}>
        {[null, ...categories].map((name) => {
          const on = category === name;
          const Icon = name ? iconOf(name) : LayoutGrid;
          return (
            <button key={name ?? "전체"} onClick={() => setCategory(on ? null : name)} aria-pressed={on} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 0, border: "none", background: "transparent", color: on ? INK : "#444", fontSize: 13, fontWeight: on ? 800 : 600, fontFamily: "inherit", cursor: "pointer", lineHeight: 1.3 }}>
              <span style={{ width: 54, height: 54, borderRadius: 18, background: on ? "#3B2A20" : "#FBEDE3", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={24} color={on ? "white" : "#A05A32"} /></span>
              {name ?? "전체"}
            </button>
          );
        })}
      </div>

      {/* 시·도 */}
      <div role="group" aria-label="지역" style={{ display: "flex", marginTop: 26, overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${LINE}`, padding: "0 clamp(10px, 3vw, 24px)" }}>
        {[null, ...REGIONS].map((name) => {
          const on = region === name;
          return <button key={name ?? "전국"} onClick={() => setRegion(name)} aria-pressed={on} style={{ flexShrink: 0, padding: "14px 11px", border: "none", borderBottom: `3px solid ${on ? "#3B2A20" : "transparent"}`, background: "transparent", color: on ? INK : SUB, fontSize: 15, fontWeight: on ? 800 : 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>{name ?? "전국"}</button>;
        })}
      </div>

      <div style={wrap}>
        {stores === null ? (
          <div style={{ padding: "70px 0", textAlign: "center" }}><LogoLoader /></div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "64px 18px", textAlign: "center" }}>
            <Store size={28} color={SUB} />
            <div className="ggk-logo" style={{ marginTop: 12, fontSize: 17, fontWeight: 800, color: INK }}>{failed ? "가게를 불러오지 못했어요" : stores.length === 0 ? "아직 상품을 올린 가게가 없어요" : region || category ? "조건에 맞는 가게가 아직 없어요" : "찾는 가게나 상품이 없어요"}</div>
            <div style={{ marginTop: 8, fontSize: 14, color: SUB, lineHeight: 1.7 }}>
              {failed
                ? "잠시 후 다시 열어 주세요."
                : stores.length === 0
                  ? <>동네 가게들이 상품을 올리면 여기에 모여요.<br />가게를 운영하신다면 사장님 화면에서 상품을 올려 보세요.</>
                  : "다른 지역이나 분류를 골라 보세요."}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "24px 0 6px" }}>
              <h2 className="ggk-logo" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>가게 {visible.length}곳</h2>
              <span style={{ fontSize: 13.5, color: SUB }}>{here ? "가까운 순" : area.status === "pending" ? "" : "이름순 · 위치를 알 수 없어요"}</span>
            </div>
            {visible.map((s) => {
              const thumb = thumbOf(s);
              const top = s.preview[0];
              return (
                <Link key={s.id} href={`/shop/${s.id}`} data-guide="shop-store" style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 0", borderBottom: `1px solid ${LINE}`, textDecoration: "none", color: INK }}>
                  <span className="shop-thumb" style={{ flexShrink: 0, borderRadius: 16, background: thumb ? `url("${thumb}") center/cover no-repeat` : WASH, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {!thumb && <ShoppingBag size={26} color={SUB} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ggk-logo" style={{ display: "block", fontSize: 18, fontWeight: 800, lineHeight: 1.35, wordBreak: "break-word" }}>{s.name}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 14, color: SUB, flexWrap: "wrap" }}>
                      {s.rating != null && <><Star size={14} color="#E5A000" fill="#F5B400" /><b style={{ color: INK }}>{s.rating}</b><span>({s.reviewCount})</span><span>·</span></>}
                      {s.distance != null && <><span>{fmtDistance(s.distance)}</span><span>·</span></>}
                      <span style={{ minWidth: 0 }}>{bannerAddress(s.address) ?? "주소 없음"}</span>
                    </span>
                    {top && <span style={{ display: "block", marginTop: 6, fontSize: 14, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{top.name} {won(top.price)}{s.productCount > 1 ? ` 외 ${s.productCount - 1}개` : ""}</span>}
                    <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 9 }}>
                      {s.closedToday && <span style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, background: "#FEE2E2", color: "#B91C1C" }}>오늘 주문 마감</span>}
                      {(s.orderModes ?? ["pickup"]).map((m) => <span key={m} style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, background: WASH, color: "#444" }}>{ORDER_TYPE_LABEL[m]}</span>)}
                    </span>
                  </span>
                  <span className="shop-side">
                    {s.preview.slice(1, 4).map((p) => (
                      <span key={p.id} style={{ width: 96, opacity: p.soldOut ? 0.55 : 1 }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 96, height: 96, borderRadius: 12, background: p.image ? `url("${p.image}") center/cover no-repeat` : WASH }}>{!p.image && <ShoppingBag size={20} color={SUB} />}</span>
                        <span style={{ display: "block", marginTop: 6, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{won(p.price)}</span>
                      </span>
                    ))}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 8, fontSize: 14, fontWeight: 700, color: "#A05A32", whiteSpace: "nowrap" }}>메뉴 {s.productCount}개 보기<ChevronRight size={16} /></span>
                  </span>
                </Link>
              );
            })}
          </>
        )}

        <div style={{ margin: "32px 0 40px", fontSize: 13, color: SUB, lineHeight: 1.7, textAlign: "center" }}>
          메뉴와 가격은 각 가게가 직접 올린 것이에요.<br />주문은 로그인한 뒤에 할 수 있고, 가게에서 확인하면 확정돼요.
        </div>
      </div>
    </StayFrame>
  );
}
