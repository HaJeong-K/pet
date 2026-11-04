"use client";

// 쇼핑 가게 화면 — 배달 앱의 가게 화면 구성입니다.
//   · 위: 대표 사진, 가게 이름·별점, 전화·지도·공유, 받는 방식
//   · 아래: 메뉴 / 가게 정보 / 후기 탭. 메뉴를 누르면 자세히 보고 담는 창이 열립니다.
//   · 담으면 아래에 주문 막대가 뜨고, 주문 창에서 방식·시간을 고르면 결제로 넘어갑니다. 주문자는 가입 정보를 그대로 씁니다.
// 지도 보기는 숙소의 "근처 장소 보기"와 같은 방식이고, 지도에서 이 화면으로 돌아오는 버튼이 함께 뜹니다.

import { useCallback, useEffect, useState } from "react";
import { infoText } from "@/lib/infoLines";
import { useRouter } from "next/navigation";
import { REORDER_KEY } from "@/components/MyStoreOrders";
import { ChevronLeft, ChevronRight, Heart, MapPin, Minus, Navigation, Phone, Plus, Share2, ShoppingBag, Star, Store, X } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import StayFrame from "@/components/lodging/StayFrame";
import StayNotices from "@/components/lodging/StayNotices";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { paymentsReady } from "@/lib/payments";
import { startPayment } from "@/lib/startPayment";
import { cleanStoreInfo, couponProblem, groupProducts, isWithinOrderHours, koreaDay, ORDER_TYPE_LABEL, orderHoursToday, type ReservationLine, PET_ALLERGENS, type PickedOption, type ProductOptionGroup, PARTY_SIZE_MAX, PICKUP_MAX_DAYS, RESERVATION_QTY_MAX, type OrderType } from "@/lib/storeRules";
import TimePicker from "@/components/TimePicker";

type Product = {
  id: number; name: string; description: string | null; price: number; category?: string | null; image_url?: string | null; unit?: string | null;
  ingredients?: string | null; allergy?: string | null; origin?: string | null; caution?: string | null; is_featured?: boolean; sold_out?: boolean;
  allergens?: string[] | null; options?: ProductOptionGroup[] | null; feed_reg_no?: string | null;
};
type CartLine = { key: string; productId: number; name: string; unitPrice: number; picks: PickedOption[]; qty: number };
type StoreData = {
  enabled: boolean; place?: { id: number; name: string; address: string | null; phone: string | null; category: string | null; lat: number | null; lng: number | null; hours?: string | null; closed_days?: string | null; parking?: string | null; memo?: string | null; order_open_time?: string | null; order_close_time?: string | null; orders_closed_on?: string | null; store_info?: unknown; order_week?: unknown };
  coupons?: { id: number; name: string; discount: number; min_order: number; expires_on: string | null }[];
  orderModes?: OrderType[]; products: Product[]; contact?: { name: string; phone: string } | null;
};
type Review = { photos?: string[] | null; id: number; display_name: string | null; rating: number; content: string; owner_reply: string | null; created_at: string };
type Tab = "menu" | "info" | "reviews";

const INK = "#2A1C14", SUB = "#6B5E55", BRAND = "#A05A32", DARK = "#3B2A20", LINE = "#EDECEB", WASH = "#F4F3F2";
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const field: React.CSSProperties = { width: "100%", padding: "13px 14px", borderRadius: 12, border: `1px solid ${LINE}`, fontSize: 15, boxSizing: "border-box", fontFamily: "inherit", background: "white", color: INK };
const stepper: React.CSSProperties = { width: 36, height: 36, borderRadius: "50%", border: `1px solid ${LINE}`, background: "white", color: INK, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const sectionGap: React.CSSProperties = { height: 10, background: WASH };
// 공공데이터의 Y/N 표기는 말로 풀어 보여 줍니다
const parkingText = (value?: string | null) => { const v = value?.trim(); if (!v) return "가게에 문의해 주세요"; if (/^(y|yes|가능)$/i.test(v)) return "주차할 수 있어요"; if (/^(n|no|불가)$/i.test(v)) return "주차할 수 없어요"; return v; };

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// 메뉴 창과 주문 창이 함께 쓰는 틀 — 휴대폰은 아래에서 올라오고, 넓은 화면은 가운데에 뜹니다
function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} className="shop-sheet-wrap" style={{ position: "fixed", inset: 0, zIndex: 1600, background: "rgba(20,14,10,0.5)", display: "flex", justifyContent: "center" }}>
      <style>{`.shop-sheet-wrap { align-items: flex-end; } .shop-sheet { border-radius: 24px 24px 0 0; } @media (min-width: 720px) { .shop-sheet-wrap { align-items: center; } .shop-sheet { border-radius: 24px; } }`}</style>
      <div className="shop-sheet ggk-body" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: "white", color: INK, wordBreak: "keep-all" }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "18px 22px 14px" }}>
          <div className="ggk-logo" style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 34, height: 34, border: "none", borderRadius: "50%", background: WASH, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={17} color={INK} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 22px 18px" }}>{children}</div>
        <div style={{ flexShrink: 0, padding: "14px 22px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${LINE}` }}>{footer}</div>
      </div>
    </div>
  );
}

