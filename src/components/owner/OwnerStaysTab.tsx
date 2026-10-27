"use client";

// 사장님 센터의 "숙박 예약" 화면 — 숙소 사장님이 씁니다.
//   ① 예약 요청 처리: 확인 대기 → 확정 / 거절,  확정 → 이용 완료 / 노쇼 / 숙소 사정으로 취소
//      손님 연락처·반려동물 정보(종류·크기·몸무게·이름)·요청 사항·예상 금액(1박씩 나눠서)을 보여 줍니다.
//   ② 예약 달력: 객실을 골라 날짜를 눌러 고른 뒤 "예약 막기 / 막기 풀기 / 이 날 요금 정하기 / 기본 요금으로".
//      확정된 예약은 파란 칸, 확인 대기 예약은 주황 점으로 보입니다.
// 결제는 숙소에서 직접 받습니다(온라인 결제는 PG 계약 후). 규칙은 src/lib/lodgingBooking.ts,
// 서버는 /api/owner/lodging/bookings · /api/owner/lodging/calendar.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Phone, PawPrint } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import { supabase } from "@/lib/supabase";
import { won } from "@/lib/ownerPlans";
import { PET_SIZES, PET_SPECIES } from "@/lib/lodgingRules";
import {
  addDays, isOpenStay, kstToday, nightPrice, ownerNextStays, STAY_STATUS, type RoomDay, type StayPet, type StayStatus,
} from "@/lib/lodgingBooking";

type Booking = {
  id: number; room_id: number; room_name: string; guest_name: string; guest_phone: string; check_in: string; check_out: string; nights: number; guests: number;
  pets: StayPet[]; price_detail: { nights?: { day: string; price: number }[]; roomTotal?: number; extraGuestTotal?: number; petTotal?: number };
  total: number; memo: string | null; status: StayStatus; owner_note: string | null; created_at: string;
};
type Room = { id: number; name: string; base_price: number; weekend_price: number | null; is_active: boolean };
type CalBooking = { id: number; guest_name: string; check_in: string; check_out: string; status: StayStatus };

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const tag = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: bg, color, flexShrink: 0 });
const chip = (on: boolean): React.CSSProperties => ({ padding: "7px 12px", borderRadius: 999, border: `1px solid ${on ? "#1D4F91" : "#e2dcc8"}`, background: on ? "#E3EDFA" : "white", color: on ? "#1D4F91" : "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const actionButton = (kind: "primary" | "plain" | "danger", disabled = false): React.CSSProperties => ({
  padding: "8px 13px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? "#f3c7c5" : "#e2e4e8"}`,
  background: disabled ? "#d6d3c9" : kind === "primary" ? "#B45309" : "white", color: kind === "primary" ? "white" : kind === "danger" ? "#b42318" : "#555",
});
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;
const shortWon = (n: number) => (n >= 10000 && n % 1000 === 0 ? `${(n / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만` : n.toLocaleString("ko-KR"));
const petText = (p: StayPet) => [
  PET_SPECIES.find((s) => s.id === p.species)?.label,
  p.size ? PET_SIZES.find((s) => s.id === p.size)?.label : null,
  p.weight != null ? `${p.weight}kg` : null,
  p.name ? `'${p.name}'` : null,
].filter(Boolean).join(" ");
const ACTION_LABEL: Partial<Record<StayStatus, string>> = { confirmed: "예약 확정", declined: "거절", completed: "이용 완료", no_show: "노쇼", cancelled_by_owner: "숙소 사정으로 취소" };

type Filter = "waiting" | "upcoming" | "past" | "all";

