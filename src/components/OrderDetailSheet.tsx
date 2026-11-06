"use client";

// 주문·예약 상세 — 내역 카드의 [상세 보기]로 엽니다(휴대폰은 아래에서 올라오는 창, 넓은 화면은 가운데 창).
// 다른 예약·배달 앱의 상세 화면에서 손님이 실제로 찾는 것을 모았습니다.
//   · 예약·주문 번호(복사), 진행 단계와 단계별 시각(요청 → 결제 → 확정·수락 → 준비·체크인 → 완료 / 취소)
//   · 결제 정보: 결제 수단·카드사·가린 카드 번호·할부·승인 번호·승인 시각·주문 번호, 요금 내역, 할인, 환불 금액·시각, 영수증
//   · 이용 정보: 숙소·가게 주소(지도에서 보기)·전화, 날짜·시간, 인원, 반려동물, 방문 수단·도착 예정, 요청 사항
//   · 취소 안내: 지금 취소할 수 있는지와 돌려받는 금액, 날짜별 환불 기준(숙소) / 가게 수락 전에만 바로 취소(쇼핑)
// 버튼(취소·결제·후기)은 내역 카드에 그대로 두고, 이 창은 "확인"에 집중합니다.

import { useEffect, useState } from "react";
import { Check, Copy, MapPin, Phone, ReceiptText, X } from "lucide-react";
import { won } from "@/lib/ownerPlans";
import { petLabel, stayDayLabel, STAY_STATUS, type StayPet, type StayStatus } from "@/lib/lodgingBooking";
import { ARRIVAL_METHODS } from "@/lib/lodgingConsents";
import { CANCEL_CAUSE_LABEL, type CancelCause } from "@/lib/lodgingPolicy";
import { ORDER_TYPE_LABEL, STATUS_LABEL, type OrderType, type ReservationLine, type ReservationStatus } from "@/lib/storeRules";

export type PaymentView = {
  method: string | null; receiptUrl: string | null; paidAt: string | null; refunded: number;
  amount?: number; orderId?: string; refundedAt?: string | null;
  detail?: { cardCompany?: string; cardNumber?: string; approveNo?: string; installment?: number; cardType?: string; easyPay?: string; approvedAt?: string } | null;
} | null;

type PriceDetail = {
  nights?: { day: string; price: number }[]; roomTotal?: number; extraGuestTotal?: number; petTotal?: number;
  extras?: { name: string; price: number; qty: number; amount: number; days?: string[]; unit?: string }[]; stampDiscount?: number;
} | null;

export type StayView = {
  id: number; place_id: number; room_name: string; check_in: string; check_out: string; nights: number; guests: number; pets: StayPet[];
  total: number; status: StayStatus; created_at: string; owner_note: string | null; memo?: string | null;
  guest_name?: string | null; guest_phone?: string | null; stay_guest_name?: string | null; stay_guest_phone?: string | null;
  arrival_method?: string | null; arrival_time?: string | null; price_detail?: PriceDetail; stamp_discount?: number | null;
  payment_status?: string; paid_at?: string | null; decided_at?: string | null; cancelled_at?: string | null; stay_confirmed_at?: string | null;
  cancel_cause?: CancelCause | null; refund_amount?: number; refund_done_at?: string | null; compensation_amount?: number | null;
  cash_receipt?: { type: string; status: string } | null;
  place: { name: string; address: string | null; phone: string | null } | null;
  payment?: PaymentView;
  checkInTime: string | null; checkOutTime: string | null;
  cancelNow: { refund: number; penalty: number; rate: number | null } | null;
  schedule: { until: string; refund: number; rate: number }[];
};

export type OrderView = {
  id: number; place_id: number; items: ReservationLine[]; total: number; pickup_at: string | null; memo: string | null; status: ReservationStatus;
  owner_note: string | null; created_at: string; order_type: OrderType | null; party_size: number | null; payment_status: string; refund_amount: number | null;
  discount?: number | null; accepted_at?: string | null; ready_at?: string | null; completed_at?: string | null; cancelled_at?: string | null;
  cancel_request_status?: string;
  place: { name: string; address: string | null; phone: string | null } | null;
  payment: PaymentView;
  canCancel: boolean; canRequestCancel: boolean;
};

