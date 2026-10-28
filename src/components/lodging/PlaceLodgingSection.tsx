"use client";

// 장소 상세 화면의 숙소 칸(손님용) — 숙소 사장님이 "숙소·객실" 메뉴에서 올린 내용이 있을 때만 보입니다.
//   · 반려동물 동반 조건 요약(크게), 반려동물 편의시설, 체크인·체크아웃, 동반 수칙·이용 수칙·환불 규정(펼쳐 보기)
//   · 객실 카드: 사진(옆으로 넘김)·요금·인원·마릿수·편의시설·설명 → [예약하기]
// 예약 창은 LodgingBookingSheet, 데이터는 /api/lodging.
//
// 숙소 장소(펜션·호텔·캠핑 등)는 상세 화면 맨 위에 layout="hero"로 그립니다:
//   · 입점해서 바로 예약되는 숙소: "숙소 예약하러 가기" 안내 카드만 — 객실·후기·예약은 숙소 화면(/stay/번호)에서 합니다.
//     (지도 위 상세 창에서 열려도 창을 벗어나 숙소 화면으로 갑니다)
//   · 아직 같이가개에서 예약을 받지 않는 숙소(사장님 미입점·공공데이터): 전화 문의 안내 카드

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, CalendarDays, ChevronDown, ChevronUp, Clock, MapPin, MessageCircle, PawPrint, Phone, ShieldCheck, Users } from "lucide-react";
import { petPolicySummary, roomPriceText, type LodgingProfile } from "@/lib/lodgingRules";
import LodgingBookingSheet, { type GuestRoom } from "@/components/lodging/LodgingBookingSheet";

type Data = { ready: boolean; profile: (LodgingProfile & { updated_at?: string }) | null; rooms: GuestRoom[] };

const card: React.CSSProperties = { background: "white", borderRadius: 16, border: "1px solid #e3eaf3", padding: "16px 16px", marginTop: 16 };
const tag: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "#E3EDFA", color: "#1D4F91" };