export default function OwnerStaysTab({ placeId, isPreview, canAct, onCount }: { placeId: number; isPreview: boolean; canAct: boolean; onCount?: (n: number) => void }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [ready, setReady] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init: RequestInit = {}, extra = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const query = [isPreview ? `placeId=${placeId}` : "", extra].filter(Boolean).join("&");
    const res = await fetch(`${path}${query ? `?${query}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([call("/api/owner/lodging/bookings"), call("/api/owner/lodging")]);
      setReady(b.ready !== false);
      setBookings(b.bookings ?? []);
      setRooms(l.rooms ?? []);
      const waiting = (b.bookings ?? []).filter((x: Booking) => x.status === "requested").length;
      onCount?.(waiting);
      // 아래 탭바의 알림 숫자도 바로 맞춥니다(TabBar가 듣고 있음)
      window.dispatchEvent(new CustomEvent("ggk-owner-waiting", { detail: waiting }));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
  }, [call, onCount]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  const change = async (b: Booking, status: StayStatus) => {
    if (busy) return;
    let ownerNote: string | null = null;
    if (status === "declined" || status === "cancelled_by_owner") {
      const reason = window.prompt(`${status === "declined" ? "거절" : "취소"} 이유를 손님에게 남겨 주세요(선택).\n예: 그 날짜는 이미 다른 예약이 있어요`, "");
      if (reason === null) return;
      ownerNote = reason;
    } else if (status === "no_show" && !window.confirm(`${b.guest_name}님 예약을 노쇼로 처리할까요?`)) return;
    setBusy(true);
    try { await call("/api/owner/lodging/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, status, ownerNote }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했어요."); }
    finally { setBusy(false); }
  };

  const today = kstToday();
  const groups = useMemo(() => {
    const list = bookings ?? [];
    return {
      waiting: list.filter((b) => b.status === "requested"),
      upcoming: list.filter((b) => b.status === "confirmed" && b.check_out >= today).sort((a, b) => a.check_in.localeCompare(b.check_in)),
      past: list.filter((b) => !isOpenStay(b.status) || b.check_out < today),
      all: list,
    };
  }, [bookings, today]);

  if (!bookings) return <div style={{ ...card, textAlign: "center" }}>{error ? <span style={{ fontSize: 13, color: "#999" }}>{error}</span> : <LogoLoader />}</div>;
  if (!ready) {
    return (
      <div style={{ ...card, fontSize: 13, color: "#9a3412", background: "#fff7ed", borderColor: "#fed7aa", lineHeight: 1.7 }}>
        숙박 예약 기능을 준비하고 있어요.
        {isPreview && <> Supabase SQL 편집기에서 <b>scripts/sql/lodging-bookings.sql</b>을 한 번 실행하면 열려요.</>}
      </div>
    );
  }
  const shown = groups[filter];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>숙박 예약</div>
        <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.7 }}>
          손님이 날짜·인원·반려동물 정보를 보내면 여기서 확정하거나 거절해 주세요.<br />
          결제는 숙소에서 직접 받아요. 금액은 올려 두신 요금으로 계산한 예상 금액이에요.
        </div>
        {!canAct && <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>보기 전용이에요. 대신 처리하려면 위의 &quot;사장님 요청으로 대신 처리하기&quot;를 켜 주세요.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {([["waiting", "확인 대기"], ["upcoming", "다가오는 예약"], ["past", "지난·취소"], ["all", "전체"]] as [Filter, string][]).map(([key, text]) => (
            <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key} style={chip(filter === key)}>{text} {groups[key].length}</button>
          ))}
        </div>
        {error && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {shown.length === 0 && <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "24px 0" }}>{filter === "waiting" ? "확인을 기다리는 예약이 없어요." : "예약이 없어요."}</div>}
          {shown.map((b) => {
            const s = STAY_STATUS[b.status];
            const detail = b.price_detail ?? {};
            return (
              <div key={b.id} style={{ padding: "13px 14px", borderRadius: 14, border: `1px solid ${b.status === "requested" ? "#FDE68A" : "#f0ece0"}`, background: b.status === "requested" ? "#FFFDF5" : "white" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={tag(s.background, s.color)}>{s.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>{dayLabel(b.check_in)} ~ {dayLabel(b.check_out)}</span>
                  <span style={{ fontSize: 12.5, color: "#888" }}>{b.nights}박 · {b.room_name}</span>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 12.5, color: "#444" }}>
                  <span><b>{b.guest_name}</b>님 · {b.guests}명</span>
                  <a href={`tel:${b.guest_phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#1D4F91", fontWeight: 700, textDecoration: "none" }}><Phone size={12} />{b.guest_phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3")}</a>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 6, fontSize: 12.5, color: "#444", lineHeight: 1.6 }}>
                  <PawPrint size={13} color="#B45309" style={{ flexShrink: 0, marginTop: 3 }} />
                  <span>{b.pets.length}마리 — {b.pets.map(petText).join(", ")}</span>
                </div>
                {b.memo && <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 9, background: "#F7F3E8", fontSize: 12.5, color: "#555", lineHeight: 1.6, whiteSpace: "pre-line" }}>요청 사항: {b.memo}</div>}
                <div style={{ marginTop: 8, fontSize: 12, color: "#888", lineHeight: 1.6 }}>
                  객실 {won(detail.roomTotal ?? b.total)}
                  {(detail.extraGuestTotal ?? 0) > 0 && ` + 인원 추가 ${won(detail.extraGuestTotal!)}`}
                  {(detail.petTotal ?? 0) > 0 && ` + 반려동물 ${won(detail.petTotal!)}`}
                  <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 800, color: "#B45309" }}>예상 {won(b.total)}</span>
                  <span style={{ marginLeft: 4 }}>· 현장 결제</span>
                </div>
                {b.owner_note && <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>남긴 말: {b.owner_note}</div>}
                {canAct && ownerNextStays(b.status).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {ownerNextStays(b.status).map((next) => (
                      <button key={next} onClick={() => change(b, next)} disabled={busy} style={actionButton(next === "confirmed" || next === "completed" ? "primary" : next === "declined" || next === "cancelled_by_owner" || next === "no_show" ? "danger" : "plain", busy)}>
                        {ACTION_LABEL[next]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <StayCalendar rooms={rooms} call={call} canAct={canAct} />
    </div>
  );
}

/* ── 예약 달력 ── */
function StayCalendar({ rooms, call, canAct }: { rooms: Room[]; call: (path: string, init?: RequestInit, extra?: string) => Promise<any>; canAct: boolean }) {
  const today = kstToday();
  const [roomId, setRoomId] = useState<number | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7)); // "2026-10"
  const [days, setDays] = useState<RoomDay[]>([]);
  const [bookings, setBookings] = useState<CalBooking[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const activeRoomId = roomId ?? rooms[0]?.id ?? null;
  const room = rooms.find((r) => r.id === activeRoomId) ?? null;

  const first = `${month}-01`;
  const next = addDays(first, 32).slice(0, 7) + "-01";
  const load = useCallback(async () => {
    if (!activeRoomId) return;
    try {
      const json = await call("/api/owner/lodging/calendar", {}, `roomId=${activeRoomId}&from=${first}&to=${next}`);
      setDays(json.days ?? []);
      setBookings(json.bookings ?? []);
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); }
  }, [activeRoomId, call, first, next]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  if (rooms.length === 0) {
    return <div style={{ ...card, fontSize: 13, color: "#999", lineHeight: 1.7 }}><b style={{ color: "#444" }}>예약 달력</b><br />&ldquo;숙소·객실&rdquo; 메뉴에서 객실을 먼저 올려 주세요.</div>;
  }

  const byDay = new Map(days.map((d) => [d.day, d]));
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const count = Math.round((new Date(`${next}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / 86_400_000);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  const monthStart = today.slice(0, 7);
  const lastMonth = addDays(today, 180).slice(0, 7);
  const shift = (step: 1 | -1) => { setMonth(addDays(step === 1 ? next : addDays(first, -1), 0).slice(0, 7)); setSelected([]); };
  const toggle = (day: string) => setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const apply = async (patch: { closed?: boolean; price?: number | null }, done: string) => {
    if (!activeRoomId || selected.length === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await call("/api/owner/lodging/calendar", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: activeRoomId, days: selected, ...patch }) });
      setMessage({ ok: true, text: `${selected.length}일 ${done}` });
      setSelected([]);
      setPrice("");
      await load();
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." }); }
    finally { setBusy(false); }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <CalendarDays size={17} color="#1D4F91" />
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>예약 달력</div>
      </div>
      <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.7 }}>
        날짜를 눌러 고른 뒤 예약을 막거나 그날 요금을 정해 주세요.<br />
        성수기·연휴 요금이나 쉬는 날을 미리 정해 두면 손님에게 그대로 보여요.
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {rooms.map((r) => <button key={r.id} onClick={() => { setRoomId(r.id); setSelected([]); }} aria-pressed={r.id === activeRoomId} style={chip(r.id === activeRoomId)}>{r.name}{!r.is_active ? " (판매 중지)" : ""}</button>)}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 14 }}>
        <button onClick={() => shift(-1)} disabled={month <= monthStart} aria-label="이전 달" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #e2e4e8", background: "white", cursor: "pointer", opacity: month <= monthStart ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={15} /></button>
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#333", minWidth: 110, textAlign: "center" }}>{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</div>
        <button onClick={() => shift(1)} disabled={month >= lastMonth} aria-label="다음 달" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #e2e4e8", background: "white", cursor: "pointer", opacity: month >= lastMonth ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={15} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginTop: 10 }}>
        {WEEK.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i === 0 ? "#DC2626" : i === 6 ? "#1D4F91" : "#999", padding: "2px 0" }}>{w}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const past = day < today;
          const d = byDay.get(day);
          const confirmed = bookings.find((b) => b.status === "confirmed" && b.check_in <= day && day < b.check_out);
          const waiting = bookings.filter((b) => b.status === "requested" && b.check_in <= day && day < b.check_out).length;
          const on = selected.includes(day);
          const p = room ? nightPrice(room, day, d) : 0;
          return (
            <button
              key={day}
              onClick={() => canAct && !past && toggle(day)}
              disabled={!canAct || past}
              aria-pressed={on}
              aria-label={`${dayLabel(day)}${d?.closed ? " 예약 막음" : ""}${confirmed ? ` ${confirmed.guest_name}님 예약` : ""}`}
              style={{
                position: "relative", minHeight: 58, padding: "5px 3px", borderRadius: 9, textAlign: "center", fontFamily: "inherit",
                border: on ? "2px solid #B45309" : `1px solid ${confirmed ? "#9db4d6" : "#eee"}`,
                background: past ? "#fafafa" : d?.closed ? "repeating-linear-gradient(135deg,#f3f3f3 0 6px,#e9e9e9 6px 12px)" : confirmed ? "#E3EDFA" : "white",
                cursor: canAct && !past ? "pointer" : "default", opacity: past ? 0.45 : 1,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#333" }}>{Number(day.slice(8, 10))}</div>
              {!past && (d?.closed
                ? <div style={{ fontSize: 10.5, fontWeight: 800, color: "#888", marginTop: 3 }}>막음</div>
                : <div style={{ fontSize: 10.5, fontWeight: d?.price != null ? 800 : 600, color: d?.price != null ? "#B45309" : "#999", marginTop: 3 }}>{shortWon(p)}</div>)}
              {confirmed && <div style={{ fontSize: 10, fontWeight: 800, color: "#1D4F91", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{confirmed.guest_name}</div>}
              {waiting > 0 && <span aria-hidden style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, borderRadius: 999, background: "#F59E0B" }} />}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: "#888" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#E3EDFA", border: "1px solid #9db4d6", verticalAlign: -1 }} /> 확정 예약</span>
        <span><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: "#F59E0B" }} /> 확인 대기 요청</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#e9e9e9", verticalAlign: -1 }} /> 예약 막음</span>
        <span style={{ color: "#B45309", fontWeight: 700 }}>주황 요금 = 따로 정한 요금</span>
      </div>

      {canAct && selected.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#F7F3E8", display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#444" }}>{selected.length}일 골랐어요 <button onClick={() => setSelected([])} style={{ marginLeft: 6, border: "none", background: "transparent", color: "#999", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>선택 풀기</button></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => apply({ closed: true }, "예약을 막았어요.")} disabled={busy} style={actionButton("danger", busy)}>예약 막기</button>
            <button onClick={() => apply({ closed: false }, "예약을 다시 받아요.")} disabled={busy} style={actionButton("plain", busy)}>막기 풀기</button>
            <button onClick={() => apply({ price: null }, "기본 요금으로 돌렸어요.")} disabled={busy} style={actionButton("plain", busy)}>기본 요금으로</button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 160px" }}>
              <input value={price ? Number(price).toLocaleString("ko-KR") : ""} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, "").slice(0, 8))} placeholder="이 날들의 1박 요금" inputMode="numeric" style={{ width: "100%", padding: "9px 34px 9px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", textAlign: "right", fontWeight: 700, fontFamily: "inherit" }} />
              <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: "#888" }}>원</span>
            </div>
            <button onClick={() => apply({ price: Number(price) }, "요금을 정했어요.")} disabled={busy || price === ""} style={actionButton("primary", busy || price === "")}>요금 정하기</button>
          </div>
        </div>
      )}
      {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
    </div>
  );
}
