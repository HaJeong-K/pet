"use client";

// 숙소 화면(손님용, /stay/번호) — 숙박 예약 앱과 같은 구성입니다.
//   ① 사진(옆으로 넘김) ② 이름·분류·프리미엄·별점·주소 ②-1 숙소 소식(사장님 공지 — StayNotices) ③ 바로가기(객실·동반 조건·숙박 후기·위치)
//   ④ 객실: 요금·인원·마릿수·편의시설 → [예약하기](/stay/번호/book?room=)
//   ⑤ 동반 조건: 요약·편의시설·체크인/아웃·수칙·환불 기준
//   ⑥ 숙박 후기: 평균 별점·항목별 별점·별점별 개수, 묵은 손님의 후기 쓰기, 후기 목록(사장님 답글)
//   ⑦ 위치: 주소·지도에서 보기(근처 동반 장소)·길찾기·전화
// 아래에 "1박 ○원~ [객실 선택]" 띠가 붙어 있습니다. 바깥 틀은 StayFrame(좌우 광고·보호소 공고 칸).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BedDouble, ChevronDown, ChevronLeft, ChevronUp, Clock, Copy, Crown, MapPin, Navigation, PawPrint, Phone, Share2, Star, Users } from "lucide-react";
import StayFrame from "@/components/lodging/StayFrame";
import StayNotices from "@/components/lodging/StayNotices";
import OwnerManagedBadge from "@/components/OwnerManagedBadge";
import { supabase } from "@/lib/supabase";
import { EXTRA_UNITS, petPolicySummary, roomLowestPrice, roomPriceText, type LodgingProfile } from "@/lib/lodgingRules";
import { stayDayLabel } from "@/lib/lodgingBooking";
import { DANGEROUS_DOG_NOTICE } from "@/lib/lodgingConsents";
import { REVIEW_ASPECTS, REVIEW_TEXT_MAX, REVIEW_TEXT_MIN, type ReviewAspect, type ReviewSummary, type StayReview } from "@/lib/lodgingReviews";
import type { GuestRoom } from "@/components/lodging/LodgingBookingSheet";

export type StayPlace = {
  id: number; name: string; address: string | null; category: string | null; phone: string | null; photo: string | null;
  lat: number | null; lng: number | null; premium: boolean;
};
type Writable = { id: number; room_name: string; check_in: string; check_out: string };
type ReviewData = { ready: boolean; reviews: StayReview[]; summary: ReviewSummary; writable: Writable[] };