export default function ShopStoreClient({ placeId }: { placeId: number }) {
  const router = useRouter();
  const [data, setData] = useState<StoreData | null>(null);
  const [reviews, setReviews] = useState<{ list: Review[]; average: number | null }>({ list: [], average: null });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tab, setTab] = useState<Tab>("menu");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [viewPicks, setViewPicks] = useState<PickedOption[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [couponId, setCouponId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<Product | null>(null);
  const [viewQty, setViewQty] = useState(1);
  const [ordering, setOrdering] = useState(false);
  const [pickedMode, setPickedMode] = useState<OrderType | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", pickupAt: "", memo: "", partySize: "2" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [shared, setShared] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/store/${placeId}`, { headers: await authHeader(), cache: "no-store" });
    return (await res.json()) as StoreData;
  }, [placeId]);

  useEffect(() => {
    let cancelled = false;
    load().then((d) => {
      if (cancelled) return;
      setData(d);
      // 주문 내역의 "다시 주문" — 지금 메뉴와 옵션으로 다시 담습니다(금액은 지금 값)
      try {
        const saved = JSON.parse(sessionStorage.getItem(REORDER_KEY) ?? "null") as { placeId: number; lines: ReservationLine[] } | null;
        sessionStorage.removeItem(REORDER_KEY);
        if (saved?.placeId === placeId) {
          const next: CartLine[] = [];
          for (const l of saved.lines) {
            const p = d.products.find((x) => x.id === l.productId);
            const picks = l.options ?? [];
            const valid = p && !p.sold_out && picks.every((x) => p.options?.some((g) => g.name === x.group && g.choices.some((c) => c.name === x.choice))) && !(p.options ?? []).some((g) => g.required && !picks.some((x) => x.group === g.name));
            if (!valid) continue;
            const extra = (p.options ?? []).reduce((sum, g) => sum + g.choices.filter((c) => picks.some((x) => x.group === g.name && x.choice === c.name)).reduce((n, c) => n + c.price, 0), 0);
            next.push({ key: `${p.id}|${picks.map((x) => `${x.group}:${x.choice}`).sort().join(",")}`, productId: p.id, name: l.name, unitPrice: p.price + extra, picks, qty: l.qty });
          }
          setCart(next);
          setNotice(next.length === saved.lines.length ? "지난 주문을 다시 담았어요." : "지금 주문할 수 없는 메뉴를 빼고 다시 담았어요.");
        }
      } catch { /* 저장소를 못 읽으면 빈 장바구니로 시작 */ }
    }).catch(() => { if (!cancelled) setData({ enabled: false, products: [] }); });
    fetch(`/api/store/reviews?placeId=${placeId}`).then((r) => r.json()).then((d) => { if (!cancelled) setReviews({ list: d.reviews ?? [], average: d.average ?? null }); }).catch(() => {});
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      setIsLoggedIn(!!session);
      setUserId(session?.user.id ?? null);
      if (session) {
        const { count } = await supabase.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("user_key", session.user.id).eq("type", "bookmark");
        if (!cancelled) setSaved((count ?? 0) > 0);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setIsLoggedIn(!!session));
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [load, placeId]);

  if (!data) return <StayFrame wide><div style={{ padding: "100px 0", textAlign: "center" }}><LogoLoader /></div></StayFrame>;
  if (!data.enabled || !data.place) {
    return (
      <StayFrame wide>
        <div style={{ padding: "100px 20px", textAlign: "center" }}>
          <Store size={30} color={SUB} />
          <div className="ggk-logo" style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: INK }}>지금은 주문을 받지 않는 가게예요</div>
          <a href="/shop" style={{ display: "inline-block", marginTop: 18, padding: "13px 22px", borderRadius: 12, background: DARK, color: "white", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>쇼핑으로 돌아가기</a>
        </div>
      </StayFrame>
    );
  }

  const place = data.place;
  const modes: OrderType[] = data.orderModes?.length ? data.orderModes : ["pickup"];
  const mode: OrderType = pickedMode && modes.includes(pickedMode) ? pickedMode : modes[0];
  const dineIn = mode === "dine_in";
  const cover = data.products.find((p) => p.is_featured && p.image_url)?.image_url ?? data.products.find((p) => p.image_url)?.image_url ?? null;
  const info = cleanStoreInfo(place.store_info);
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const total = cart.reduce((n, l) => n + l.unitPrice * l.qty, 0);
  const underMin = total < info.minOrder;
  const chosenCoupon = (data.coupons ?? []).find((c) => c.id === couponId) ?? null;
  const couponOk = (c: NonNullable<StoreData["coupons"]>[number]) => !couponProblem({ ...c, is_active: true }, total, openedAt);
  const discount = chosenCoupon && couponOk(chosenCoupon) ? chosenCoupon.discount : 0;
  const payTotal = total - discount;
  const contact = data.contact ?? null;
  const contactOk = !!contact || (form.name.trim() !== "" && form.phone.replace(/\D/g, "").length >= 9);
  const todayHours = orderHoursToday(place, openedAt);
  const orderTime = todayHours.closedDay ? "오늘은 주문 받지 않는 날" : todayHours.open && todayHours.close ? `오늘 ${todayHours.open} ~ ${todayHours.close}` : null;
  // 포장은 주문 가능 시간 안에서만 받습니다(매장 식사는 미리 잡는 예약이라 제한하지 않습니다)
  const closedToday = place.orders_closed_on === koreaDay(openedAt);
  const closedNow = !dineIn && (closedToday || todayHours.closedDay || !isWithinOrderHours(todayHours.open, todayHours.close, openedAt));
  const closedText = closedToday ? (dineIn ? "오늘은 예약을 받지 않아요. 내일부터 고를 수 있어요." : "이 가게는 오늘 주문을 마감했어요.") : todayHours.closedDay ? "오늘은 포장 주문을 받지 않는 날이에요." : `지금은 포장 주문 시간이 아니에요. ${orderTime}에 주문할 수 있어요.`;
  const details: [string, string][] = [
    ...(orderTime ? [["주문 시간", orderTime] as [string, string]] : []),
    [dineIn ? "방문" : "포장", dineIn ? `${PICKUP_MAX_DAYS}일 안의 방문 시간을 골라요` : "오늘 받아 가는 주문만 받아요"],
    ...(!dineIn && info.prepMinutes ? [["준비 시간", `주문 후 약 ${info.prepMinutes}분`] as [string, string]] : []),
    ...(info.minOrder ? [["최소 주문", won(info.minOrder)] as [string, string]] : []),
    ["영업시간", infoText(place.hours) || "가게에 문의해 주세요"],
    ...(place.closed_days?.trim() ? [["휴무일", infoText(place.closed_days)] as [string, string]] : []),
    ["주차", parkingText(place.parking)],
    ["위치", place.address ?? "주소 정보가 없어요"],
    ["취소", "가게가 확정하기 전에는 전액 환불돼요"],
    ...(place.memo?.trim() ? [["안내", place.memo.trim()] as [string, string]] : []),
  ];
  const canSubmit = count > 0 && !underMin && contactOk && !closedNow && !busy && (!dineIn || (!!form.pickupAt && Number(form.partySize) >= 1));
  const setQty = (key: string, qty: number) => setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: Math.min(RESERVATION_QTY_MAX, qty) } : l)).filter((l) => l.qty > 0));
  const optionExtra = (p: Product, picks: PickedOption[]) => (p.options ?? []).reduce((sum, g) => sum + g.choices.filter((c) => picks.some((x) => x.group === g.name && x.choice === c.name)).reduce((n, c) => n + c.price, 0), 0);
  const missingOption = (p: Product, picks: PickedOption[]) => (p.options ?? []).some((g) => g.required && !picks.some((x) => x.group === g.name));
  const addToCart = (p: Product, picks: PickedOption[], qty: number) => {
    const key = `${p.id}|${picks.map((x) => `${x.group}:${x.choice}`).sort().join(",")}`;
    setCart((c) => (c.some((l) => l.key === key)
      ? c.map((l) => (l.key === key ? { ...l, qty: Math.min(RESERVATION_QTY_MAX, l.qty + qty) } : l))
      : [...c, { key, productId: p.id, name: picks.length ? `${p.name} (${picks.map((x) => x.choice).join(", ")})` : p.name, unitPrice: p.price + optionExtra(p, picks), picks, qty }]));
  };
  const togglePick = (g: ProductOptionGroup, choice: string) => setViewPicks((picks) => {
    const on = picks.some((x) => x.group === g.name && x.choice === choice);
    if (g.multi) return on ? picks.filter((x) => !(x.group === g.name && x.choice === choice)) : [...picks, { group: g.name, choice }];
    if (on) return g.required ? picks : picks.filter((x) => x.group !== g.name);
    return [...picks.filter((x) => x.group !== g.name), { group: g.name, choice }];
  });
  const mapHref = place.lat != null && place.lng != null
    ? `/?focusLat=${place.lat}&focusLng=${place.lng}&focusName=${encodeURIComponent(place.name)}&focusPlaceId=${place.id}&focusBack=${encodeURIComponent(`/shop/${place.id}`)}`
    : null;

  const openMenu = (p: Product) => {
    setViewing(p);
    setViewQty(1);
    setViewPicks((p.options ?? []).filter((g) => g.required && !g.multi).map((g) => ({ group: g.name, choice: g.choices[0].name })));
  };
  const startOrder = () => {
    if (!isLoggedIn) { router.push(`/login?redirect=${encodeURIComponent(`/shop/${place.id}`)}`); return; }
    setMessage(null);
    setOrdering(true);
  };
  const toggleSaved = async () => {
    if (!userId) { router.push(`/login?redirect=${encodeURIComponent(`/shop/${place.id}`)}`); return; }
    const next = !saved;
    setSaved(next);
    const { error } = next
      ? await supabase.from("reactions").insert([{ place_id: place.id, user_key: userId, type: "bookmark" }])
      : await supabase.from("reactions").delete().eq("place_id", place.id).eq("user_key", userId).eq("type", "bookmark");
    if (error) setSaved(!next);
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: place.name, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setShared(true); }
    } catch { /* 공유 창을 닫은 경우 */ }
  };
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/store/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          placeId: place.id, orderType: mode, partySize: dineIn ? Number(form.partySize) : null,
          items: cart.map((l) => ({ productId: l.productId, qty: l.qty, options: l.picks })),
          couponId: discount > 0 ? couponId : null,
          name: form.name, phone: form.phone, memo: form.memo,
          pickupAt: form.pickupAt ? new Date(form.pickupAt).toISOString() : "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "주문하지 못했어요.");
      if (json.needsPayment) { await startPayment("store", Number(json.reservation.id)); return; }
      router.push("/orders?tab=store");
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "주문하지 못했어요." }); }
    finally { setBusy(false); }
  };

  const now = new Date(openedAt);
  const allergensHere = PET_ALLERGENS.filter((a) => data.products.some((p) => p.allergens?.includes(a)));
  const tabs: { key: Tab; label: string }[] = [{ key: "menu", label: "메뉴" }, { key: "info", label: "가게 정보" }, { key: "reviews", label: `후기 ${reviews.list.length}` }];
  const actions = [
    place.phone ? { key: "tel", label: "전화", Icon: Phone, href: `tel:${place.phone}` } : null,
    mapHref ? { key: "map", label: "지도", Icon: Navigation, href: mapHref } : null,
  ].filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <StayFrame wide>
      <div className="ggk-body" style={{ color: INK, paddingBottom: count > 0 ? 96 : 32 }}>
        {/* 넓은 화면은 사진과 가게 정보를 나란히, 메뉴는 두 줄로 놓아 가로 폭을 다 씁니다 */}
        <style>{`
          .shop-head { display: block; }
          .shop-cover { height: clamp(190px, 44vw, 260px); border-radius: 0 0 26px 26px; }
          .shop-name { padding: 26px 24px 22px; text-align: center; }
          .shop-actions { margin: 0 24px; }
          .shop-modes { padding: 22px 24px 24px; }
          .shop-pad { padding: 28px 24px 8px; }
          .shop-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
          .shop-notices { padding: 0 24px 24px; }
          .shop-notices:empty { display: none; }
          @media (min-width: 860px) {
            .shop-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 36px; align-items: center; padding: 28px 32px; }
            .shop-cover { height: auto; min-height: 340px; align-self: stretch; border-radius: 22px; }
            .shop-name { padding: 0 0 20px; text-align: left; }
            .shop-actions { margin: 0; }
            .shop-modes { padding: 20px 0 0; }
            .shop-pad { padding: 32px 32px 8px; }
            .shop-notices { padding: 0 32px 28px; }
            .shop-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 44px; }
          }
        `}</style>
        <div className="shop-head">
        {/* 대표 사진 */}
        <div className="shop-cover" style={{ position: "relative", overflow: "hidden", background: cover ? `url("${cover}") center/cover no-repeat` : "linear-gradient(160deg,#2A1C14 0%,#3B2A20 50%,#70482F 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!cover && <ShoppingBag size={44} color="rgba(255,255,255,0.5)" />}
          <a href="/shop" aria-label="쇼핑으로 돌아가기" style={{ position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: "50%", background: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={22} color={INK} /></a>
        </div>

        {/* 가게 이름 */}
        <div>
        <div className="shop-name">
          {place.category && <div style={{ fontSize: 14, fontWeight: 600, color: SUB }}>{place.category}</div>}
          <h1 className="ggk-logo" style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800, lineHeight: 1.3 }}>{place.name}</h1>
          <button onClick={() => setTab("reviews")} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", fontSize: 15, color: INK, cursor: "pointer" }}>
            <Star size={16} color="#E5A000" fill="#F5B400" />
            {reviews.average != null ? <><b>{reviews.average}</b><span style={{ color: SUB }}>후기 {reviews.list.length}개</span></> : <span style={{ color: SUB }}>아직 후기가 없어요</span>}
            <ChevronRight size={15} color={SUB} />
          </button>
          {info.intro && <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.65, color: "#444", whiteSpace: "pre-line" }}>{info.intro}</p>}
        </div>

        {/* 전화·지도·공유 */}
        <div className="shop-actions" style={{ display: "flex", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
          {actions.map(({ key, label, Icon, href }) => (
            <a key={key} href={href} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "15px 0", borderRight: `1px solid ${LINE}`, color: INK, fontSize: 15, fontWeight: 600, textDecoration: "none" }}><Icon size={17} />{label}</a>
          ))}
          <button onClick={toggleSaved} aria-pressed={saved} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "15px 0", border: "none", borderRight: `1px solid ${LINE}`, background: "transparent", color: INK, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}><Heart size={17} color={saved ? "#B91C1C" : INK} fill={saved ? "#B91C1C" : "none"} />찜</button>
          <button onClick={share} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "15px 0", border: "none", background: "transparent", color: INK, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}><Share2 size={17} />{shared ? "복사됨" : "공유"}</button>
        </div>

        {/* 받는 방식 */}
        <div className="shop-modes">
          {modes.length > 1 && (
            <div role="group" aria-label="주문 방식" style={{ display: "flex", gap: 4, padding: 4, marginBottom: 18, borderRadius: 14, background: WASH }}>
              {modes.map((m) => <button key={m} onClick={() => { setPickedMode(m); setForm((f) => ({ ...f, pickupAt: "" })); }} aria-pressed={mode === m} style={{ flex: 1, padding: "11px 6px", borderRadius: 11, border: "none", background: mode === m ? "white" : "transparent", color: mode === m ? INK : SUB, boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{ORDER_TYPE_LABEL[m]}</button>)}
            </div>
          )}
          {(closedNow || closedToday) && <div role="status" style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: closedToday ? "#FEF2F2" : "#FBEDE3", color: closedToday ? "#B91C1C" : "#85482A", fontSize: 14, fontWeight: 700 }}>{closedText}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", rowGap: 10, fontSize: 15, lineHeight: 1.55 }}>
            {details.map(([label, text]) => <div key={label} style={{ display: "contents" }}><span style={{ color: SUB }}>{label}</span><span style={{ whiteSpace: "pre-line", wordBreak: "break-word" }}>{text}</span></div>)}
          </div>
        </div>
        </div>
        </div>
        {notice && <div role="status" style={{ margin: "0 clamp(24px, 3vw, 32px) 16px", padding: "12px 14px", borderRadius: 12, background: WASH, fontSize: 14, fontWeight: 700 }}>{notice}</div>}
        {/* 가게 공지 — 없으면 나오지 않습니다 */}
        <div className="shop-notices" style={{ display: "grid", gap: 12 }}>{info.allergyNotice && <div role="note" style={{ padding: "14px 16px", borderRadius: 14, background: "#FEF2F2", border: "1px solid #FBD5D5", fontSize: 14.5, lineHeight: 1.6, color: "#7F1D1D", whiteSpace: "pre-line" }}><b style={{ display: "block", marginBottom: 3 }}>알레르기 안내</b>{info.allergyNotice}</div>}<StayNotices placeId={place.id} placeName={place.name} title="가게 공지" /></div>
        <div style={sectionGap} />

        {/* 탭 */}
        <div role="tablist" style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", background: "white", borderBottom: `1px solid ${LINE}` }}>
          {tabs.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "16px 0", border: "none", borderBottom: `3px solid ${tab === t.key ? DARK : "transparent"}`, background: "transparent", color: tab === t.key ? INK : SUB, fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{t.label}</button>)}
        </div>

        {tab === "menu" && (allergensHere.length > 0 || info.originNotice) && (
          <div className="shop-pad" style={{ paddingBottom: 0 }}>
            {allergensHere.length > 0 && (
              <div role="group" aria-label="피할 재료">
                <div style={{ fontSize: 15, fontWeight: 700 }}>우리 아이가 피해야 할 재료</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {allergensHere.map((a) => {
                    const on = avoid.includes(a);
                    return <button key={a} onClick={() => setAvoid(on ? avoid.filter((x) => x !== a) : [...avoid, a])} aria-pressed={on} style={{ padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? "#B91C1C" : LINE}`, background: on ? "#FEF2F2" : "white", color: on ? "#B91C1C" : "#444", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{a}</button>;
                  })}
                </div>
              </div>
            )}
            {info.originNotice && <div style={{ marginTop: allergensHere.length > 0 ? 16 : 0, padding: "12px 14px", borderRadius: 12, background: WASH, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line" }}><b>원산지</b> {info.originNotice}</div>}
          </div>
        )}
        {tab === "menu" && groupProducts(data.products).map((group) => (
          <section key={group.title} className="shop-pad">
            <h2 className="ggk-logo" style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>{group.title}</h2>
            <div className="shop-grid">
            {group.items.map((p) => {
              const inCart = cart.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0);
              const hit = (p.allergens ?? []).filter((a) => avoid.includes(a));
              return (
                <button key={p.id} onClick={() => openMenu(p)} style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 18, padding: "20px 0", border: "none", borderBottom: `1px solid ${LINE}`, background: "transparent", color: INK, textAlign: "left", fontFamily: "inherit", cursor: "pointer", opacity: p.sold_out ? 0.55 : 1 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>{p.name}{p.unit ? <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 500, color: SUB }}>{p.unit}</span> : null}</span>
                    {p.description && <span style={{ marginTop: 6, fontSize: 14, color: SUB, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</span>}
                    <span style={{ display: "block", marginTop: 8, fontSize: 17, fontWeight: 800 }}>{p.sold_out ? "품절" : `${won(p.price)}${p.options?.length ? "부터" : ""}`}</span>
                    {!!p.allergens?.length && <span style={{ display: "block", marginTop: 6, fontSize: 13, fontWeight: hit.length ? 800 : 500, color: hit.length ? "#B91C1C" : SUB }}>{hit.length ? `${hit.join("·")} 포함, 주의` : `${p.allergens.join("·")} 포함`}</span>}
                  </span>
                  <span style={{ position: "relative", flexShrink: 0, width: 108, height: 108, borderRadius: 14, background: p.image_url ? `url("${p.image_url}") center/cover no-repeat` : WASH, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {!p.image_url && <ShoppingBag size={24} color={SUB} />}
                    {inCart > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 26, height: 26, padding: "0 7px", boxSizing: "border-box", borderRadius: 999, background: BRAND, color: "white", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{inCart}</span>}
                  </span>
                </button>
              );
            })}
            </div>
          </section>
        ))}

        {tab === "info" && (
          <section className="shop-pad shop-grid" style={{ rowGap: 24, alignItems: "start" }}>
            <div>
              <h2 className="ggk-logo" style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 800 }}>가게 정보</h2>
              <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", rowGap: 12, fontSize: 15, lineHeight: 1.55 }}>
                <span style={{ color: SUB }}>상호</span><span>{place.name}</span>
                <span style={{ color: SUB }}>주소</span><span>{place.address ?? "-"}</span>
                {place.phone && <><span style={{ color: SUB }}>전화</span><a href={`tel:${place.phone}`} style={{ color: INK }}>{place.phone}</a></>}
                <span style={{ color: SUB }}>주문</span><span>{modes.map((m) => ORDER_TYPE_LABEL[m]).join(" · ")}</span>
                {info.originNotice && <><span style={{ color: SUB }}>원산지</span><span style={{ whiteSpace: "pre-line" }}>{info.originNotice}</span></>}
              </div>
              {(info.bizName || info.bizNo) && (
                <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>사업자 정보</div>
                  <div style={{ display: "grid", gridTemplateColumns: "104px 1fr", rowGap: 8, marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
                    {([["상호", info.bizName], ["대표자", info.ceoName], ["사업자등록번호", info.bizNo], ["사업장 주소", info.bizAddress]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: "contents" }}><span style={{ color: SUB }}>{k}</span><span>{v}</span></div>)}
                  </div>
                </div>
              )}
              {mapHref && <a href={mapHref} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18, padding: 14, borderRadius: 12, border: `1px solid ${LINE}`, color: INK, fontSize: 15, fontWeight: 700, textDecoration: "none" }}><MapPin size={16} />지도에서 보기</a>}
            </div>
          </section>
        )}

        {tab === "reviews" && (
          <section className="shop-pad">
            {reviews.list.length === 0 ? (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 15, color: SUB, lineHeight: 1.7 }}>아직 후기가 없어요.<br />주문을 마친 손님만 후기를 남길 수 있어요.</div>
            ) : <div className="shop-grid">{reviews.list.map((r) => (
              <div key={r.id} style={{ padding: "18px 0", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: SUB }}><b style={{ color: INK }}>{r.display_name ?? "손님"}</b><Star size={14} color="#E5A000" fill="#F5B400" />{r.rating}</div>
                <div style={{ marginTop: 7, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.content}</div>
                {!!r.photos?.length && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
                    {r.photos.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="후기 사진" loading="lazy" style={{ flexShrink: 0, width: 110, height: 110, borderRadius: 12, objectFit: "cover" }} />
                    ))}
                  </div>
                )}
                {r.owner_reply && <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: WASH, fontSize: 14, lineHeight: 1.6 }}><b>사장님</b> {r.owner_reply}</div>}
              </div>
            ))}</div>}
          </section>
        )}
      </div>

      {/* 주문 막대 */}
      {count > 0 && !ordering && !viewing && (
        <div style={{ position: "fixed", left: "50%", translate: "-50% 0", bottom: "var(--ggk-tabbar-space)", zIndex: 20, width: "min(1000px, calc(100vw - 32px))" }}>
          <button onClick={startOrder} disabled={closedNow || underMin} className="ggk-body" style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "17px 20px", borderRadius: 16, border: "none", background: closedNow || underMin ? "#8A7F78" : DARK, color: "white", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(42,28,20,0.32)" }}>
            <span style={{ minWidth: 26, height: 26, borderRadius: "50%", background: "white", color: DARK, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{count}</span>
            <span style={{ flex: 1, textAlign: "left" }}>{underMin ? `${won(info.minOrder)}부터 주문할 수 있어요` : closedToday && !dineIn ? "오늘 주문이 마감됐어요" : closedNow ? "지금은 주문 시간이 아니에요" : isLoggedIn ? "주문하기" : "로그인하고 주문하기"}</span>
            <span>{won(total)}</span>
          </button>
        </div>
      )}

      {/* 메뉴 자세히 */}
      {viewing && (
        <Sheet
          title={viewing.name}
          onClose={() => setViewing(null)}
          footer={viewing.sold_out ? (
            <div style={{ padding: 14, textAlign: "center", fontSize: 15, fontWeight: 700, color: SUB }}>지금은 품절이에요</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setViewQty((q) => Math.max(1, q - 1))} aria-label="하나 빼기" style={stepper}><Minus size={16} /></button>
                <span style={{ minWidth: 20, textAlign: "center", fontSize: 17, fontWeight: 800 }}>{viewQty}</span>
                <button onClick={() => setViewQty((q) => Math.min(RESERVATION_QTY_MAX, q + 1))} aria-label="하나 더하기" style={stepper}><Plus size={16} /></button>
              </div>
              <button onClick={() => { addToCart(viewing, viewPicks, viewQty); setViewing(null); }} disabled={missingOption(viewing, viewPicks)} style={{ flex: 1, padding: 15, borderRadius: 14, border: "none", background: missingOption(viewing, viewPicks) ? "#D4D3D2" : DARK, color: "white", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>{won((viewing.price + optionExtra(viewing, viewPicks)) * viewQty)} 담기</button>
            </div>
          )}
        >
          {viewing.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewing.image_url} alt="" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 16 }} />
          )}
          <div style={{ marginTop: viewing.image_url ? 18 : 0, fontSize: 20, fontWeight: 800 }}>{won(viewing.price)}{viewing.unit && <span style={{ marginLeft: 8, fontSize: 15, fontWeight: 500, color: SUB }}>{viewing.unit}</span>}</div>
          {viewing.description && <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65, color: SUB }}>{viewing.description}</p>}
          {(viewing.options ?? []).map((g) => (
            <div key={g.name} role="group" aria-label={g.name} style={{ marginTop: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{g.name} <span style={{ fontSize: 13, fontWeight: 600, color: g.required ? "#B91C1C" : SUB }}>{g.required ? "필수" : "선택"}{g.multi ? " · 여러 개" : ""}</span></div>
              {g.choices.map((c) => {
                const on = viewPicks.some((x) => x.group === g.name && x.choice === c.name);
                return (
                  <button key={c.name} onClick={() => togglePick(g, c.name)} aria-pressed={on} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 0", border: "none", borderBottom: `1px solid ${LINE}`, background: "transparent", color: INK, fontSize: 15, fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: g.multi ? 6 : "50%", border: on ? `6px solid ${DARK}` : `1px solid #BDBBB9`, boxSizing: "border-box" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                    {c.price > 0 && <span style={{ color: SUB }}>+{won(c.price)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {([["재료·소재", viewing.ingredients], ["알레르기", [viewing.allergens?.length ? `${viewing.allergens.join("·")} 포함` : "", viewing.allergy].filter(Boolean).join("\n")], ["원산지·제조", viewing.origin], ["주의·보관", viewing.caution], ["성분등록번호", viewing.feed_reg_no]] as [string, string | null | undefined][]).filter((f) => f[1]).map(([t, text]) => (
            <div key={t} style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line" }}><b style={{ display: "block", marginBottom: 3, color: t === "알레르기" ? "#B91C1C" : INK }}>{t}</b>{text}</div>
          ))}
        </Sheet>
      )}

      {/* 주문 */}
      {ordering && (
        <Sheet
          title={ORDER_TYPE_LABEL[mode]}
          onClose={() => setOrdering(false)}
          footer={(
            <>
              {message && <div role="alert" style={{ marginBottom: 10, fontSize: 14, fontWeight: 700, color: "#B91C1C" }}>{message.text}</div>}
              <button onClick={submit} disabled={!canSubmit} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: canSubmit ? DARK : "#D4D3D2", color: canSubmit ? "white" : "#55504A", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: canSubmit ? "pointer" : "default" }}>
                {busy ? "주문 넣는 중…" : paymentsReady() ? `${won(payTotal)} 결제하기` : `${won(payTotal)} 주문 넣기`}
              </button>
            </>
          )}
        >
          <div style={{ display: "grid", gap: 14 }}>
            {cart.map((l) => (
              <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{l.name}</div>
                  <div style={{ marginTop: 2, fontSize: 14, color: SUB }}>{won(l.unitPrice * l.qty)}</div>
                </div>
                <button onClick={() => setQty(l.key, l.qty - 1)} aria-label={`${l.name} 하나 빼기`} style={stepper}><Minus size={15} /></button>
                <span style={{ minWidth: 18, textAlign: "center", fontSize: 15, fontWeight: 800 }}>{l.qty}</span>
                <button onClick={() => setQty(l.key, l.qty + 1)} aria-label={`${l.name} 하나 더하기`} style={stepper}><Plus size={15} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 14, marginTop: 22, paddingTop: 20, borderTop: `1px solid ${LINE}` }}>
            {!!data.coupons?.length && (
              <div role="group" aria-label="쿠폰">
                <div style={{ fontSize: 14, fontWeight: 600, color: SUB, marginBottom: 6 }}>쿠폰</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {data.coupons.map((c) => {
                    const ok = couponOk(c);
                    const on = couponId === c.id && ok;
                    return (
                      <button key={c.id} onClick={() => setCouponId(on ? null : c.id)} disabled={!ok} aria-pressed={on} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 12, border: `1px solid ${on ? DARK : LINE}`, background: on ? "#FBEDE3" : "white", color: INK, fontSize: 14, fontFamily: "inherit", textAlign: "left", cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.5 }}>
                        <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b><span style={{ display: "block", fontSize: 13, color: SUB }}>{c.min_order > 0 ? `${won(c.min_order)} 이상 주문` : "금액 제한 없음"}{c.expires_on ? ` · ${c.expires_on}까지` : ""}</span></span>
                        <b>{won(c.discount)} 할인</b>
                      </button>
                    );
                  })}
                </div>
                {discount > 0 && <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700 }}>주문 {won(total)} − 할인 {won(discount)} = {won(payTotal)}</div>}
              </div>
            )}
            {contact ? (
              <div style={{ fontSize: 15, lineHeight: 1.6 }}><b style={{ display: "block", marginBottom: 2, fontSize: 14, color: SUB, fontWeight: 600 }}>주문자</b>{contact.name} · {contact.phone}</div>
            ) : (
              <>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="주문자 이름" maxLength={20} style={field} />
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="연락받을 전화번호" inputMode="tel" maxLength={13} style={field} />
              </>
            )}
            <label style={{ fontSize: 14, fontWeight: 600, color: SUB }}>
              {dineIn ? "방문 시간 (필수)" : "오늘 받을 시간 (선택)"}
              {dineIn
                ? <input type="datetime-local" value={form.pickupAt} min={closedToday ? `${toLocalInput(new Date(openedAt + 86_400_000)).slice(0, 10)}T00:00` : toLocalInput(now)} max={toLocalInput(new Date(now.getTime() + PICKUP_MAX_DAYS * 86_400_000))} onChange={(e) => setForm({ ...form, pickupAt: e.target.value })} style={{ ...field, marginTop: 6 }} />
                : <TimePicker ariaLabel="찾아갈 시간" value={form.pickupAt.slice(11, 16)} min={toLocalInput(now).slice(11, 16)} max={todayHours.open && todayHours.close && todayHours.open < todayHours.close ? todayHours.close : "23:59"} onChange={(t) => setForm({ ...form, pickupAt: t ? `${toLocalInput(now).slice(0, 10)}T${t}` : "" })} style={{ marginTop: 6 }} />}
            </label>
            {dineIn && (
              <label style={{ fontSize: 14, fontWeight: 600, color: SUB }}>
                방문 인원 (최대 {PARTY_SIZE_MAX}명)
                <input value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value.replace(/\D/g, "").slice(0, 2) })} inputMode="numeric" style={{ ...field, marginTop: 6 }} />
              </label>
            )}
            <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="가게에 전할 말 (선택)" maxLength={200} style={field} />
            <div style={{ fontSize: 13, color: SUB, lineHeight: 1.65 }}>
              이름과 전화번호는 주문 확인을 위해 이 가게에만 전달돼요.<br />
              {paymentsReady() ? "결제를 마쳐야 가게에 전달돼요." : "결제 시스템은 구축 중이에요. 지금은 주문만 접수돼요."}<br />
              가게가 확정한 뒤에는 사장님이 받아 줄 때만 취소·환불돼요.
            </div>
          </div>
        </Sheet>
      )}
    </StayFrame>
  );
}