/** 화면 안의 다른 칸으로 부드럽게 이동 */
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function PlaceLodgingSection({ placeId, placeName, isLoggedIn, layout = "inline", reviewCount = 0, phone = null }: {
  placeId: number; placeName: string; isLoggedIn: boolean;
  /** hero = 숙소 장소의 맨 위(예약 요약·바로가기 포함), inline = 다른 장소 화면 중간 */
  layout?: "hero" | "inline";
  reviewCount?: number;
  phone?: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [booking, setBooking] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lodging?placeId=${placeId}`).then((r) => r.json()).then((json) => { if (!cancelled) setData(json); }).catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);

  const empty = !data?.ready || (!data.profile && data.rooms.length === 0);
  if (empty) {
    if (layout !== "hero" || !data) return null;
    // 아직 같이가개에서 예약을 받지 않는 숙소
    return (
      <div style={{ ...card, background: "#F7FAFE" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <BedDouble size={17} color="#1D4F91" />
          <div className="ggk-logo" style={{ fontSize: 15.5, fontWeight: 800, color: "#222" }}>반려동물 동반 숙소</div>
        </div>
        <div style={{ fontSize: 12.5, color: "#666", marginTop: 6, lineHeight: 1.7 }}>
          아직 같이가개에서 바로 예약할 수 없는 숙소예요.<br />
          반려동물 크기·마릿수 조건은 숙소마다 달라서, 예약 전에 꼭 확인해 주세요.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {phone && <a href={`tel:${phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10, background: "#1D4F91", color: "white", fontSize: 13, fontWeight: 800, textDecoration: "none" }}><Phone size={13} />숙소에 전화로 문의</a>}
          <button onClick={() => jump("place-reviews")} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10, border: "1px solid #d7e2f0", background: "white", color: "#1D4F91", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}><MessageCircle size={13} />후기 {reviewCount}</button>
        </div>
        {/* 숙소 사장님에게 입점 안내 */}
        <a href={`/partner/lodging?place=${placeId}`} style={{ display: "block", marginTop: 12, paddingTop: 10, borderTop: "1px dashed #d7e2f0", fontSize: 12.5, color: "#1D4F91", fontWeight: 700, textDecoration: "none" }}>
          이 숙소 사장님이신가요? 입점하고 바로 예약 받기 →
        </a>
      </div>
    );
  }
  const p = data.profile;
  const minPrice = data.rooms.length ? Math.min(...data.rooms.map((r) => r.base_price)) : null;
  if (layout === "hero" && data.rooms.length > 0) {
    return (
      <div style={{ ...card, background: "linear-gradient(135deg,#1D4F91,#2E6BC0)", border: "none", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, opacity: 0.9 }}><ShieldCheck size={13} />같이가개 입점 숙소</div>
        <div className="ggk-logo" style={{ fontSize: 17, fontWeight: 800, marginTop: 6, lineHeight: 1.45 }}>
          같이가개에서 바로 예약할 수 있어요
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 4, lineHeight: 1.65 }}>
          객실 {data.rooms.length}개{minPrice != null ? ` · 1박 ${minPrice.toLocaleString("ko-KR")}원~` : ""}<br />
          {p ? petPolicySummary(p) : "동반 조건·숙박 후기를 확인하고 날짜를 골라 예약하세요."}
        </div>
        {/* 지도 위 상세 창(모달)에서도 창을 닫고 숙소 화면으로 가도록 새로 엽니다 */}
        <a href={`/stay/${placeId}`} style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0", borderRadius: 12, background: "white", color: "#1D4F91", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>
          <CalendarDays size={15} />숙소 예약하러 가기
        </a>
      </div>
    );
  }
  const open = (roomId: number) => {
    if (!isLoggedIn) { router.push(`/login?redirect=${encodeURIComponent(`/place/${placeId}`)}`); return; }
    setBooking(roomId);
  };

  const nav: { id: string; label: string; Icon: typeof BedDouble }[] = [
    { id: "lodging-rooms", label: `객실 ${data.rooms.length}`, Icon: BedDouble },
    { id: "lodging-policy", label: "동반 규정", Icon: PawPrint },
    { id: "place-reviews", label: `후기 ${reviewCount}`, Icon: MessageCircle },
    { id: "place-info", label: "위치·정보", Icon: MapPin },
  ];

  return (
    <>
    {layout === "hero" && (
      <div style={{ ...card, background: "linear-gradient(135deg,#1D4F91,#2E6BC0)", border: "none", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, opacity: 0.9 }}><ShieldCheck size={13} />같이가개에서 바로 예약 · 반려동물 동반 조건 확인</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            {minPrice != null && <div className="ggk-logo" style={{ fontSize: 22, fontWeight: 800 }}>1박 {minPrice.toLocaleString("ko-KR")}원~</div>}
            <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>
              객실 {data.rooms.length}개{p?.check_in ? ` · 체크인 ${p.check_in}` : ""}{p?.check_out ? ` · 체크아웃 ${p.check_out}` : ""}
            </div>
          </div>
          {data.rooms.length > 0 && (
            <button onClick={() => open(data.rooms[0].id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 18px", borderRadius: 12, border: "none", background: "white", color: "#1D4F91", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              <CalendarDays size={15} />{isLoggedIn ? "예약하기" : "로그인하고 예약"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto", scrollbarWidth: "none" }}>
          {nav.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => jump(id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 11px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.12)", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>
      </div>
    )}
    <div id="lodging-policy" style={{ ...card, scrollMarginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <BedDouble size={17} color="#1D4F91" />
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>반려동물과 함께하는 숙소</div>
      </div>

      {p && (
        <>
          <div style={{ marginTop: 10, padding: "12px 13px", borderRadius: 12, background: "#E3EDFA", color: "#1D4F91", fontSize: 13.5, fontWeight: 800, lineHeight: 1.6, display: "flex", gap: 7 }}>
            <PawPrint size={16} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>{petPolicySummary(p)}{p.pet_fee_note ? <><br /><span style={{ fontWeight: 600, fontSize: 12.5 }}>{p.pet_fee_note}</span></> : null}</span>
          </div>
          {p.pet_amenities.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 9 }}>{p.pet_amenities.map((a) => <span key={a} style={tag}>{a}</span>)}</div>
          )}
          {(p.check_in || p.check_out) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 9, fontSize: 12.5, color: "#555" }}>
              <Clock size={13} />체크인 {p.check_in ?? "-"} · 체크아웃 {p.check_out ?? "-"}
            </div>
          )}
          {(p.pet_rules || p.stay_rules || p.refund_policy) && (
            <div style={{ marginTop: 10, borderRadius: 12, border: "1px solid #eee" }}>
              <button onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} style={{ width: "100%", display: "flex", alignItems: "center", padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#444", fontFamily: "inherit" }}>
                <span style={{ flex: 1, textAlign: "left" }}>동반 수칙 · 이용 수칙 · 환불 규정</span>
                {showRules ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {showRules && (
                <div style={{ padding: "0 12px 12px", display: "grid", gap: 10, fontSize: 12.5, color: "#555", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                  {p.pet_rules && <div><b style={{ color: "#333" }}>반려동물 동반 수칙</b><br />{p.pet_rules}</div>}
                  {p.stay_rules && <div><b style={{ color: "#333" }}>숙소 이용 수칙</b><br />{p.stay_rules}</div>}
                  <div><b style={{ color: "#333" }}>취소·환불</b><br />공정거래위원회 소비자분쟁해결기준(숙박업)에 따라 환불돼요.<br />날짜별 환불 금액은 예약할 때 보여 드려요.{p.refund_policy ? `\n숙소 안내: ${p.refund_policy}` : ""}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div id="lodging-rooms" style={{ marginTop: 14, display: "grid", gap: 12, scrollMarginTop: 12 }}>
        {data.rooms.map((r) => (
          <div key={r.id} style={{ borderRadius: 14, border: "1px solid #eee", overflow: "hidden" }}>
            {r.images.length > 0 && (
              <div style={{ display: "flex", gap: 2, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
                {r.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={`${r.name} 사진 ${i + 1}`} loading="lazy" style={{ width: r.images.length > 1 ? "85%" : "100%", flexShrink: 0, aspectRatio: "4 / 3", objectFit: "cover", scrollSnapAlign: "start" }} />
                ))}
              </div>
            )}
            <div style={{ padding: "12px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: "#222" }}>{r.name}</span>
                {r.room_type && <span style={tag}>{r.room_type}</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#B45309", marginTop: 4 }}>{roomPriceText(r)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 12, color: "#777", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Users size={12} />기준 {r.std_guests}명 · 최대 {r.max_guests}명</span>
                {(r.max_pets ?? p?.max_pets) != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><PawPrint size={12} />최대 {r.max_pets ?? p?.max_pets}마리</span>}
              </div>
              {r.amenities.length > 0 && <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{r.amenities.join(" · ")}</div>}
              {r.description && <div style={{ fontSize: 12.5, color: "#555", marginTop: 6, lineHeight: 1.6, whiteSpace: "pre-line" }}>{r.description}</div>}
              <button onClick={() => open(r.id)} style={{ marginTop: 10, width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "#1D4F91", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                {isLoggedIn ? "날짜 고르고 예약하기" : "로그인하고 예약하기"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {booking != null && <LodgingBookingSheet placeName={placeName} profile={p} rooms={data.rooms} initialRoomId={booking} onClose={() => setBooking(null)} />}
    </div>
    </>
  );
}