const BLUE = "#1D4F91";
const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #e3eaf3", padding: "18px 18px", scrollMarginTop: 60 };
const h2: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 800, color: "#222" };
const tag: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "#E3EDFA", color: BLUE };
const outline: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 14px", borderRadius: 11, border: "1px solid #d7e2f0", background: "white", color: BLUE, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" };
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span aria-label={`별점 ${value}점`} style={{ display: "inline-flex", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={i <= Math.round(value) ? "#F59E0B" : "none"} color={i <= Math.round(value) ? "#F59E0B" : "#d6d3c9"} />)}
    </span>
  );
}
function StarPicker({ value, onChange, size = 28, label }: { value: number; onChange: (v: number) => void; size?: number; label: string }) {
  return (
    <span role="radiogroup" aria-label={label} style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i}점`} onClick={() => onChange(i)} style={{ padding: 2, border: "none", background: "transparent", cursor: "pointer", display: "flex" }}>
          <Star size={size} fill={i <= value ? "#F59E0B" : "none"} color={i <= value ? "#F59E0B" : "#d6d3c9"} />
        </button>
      ))}
    </span>
  );
}

export default function StayDetailClient({ place, profile, rooms }: { place: StayPlace; profile: LodgingProfile | null; rooms: GuestRoom[] }) {
  const router = useRouter();
  const [reviews, setReviews] = useState<ReviewData | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadReviews = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/lodging/reviews?placeId=${place.id}`, { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {}, cache: "no-store" });
    setReviews(await res.json().catch(() => null));
  }, [place.id]);
  useEffect(() => { const t = window.setTimeout(loadReviews, 0); return () => window.clearTimeout(t); }, [loadReviews]);

  // 사진: 숙소 사진 + 객실 사진
  const photos = useMemo(() => [...(place.photo ? [place.photo] : []), ...rooms.flatMap((r) => r.images)].slice(0, 12), [place.photo, rooms]);
  const minPrice = rooms.length ? Math.min(...rooms.map(roomLowestPrice)) : null;
  const summary = reviews?.summary;
  const book = (roomId: number) => router.push(`/stay/${place.id}/book?room=${roomId}`);
  const share = async () => {
    const url = `${window.location.origin}/stay/${place.id}`;
    try {
      if (navigator.share) await navigator.share({ title: place.name, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    } catch { /* 공유 창을 닫음 */ }
  };

  const nav = [
    { id: "stay-rooms", label: `객실 ${rooms.length}` },
    { id: "stay-policy", label: "동반 조건" },
    { id: "stay-reviews", label: `숙박 후기 ${summary?.count ?? 0}` },
    { id: "stay-location", label: "위치" },
  ];

  return (
    <StayFrame>
      {/* 맨 위: 뒤로·공유 + 사진 */}
      <div style={{ position: "relative" }}>
        {photos.length > 0 ? (
          <div style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", gap: 2 }}>
            {photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={`${place.name} 사진 ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} style={{ width: photos.length > 1 ? "88%" : "100%", flexShrink: 0, height: 300, objectFit: "cover", scrollSnapAlign: "start" }} />
            ))}
          </div>
        ) : (
          <div aria-hidden style={{ height: 220, background: "linear-gradient(135deg,#E3EDFA,#F6F1E4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#7d97bd" }}>
            <BedDouble size={44} /><PawPrint size={30} />
          </div>
        )}
        <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => (window.history.length > 1 ? router.back() : router.push("/stay"))} aria-label="뒤로" style={{ width: 38, height: 38, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.92)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}><ChevronLeft size={20} /></button>
          <button onClick={share} aria-label="공유" style={{ height: 38, padding: "0 12px", borderRadius: 999, border: "none", background: "rgba(255,255,255,0.92)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}><Share2 size={15} />{copied ? "주소 복사됨" : "공유"}</button>
        </div>
      </div>

      <div style={{ padding: "0 16px", display: "grid", gap: 14 }}>
        {/* 이름·별점 */}
        <div style={{ ...card, marginTop: -26, position: "relative", boxShadow: "0 6px 20px rgba(29,79,145,0.10)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {place.category && <span style={tag}>{place.category}</span>}
            {place.premium && <span style={{ ...tag, background: "#FEF3C7", color: "#92400E", display: "inline-flex", alignItems: "center", gap: 3 }}><Crown size={11} />PREMIUM</span>}
            <span style={{ ...tag, background: BLUE, color: "white" }}>같이가개 바로 예약</span>
          </div>
          <h1 className="ggk-logo" style={{ margin: "8px 0 0", fontSize: 23, fontWeight: 800, color: "#222", lineHeight: 1.35 }}>{place.name}</h1>
          <button onClick={() => jump("stay-reviews")} style={{ marginTop: 6, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            {summary?.average != null
              ? <><Stars value={summary.average} /><b style={{ fontSize: 14, color: "#222" }}>{summary.average.toFixed(1)}</b><span style={{ fontSize: 12.5, color: "#888" }}>숙박 후기 {summary.count}개</span></>
              : <span style={{ fontSize: 12.5, color: "#888" }}>아직 숙박 후기가 없어요</span>}
          </button>
          {place.address && <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 12.5, color: "#666" }}><MapPin size={13} />{place.address}</div>}
          <div style={{ marginTop: 6 }}><OwnerManagedBadge placeId={place.id} /></div>
          {profile && <div style={{ marginTop: 12, padding: "11px 13px", borderRadius: 12, background: "#E3EDFA", color: BLUE, fontSize: 13, fontWeight: 800, lineHeight: 1.6, display: "flex", gap: 7 }}><PawPrint size={15} style={{ flexShrink: 0, marginTop: 3 }} />{petPolicySummary(profile)}</div>}
        </div>

        {/* 숙소 소식(사장님 공지) — 이름 바로 아래, 공지가 있을 때만 */}
        <StayNotices placeId={place.id} placeName={place.name} />

        {/* 바로가기 — 스크롤해도 위에 붙어 있음 */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, margin: "0 -16px", padding: "8px 16px", background: "rgba(247,243,232,0.96)", backdropFilter: "blur(6px)", display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
          {nav.map((n) => <button key={n.id} onClick={() => jump(n.id)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 999, border: "1px solid #dfe5ee", background: "white", color: "#444", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{n.label}</button>)}
        </div>

        {/* 객실 */}
        <section id="stay-rooms" style={card}>
          <h2 className="ggk-logo" style={h2}>객실 선택</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12, marginTop: 12 }}>
            {rooms.map((r) => (
              <div key={r.id} style={{ borderRadius: 14, border: "1px solid #eee", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {r.images.length > 0 ? (
                  <div style={{ display: "flex", gap: 2, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
                    {r.images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt={`${r.name} 사진 ${i + 1}`} loading="lazy" style={{ width: r.images.length > 1 ? "85%" : "100%", flexShrink: 0, aspectRatio: "4 / 3", objectFit: "cover", scrollSnapAlign: "start" }} />
                    ))}
                  </div>
                ) : (
                  <div aria-hidden style={{ aspectRatio: "16 / 7", background: "#F2F6FC", display: "flex", alignItems: "center", justifyContent: "center", color: "#9db4d6" }}><BedDouble size={28} /></div>
                )}
                <div style={{ padding: "12px 13px", display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>{r.name}</span>
                    {r.room_type && <span style={tag}>{r.room_type}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, fontSize: 12, color: "#777", flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Users size={12} />기준 {r.std_guests}명 · 최대 {r.max_guests}명</span>
                    {(r.max_pets ?? profile?.max_pets) != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><PawPrint size={12} />최대 {r.max_pets ?? profile?.max_pets}마리</span>}
                  </div>
                  {r.amenities.length > 0 && <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{r.amenities.join(" · ")}</div>}
                  {r.description && <div style={{ fontSize: 12.5, color: "#555", marginTop: 6, lineHeight: 1.6, whiteSpace: "pre-line" }}>{r.description}</div>}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                    <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "#222" }}>{roomPriceText(r)}</div>
                    <button onClick={() => book(r.id)} style={{ padding: "11px 18px", borderRadius: 11, border: "none", background: BLUE, color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>예약하기</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 동반 조건 */}
        <section id="stay-policy" style={card}>
          <h2 className="ggk-logo" style={h2}>반려동물 동반 조건</h2>
          {profile ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <div style={{ fontSize: 13.5, color: "#333", lineHeight: 1.7 }}>
                {petPolicySummary(profile)}
                {profile.pet_fee_note && <><br /><span style={{ fontSize: 12.5, color: "#666" }}>{profile.pet_fee_note}</span></>}
                {profile.extras.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <b style={{ fontSize: 13, color: "#333" }}>부가 옵션</b> <span style={{ fontSize: 12, color: "#999" }}>예약할 때 함께 고를 수 있어요</span>
                    <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
                      {profile.extras.map((x) => (
                        <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, color: "#555" }}>
                          <span>{x.name}{x.note ? <span style={{ color: "#999" }}> · {x.note}</span> : null}</span>
                          <b style={{ flexShrink: 0, color: "#333" }}>{x.price.toLocaleString("ko-KR")}원 <span style={{ fontWeight: 500, color: "#999" }}>{EXTRA_UNITS.find((u) => u.id === x.unit)?.label}</span></b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {profile.pet_amenities.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{profile.pet_amenities.map((a) => <span key={a} style={tag}>{a}</span>)}</div>}
              {(profile.check_in || profile.check_out) && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#555" }}><Clock size={13} />체크인 {profile.check_in ?? "-"} · 체크아웃 {profile.check_out ?? "-"}</div>}
              <div style={{ borderRadius: 12, border: "1px solid #eee" }}>
                <button onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} style={{ width: "100%", display: "flex", alignItems: "center", padding: "11px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#444", fontFamily: "inherit" }}>
                  <span style={{ flex: 1, textAlign: "left" }}>동반 수칙 · 이용 수칙 · 취소·환불</span>{showRules ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showRules && (
                  <div style={{ padding: "0 12px 12px", display: "grid", gap: 10, fontSize: 12.5, color: "#555", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                    {profile.pet_rules && <div><b style={{ color: "#333" }}>반려동물 동반 수칙</b><br />{profile.pet_rules}</div>}
                    {profile.stay_rules && <div><b style={{ color: "#333" }}>숙소 이용 수칙</b><br />{profile.stay_rules}</div>}
                    <div><b style={{ color: "#333" }}>취소·환불</b><br />공정거래위원회 소비자분쟁해결기준(숙박업)에 따라 환불돼요.<br />날짜별로 돌려받는 금액은 예약할 때 보여 드려요.{profile.refund_policy ? `\n숙소 안내: ${profile.refund_policy}` : ""}</div>
                  </div>
                )}
              </div>
            </div>
          ) : <div style={{ fontSize: 13, color: "#888", marginTop: 10 }}>동반 조건은 예약을 보내면 숙소가 확인해 드려요.</div>}
          {/* 맹견은 숙소마다 받는 여부가 달라 전화 문의를 먼저 안내합니다(필수 안내) */}
          <div role="note" style={{ display: "flex", gap: 6, marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FBD5D5", fontSize: 12.5, color: "#991B1B", lineHeight: 1.6 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 3 }} />
            <span>{DANGEROUS_DOG_NOTICE}{place.phone && <> <a href={`tel:${place.phone}`} style={{ color: "#991B1B", fontWeight: 800 }}>{place.phone}</a></>}</span>
          </div>
        </section>

        {/* 숙박 후기 */}
        <section id="stay-reviews" style={card}>
          <h2 className="ggk-logo" style={h2}>숙박 후기</h2>
          <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>같이가개에서 예약하고 묵은 손님만 남길 수 있어요.</div>
          {!reviews ? <div style={{ fontSize: 13, color: "#aaa", marginTop: 12 }}>불러오는 중…</div> : (
            <>
              {reviews.summary.count > 0 && <ReviewSummaryBox summary={reviews.summary} />}
              {reviews.writable.length > 0 && <ReviewForm writable={reviews.writable} onDone={loadReviews} />}
              {reviews.summary.count === 0 && reviews.writable.length === 0 && (
                <div style={{ marginTop: 12, padding: "22px 14px", borderRadius: 14, background: "#F7F9FC", textAlign: "center", fontSize: 13, color: "#888", lineHeight: 1.7 }}>
                  아직 숙박 후기가 없어요.<br />첫 손님이 되어 후기를 남겨 주세요.
                </div>
              )}
              <div style={{ display: "grid", gap: 0, marginTop: 6 }}>
                {reviews.reviews.map((r) => <ReviewItem key={r.id} review={r} />)}
              </div>
            </>
          )}
        </section>

        {/* 위치 */}
        <section id="stay-location" style={card}>
          <h2 className="ggk-logo" style={h2}>위치 · 문의</h2>
          {place.address && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13.5, color: "#333" }}>
              <MapPin size={14} color={BLUE} /><span style={{ flex: 1 }}>{place.address}</span>
              <button onClick={() => navigator.clipboard?.writeText(place.address ?? "")} aria-label="주소 복사" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888", display: "flex" }}><Copy size={14} /></button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <a href={`/?placeId=${place.id}`} style={outline}><MapPin size={14} />지도에서 근처 동반 장소 보기</a>
            {place.lat != null && place.lng != null && <a href={`https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`} target="_blank" rel="noreferrer" style={outline}><Navigation size={14} />길찾기</a>}
            {place.phone && <a href={`tel:${place.phone}`} style={outline}><Phone size={14} />숙소에 전화</a>}
          </div>
          <div style={{ fontSize: 11.5, color: "#999", marginTop: 12, lineHeight: 1.6 }}>같이가개는 통신판매중개자이며 숙박 계약의 당사자는 숙소입니다.</div>
        </section>
      </div>

      {/* 아래 예약 띠 */}
      {minPrice != null && (
        <div style={{ position: "sticky", bottom: "calc(var(--ggk-tabbar-space) - 16px)", zIndex: 6, margin: "14px 16px 0", padding: "12px 14px", borderRadius: 16, background: "white", boxShadow: "0 6px 24px rgba(0,0,0,0.14)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: "#888" }}>1박 요금</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>{minPrice.toLocaleString("ko-KR")}원~</div>
          </div>
          <button onClick={() => (rooms.length === 1 ? book(rooms[0].id) : jump("stay-rooms"))} style={{ padding: "13px 22px", borderRadius: 12, border: "none", background: BLUE, color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            {rooms.length === 1 ? "예약하기" : "객실 선택"}
          </button>
        </div>
      )}
    </StayFrame>
  );
}

function ReviewSummaryBox({ summary }: { summary: ReviewSummary }) {
  const max = Math.max(1, ...summary.stars);
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", padding: "14px 16px", borderRadius: 14, background: "#FFFBEB" }}>
      <div style={{ textAlign: "center", minWidth: 90 }}>
        <div className="ggk-logo" style={{ fontSize: 34, fontWeight: 800, color: "#222", lineHeight: 1.1 }}>{summary.average?.toFixed(1)}</div>
        <Stars value={summary.average ?? 0} size={15} />
        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>후기 {summary.count}개</div>
      </div>
      <div style={{ flex: "1 1 160px", display: "grid", gap: 3 }}>
        {summary.stars.map((n, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#777" }}>
            <span style={{ width: 22 }}>{5 - i}점</span>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#F3E8C8", overflow: "hidden" }}><div style={{ width: `${(n / max) * 100}%`, height: "100%", background: "#F59E0B" }} /></div>
            <span style={{ width: 18, textAlign: "right" }}>{n}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: "1 1 140px", display: "grid", gap: 4 }}>
        {REVIEW_ASPECTS.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#555" }}>
            <span>{a.label}</span><b style={{ color: "#222" }}>{summary.aspects[a.id]?.toFixed(1) ?? "-"}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewItem({ review: r }: { review: StayReview }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Stars value={r.rating} size={13} />
        <b style={{ fontSize: 13, color: "#222" }}>{r.guest_display_name ?? "손님"}</b>
        <span style={{ fontSize: 11.5, color: "#aaa", marginLeft: "auto" }}>{stayDayLabel(r.created_at.slice(0, 10))}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "#999", marginTop: 3 }}>{[r.room_name, r.nights ? `${r.nights}박` : null, r.pets_summary].filter(Boolean).join(" · ")}</div>
      <div style={{ fontSize: 13.5, color: "#333", marginTop: 7, lineHeight: 1.7, whiteSpace: "pre-line" }}>{r.content}</div>
      {r.owner_reply && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#F7F9FC", fontSize: 12.5, color: "#555", lineHeight: 1.65, whiteSpace: "pre-line" }}>
          <b style={{ color: BLUE }}>사장님 답글</b><br />{r.owner_reply}
        </div>
      )}
    </div>
  );
}

function ReviewForm({ writable, onDone }: { writable: Writable[]; onDone: () => void }) {
  const [bookingId, setBookingId] = useState(writable[0].id);
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Record<ReviewAspect, number>>({ clean_rating: 0, service_rating: 0, pet_rating: 0 });
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = rating > 0 && content.trim().length >= REVIEW_TEXT_MIN && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인한 뒤 후기를 남길 수 있어요.");
      const body = { bookingId, rating, content, ...Object.fromEntries(Object.entries(aspects).map(([k, v]) => [k, v || null])) };
      const res = await fetch("/api/lodging/reviews", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "후기를 남기지 못했어요.");
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "후기를 남기지 못했어요."); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 12, padding: "14px 14px", borderRadius: 14, border: "1px solid #F3D58A", background: "#FFFDF5", display: "grid", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>묵은 숙소는 어떠셨나요?</div>
      {writable.length > 1 ? (
        <select value={bookingId} onChange={(e) => setBookingId(Number(e.target.value))} aria-label="후기를 남길 예약" style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13, fontFamily: "inherit" }}>
          {writable.map((w) => <option key={w.id} value={w.id}>{stayDayLabel(w.check_in)} ~ {stayDayLabel(w.check_out)} · {w.room_name}</option>)}
        </select>
      ) : <div style={{ fontSize: 12.5, color: "#777" }}>{stayDayLabel(writable[0].check_in)} ~ {stayDayLabel(writable[0].check_out)} · {writable[0].room_name}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StarPicker value={rating} onChange={setRating} label="전체 별점" />
        <span style={{ fontSize: 13, fontWeight: 700, color: rating ? "#B45309" : "#aaa" }}>{rating ? `${rating}점` : "별점을 눌러 주세요"}</span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {REVIEW_ASPECTS.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#555" }}>
            <span style={{ width: 92 }}>{a.label} <span style={{ color: "#bbb" }}>(선택)</span></span>
            <StarPicker value={aspects[a.id]} onChange={(v) => setAspects((x) => ({ ...x, [a.id]: v }))} size={18} label={`${a.label} 별점`} />
          </div>
        ))}
      </div>
      <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, REVIEW_TEXT_MAX))} rows={4} placeholder={"반려동물과 함께 머물며 좋았던 점, 아쉬웠던 점을 적어 주세요.\n예: 마당이 넓어 뛰어놀기 좋았어요."} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13.5, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
      <div style={{ fontSize: 11.5, color: "#aaa", textAlign: "right", marginTop: -6 }}>{content.trim().length}/{REVIEW_TEXT_MAX}자 (최소 {REVIEW_TEXT_MIN}자)</div>
      {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
      <button onClick={submit} disabled={!ready} style={{ padding: "12px 0", borderRadius: 11, border: "none", background: ready ? BLUE : "#d6d3c9", color: "white", fontSize: 14, fontWeight: 800, cursor: ready ? "pointer" : "default", fontFamily: "inherit" }}>{busy ? "남기는 중…" : "후기 남기기"}</button>
    </div>
  );
}