const at = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : null);
const mapLink = (address: string) => `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;

type Step = { label: string; at: string | null; done: boolean; bad?: boolean };

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
      {steps.map((s, i) => (
        <li key={s.label} style={{ display: "grid", gridTemplateColumns: "22px 1fr", columnGap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: s.bad ? "#B42318" : s.done ? "#3B2A20" : "white", border: `2px solid ${s.bad ? "#B42318" : s.done ? "#3B2A20" : "#D9D8D7"}`, boxSizing: "border-box" }}>
              {s.done && <Check size={12} color="white" strokeWidth={3} />}
            </span>
            {i < steps.length - 1 && <span style={{ flex: 1, width: 2, minHeight: 18, background: steps[i + 1].done ? "#3B2A20" : "#E7E6E5" }} />}
          </div>
          <div style={{ paddingBottom: i < steps.length - 1 ? 12 : 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: s.done ? 800 : 600, color: s.bad ? "#B42318" : s.done ? "#111" : "#8A7F78", lineHeight: "20px" }}>{s.label}</div>
            {s.at && <div style={{ fontSize: 12.5, color: "#4A3F38", marginTop: 1 }}>{s.at}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: "16px 0", borderTop: "8px solid #F4F3F2" }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 15.5, fontWeight: 800, color: "#111" }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  if (v == null || v === "") return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", fontSize: 14, lineHeight: 1.55 }}>
      <span style={{ width: 92, flexShrink: 0, color: "#4A3F38" }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, color: "#111", fontWeight: strong ? 800 : 600, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}

function PaymentRows({ payment, method }: { payment: PaymentView; method?: string | null }) {
  if (!payment) return <Row k="결제 수단" v={method === "transfer" ? "계좌이체" : "결제 전"} />;
  const d = payment.detail ?? {};
  const card = [d.cardCompany ? `${d.cardCompany}카드` : null, d.cardNumber].filter(Boolean).join(" ");
  return (
    <>
      <Row k="결제 수단" v={[d.easyPay, payment.method].filter(Boolean).join(" · ") || "카드"} />
      <Row k="카드" v={card || null} />
      <Row k="할부" v={d.installment != null ? (d.installment === 0 ? "일시불" : `${d.installment}개월`) : null} />
      <Row k="승인 번호" v={d.approveNo ?? null} />
      <Row k="승인 일시" v={at(d.approvedAt ?? payment.paidAt)} />
      <Row k="결제 번호" v={payment.orderId ?? null} />
      {payment.refunded > 0 && <Row k="환불" v={`${won(payment.refunded)}${payment.refundedAt ? ` · ${at(payment.refundedAt)}` : ""}`} />}
      {payment.receiptUrl && (
        <a href={payment.receiptUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 11, border: "1px solid #D9D8D7", color: "#111", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>
          <ReceiptText size={16} />카드 영수증 보기
        </a>
      )}
    </>
  );
}

function PlaceRows({ place }: { place: { name: string; address: string | null; phone: string | null } | null }) {
  if (!place) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{place.name}</div>
      {place.address && <div style={{ fontSize: 13.5, color: "#111", lineHeight: 1.55 }}>{place.address}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        {place.address && <a href={mapLink(place.address)} target="_blank" rel="noreferrer" style={pill}><MapPin size={14} />지도에서 보기</a>}
        {place.phone && <a href={`tel:${place.phone}`} style={pill}><Phone size={14} />전화하기</a>}
      </div>
    </div>
  );
}
const pill: React.CSSProperties = { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 11, border: "1px solid #D9D8D7", color: "#111", fontSize: 13.5, fontWeight: 800, textDecoration: "none", background: "white" };

function Shell({ title, number, createdAt, badge, onClose, children }: { title: string; number: string; createdAt: string; badge: { label: string; color: string; background: string }; onClose: () => void; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} className="ggk-order-detail" style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(20,14,10,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <style>{`@media (min-width: 720px) { .ggk-order-detail { align-items: center !important; } .ggk-order-detail > div { border-radius: 20px !important; } }`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "92dvh", overflowY: "auto", background: "white", borderRadius: "20px 20px 0 0", padding: "0 18px 24px", boxSizing: "border-box", wordBreak: "keep-all" }}>
        <div style={{ position: "sticky", top: 0, background: "white", zIndex: 1, display: "flex", alignItems: "center", gap: 8, padding: "16px 0 12px" }}>
          <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 999, background: badge.background, color: badge.color }}>{badge.label}</span>
          <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
          <button onClick={onClose} aria-label="닫기" style={{ width: 34, height: 34, borderRadius: 999, border: "none", background: "#F4F3F2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={17} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#4A3F38", paddingBottom: 14 }}>
          <span>번호 <b style={{ color: "#111" }}>{number}</b></span>
          <button onClick={() => { navigator.clipboard?.writeText(number).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }} style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "transparent", padding: 0, color: "#A05A32", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}><Copy size={12} />{copied ? "복사했어요" : "복사"}</button>
          <span style={{ marginLeft: "auto" }}>{at(createdAt)}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 숙박 예약 상세 */
export function StayDetailSheet({ stay: s, onClose }: { stay: StayView; onClose: () => void }) {
  const st = STAY_STATUS[s.status];
  const cancelled = s.status === "declined" || s.status === "cancelled_by_guest" || s.status === "cancelled_by_owner" || s.status === "no_show";
  const pd = s.price_detail ?? null;
  const steps: Step[] = [
    { label: "예약 요청", at: at(s.created_at), done: true },
    { label: "결제 완료", at: at(s.payment?.paidAt ?? s.paid_at), done: !!(s.payment?.paidAt ?? s.paid_at) },
    ...(cancelled
      ? [{ label: s.status === "declined" ? "숙소가 예약을 받지 못함" : s.status === "no_show" ? "노쇼 처리" : s.status === "cancelled_by_owner" ? "숙소 사정으로 취소" : "예약 취소", at: at(s.cancelled_at ?? s.decided_at), done: true, bad: true }]
      : [
          { label: "숙소 확정", at: at(s.decided_at), done: s.status === "confirmed" || s.status === "completed" },
          { label: `체크인 ${stayDayLabel(s.check_in)}${s.checkInTime ? ` ${s.checkInTime}` : ""}`, at: null, done: s.status === "completed" },
          { label: "이용 완료", at: at(s.stay_confirmed_at), done: s.status === "completed" },
        ]),
  ];
  const arrival = ARRIVAL_METHODS.find((m) => m.id === s.arrival_method)?.label;
  return (
    <Shell title={s.place?.name ?? "숙소 예약"} number={`S${s.id}`} createdAt={s.created_at} badge={{ label: s.status === "completed" ? "이용 완료" : st.label, color: st.color, background: st.background }} onClose={onClose}>
      <section style={{ paddingBottom: 16 }}><Steps steps={steps} /></section>

      <Section title="예약 정보">
        <Row k="객실" v={s.room_name} />
        <Row k="체크인" v={`${stayDayLabel(s.check_in)}${s.checkInTime ? ` ${s.checkInTime}` : ""}`} />
        <Row k="체크아웃" v={`${stayDayLabel(s.check_out)}${s.checkOutTime ? ` ${s.checkOutTime}` : ""}`} />
        <Row k="숙박" v={`${s.nights}박 · ${s.guests}명`} />
        <Row k="반려동물" v={s.pets.map(petLabel).join(", ")} />
        <Row k="방문 수단" v={arrival ?? null} />
        <Row k="도착 예정" v={s.arrival_time ?? null} />
        <Row k="요청 사항" v={s.memo ?? null} />
        {s.owner_note && <Row k="숙소 안내" v={s.owner_note} />}
      </Section>

      <Section title="숙소">
        <PlaceRows place={s.place} />
      </Section>

      <Section title="예약자">
        <Row k="예약자" v={[s.guest_name, s.guest_phone].filter(Boolean).join(" · ") || null} />
        <Row k="이용자" v={s.stay_guest_name ? [s.stay_guest_name, s.stay_guest_phone].filter(Boolean).join(" · ") : "예약자와 같음"} />
      </Section>

      <Section title="결제 금액">
        {pd?.nights?.map((n) => <Row key={n.day} k={`${stayDayLabel(n.day)} 1박`} v={won(n.price)} />)}
        {(pd?.extraGuestTotal ?? 0) > 0 && <Row k="인원 추가" v={won(pd!.extraGuestTotal!)} />}
        {(pd?.petTotal ?? 0) > 0 && <Row k="반려동물 추가" v={won(pd!.petTotal!)} />}
        {pd?.extras?.map((x) => <Row key={x.name} k={x.name} v={x.price <= 0 ? `무료 · ${x.qty}${x.unit === "person" ? "명" : x.unit === "pet" ? "마리" : "개"}` : `${won(x.price)} × ${x.qty}${x.unit === "person" ? "명" : x.unit === "pet" ? "마리" : "개"}${x.days ? ` × ${x.days.length}박` : ""} = ${won(x.amount)}`} />)}
        {(s.stamp_discount ?? 0) > 0 && <Row k="스탬프 할인" v={`-${won(s.stamp_discount ?? 0)}`} />}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 10, borderTop: "1px solid #E7E6E5", fontSize: 16.5, fontWeight: 800, color: "#111" }}><span>총 결제 금액</span><span>{won(s.total)}</span></div>
        {s.cancel_cause && <Row k="취소 결과" v={`${CANCEL_CAUSE_LABEL[s.cancel_cause]} · 환불 ${won(s.refund_amount ?? 0)}${s.compensation_amount ? ` + 배상 ${won(s.compensation_amount)}` : ""}${s.refund_done_at ? ` (${at(s.refund_done_at)} 완료)` : " (처리 중)"}`} />}
      </Section>

      <Section title="결제 정보">
        <PaymentRows payment={s.payment ?? null} />
        {s.cash_receipt && s.cash_receipt.type !== "none" && <Row k="현금영수증" v={s.cash_receipt.status === "issued" ? "발급 완료" : "숙소 발급 대기"} />}
      </Section>

      <Section title="취소·환불">
        {s.cancelNow ? (
          <div style={{ padding: "11px 13px", borderRadius: 11, background: "#FBEDE3", fontSize: 14, color: "#111", lineHeight: 1.6, fontWeight: 600 }}>
            지금 취소하면 <b>{won(s.cancelNow.refund)}</b>{s.cancelNow.penalty > 0 ? `을 돌려받아요(${won(s.cancelNow.penalty)} 공제).` : " 전액을 돌려받아요."}<br />
            <span style={{ fontSize: 13 }}>취소는 내역 카드의 [예약 취소]로 할 수 있어요.</span>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "#111", lineHeight: 1.6 }}>{cancelled || s.status === "completed" ? "이미 끝난 예약이에요." : "체크인 날이 지나 취소할 수 없어요. 문제가 있으면 [문제 있어요]로 알려 주세요."}</div>
        )}
        {s.schedule.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {s.schedule.map((r) => <Row key={r.until} k={`${stayDayLabel(r.until)}까지`} v={r.rate === 0 ? `${won(r.refund)} 전액` : `${won(r.refund)} (${r.rate}% 공제)`} />)}
            <div style={{ fontSize: 12.5, color: "#4A3F38", marginTop: 4 }}>공정거래위원회 소비자분쟁해결기준(숙박업)에 따릅니다.</div>
          </div>
        )}
      </Section>
      <Help />
    </Shell>
  );
}

/** 쇼핑 주문 상세 */
export function OrderDetailSheet({ order: o, onClose }: { order: OrderView; onClose: () => void }) {
  const cancelled = o.status === "rejected" || o.status === "cancelled" || o.status === "no_show";
  const dineIn = o.order_type === "dine_in";
  const steps: Step[] = [
    { label: "주문 접수", at: at(o.created_at), done: true },
    { label: "결제 완료", at: at(o.payment?.paidAt), done: !!o.payment?.paidAt },
    ...(cancelled
      ? [{ label: o.status === "rejected" ? "가게가 주문을 받지 못함" : o.status === "no_show" ? "방문하지 않음" : "주문 취소", at: at(o.cancelled_at), done: true, bad: true }]
      : [
          { label: "가게 수락", at: at(o.accepted_at), done: ["accepted", "ready", "completed"].includes(o.status) },
          { label: dineIn ? "자리 준비 완료" : "준비 완료", at: at(o.ready_at), done: ["ready", "completed"].includes(o.status) },
          { label: "이용 완료", at: at(o.completed_at), done: o.status === "completed" },
        ]),
  ];
  const subtotal = o.items.reduce((sum, l) => sum + l.price * l.qty, 0);
  const tone = cancelled ? { color: "#B42318", background: "#FEE2E2" } : o.status === "completed" ? { color: "#1D4F91", background: "#E3EDFA" } : { color: "#15803D", background: "#DCFCE7" };
  return (
    <Shell title={o.place?.name ?? "쇼핑 주문"} number={`O${o.id}`} createdAt={o.created_at} badge={{ label: STATUS_LABEL[o.status], ...tone }} onClose={onClose}>
      <section style={{ paddingBottom: 16 }}><Steps steps={steps} /></section>

      <Section title="주문 정보">
        <Row k="주문 방식" v={`${ORDER_TYPE_LABEL[o.order_type ?? "pickup"]}${o.party_size ? ` · ${o.party_size}명` : ""}`} />
        <Row k={dineIn ? "방문 시간" : "찾아갈 시간"} v={at(o.pickup_at)} />
        <Row k="요청 사항" v={o.memo} />
        {o.owner_note && <Row k="가게 안내" v={o.owner_note} />}
      </Section>

      <Section title="가게">
        <PlaceRows place={o.place} />
      </Section>

      <Section title="주문 금액">
        {o.items.map((l) => <Row key={l.name} k={`${l.name} × ${l.qty}`} v={won(l.price * l.qty)} />)}
        {(o.discount ?? 0) > 0 && <><Row k="상품 금액" v={won(subtotal)} /><Row k="쿠폰 할인" v={`-${won(o.discount ?? 0)}`} /></>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 10, borderTop: "1px solid #E7E6E5", fontSize: 16.5, fontWeight: 800, color: "#111" }}><span>총 결제 금액</span><span>{won(o.total)}</span></div>
        {(o.refund_amount ?? 0) > 0 && <Row k="환불" v={won(o.refund_amount ?? 0)} />}
      </Section>

      <Section title="결제 정보">
        <PaymentRows payment={o.payment} />
      </Section>

      <Section title="취소 안내">
        <div style={{ fontSize: 14, color: "#111", lineHeight: 1.65, fontWeight: 600 }}>
          {o.canCancel ? <>가게가 수락하기 전이라 <b>지금 바로 취소</b>할 수 있어요. 전액 돌려받아요.</>
            : o.canRequestCancel ? <>가게가 이미 수락해서 준비 중이에요. [취소 요청]을 보내면 가게가 받아 줄 때 전액 돌려받아요.</>
            : o.cancel_request_status === "open" ? <>취소 요청을 보냈어요. 가게 답을 기다리는 중이에요.</>
            : cancelled ? <>취소된 주문이에요.{o.payment_status === "refunded" ? " 전액 환불했어요." : ""}</>
            : <>이용이 끝난 주문이라 취소할 수 없어요.</>}
        </div>
        <div style={{ fontSize: 12.5, color: "#4A3F38", marginTop: 6, lineHeight: 1.6 }}>가게가 수락하기 전에는 언제든 바로 취소돼요. 가게가 시간 안에 확인하지 않으면 자동으로 취소되고 전액 환불돼요.</div>
      </Section>
      <Help />
    </Shell>
  );
}

function Help() {
  return (
    <div style={{ borderTop: "8px solid #F4F3F2", paddingTop: 14, fontSize: 12.5, color: "#4A3F38", lineHeight: 1.65 }}>
      도움이 필요하면 먼저 숙소·가게에 전화해 주세요. 해결되지 않으면 <a href="mailto:infoker12@naver.com" style={{ color: "#A05A32", fontWeight: 800 }}>infoker12@naver.com</a>으로 번호와 함께 알려 주세요.<br />
      펫츠로드는 통신판매중개자이며 이용 계약의 당사자는 각 숙소·가게입니다.
    </div>
  );
}

