"use client";

// 사장님 센터의 "숙소·객실" 화면 — 숙소 사장님(users.owner_kind = 'lodging')이 씁니다.
//   ① 숙소 기본 정보·반려동물 동반 규정: 체크인·아웃, 받을 수 있는 동물·크기·몸무게·마릿수, 추가 요금,
//      반려동물 편의시설, 동반 수칙, 이용 수칙, 취소·환불 규정
//   ② 객실: 이름·유형·사진(최대 6장)·평일/주말 1박 요금·기준/최대 인원·인원 추가 요금·최대 마릿수·편의시설,
//      판매 켜기/끄기, ↑ ↓ 순서
// 동반 조건이 틀리면 손님이 현장에서 입실을 거부당하므로, 손님 화면에는 이 값을 그대로 크게 보여 줍니다.
// 규칙(글자 수·다듬기)은 src/lib/lodgingRules.ts, 서버는 /api/owner/lodging(…/rooms, …/image).

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BedDouble, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import LodgingPartnerApply from "@/components/owner/LodgingPartnerApply";
import { supabase } from "@/lib/supabase";
import {
  EMPTY_PROFILE, LODGING_SHORT_MAX, PEAK_PERIODS_MAX, LODGING_TEXT_MAX, PET_AMENITIES, PET_SIZES, PET_SPECIES, ROOM_AMENITIES, ROOM_DESC_MAX,
  ROOM_IMAGES_MAX, ROOM_NAME_MAX, ROOM_TYPE_MAX, ROOM_TYPE_SUGGESTIONS, ROOMS_PER_PLACE_MAX, petPolicySummary, roomPriceText,
  type LodgingProfile, type PetSize, type PetSpecies,
} from "@/lib/lodgingRules";

type Room = {
  id: number; name: string; room_type: string | null; description: string | null; base_price: number; weekend_price: number | null;
  std_guests: number; max_guests: number; extra_guest_fee: number | null; max_pets: number | null; images: string[]; amenities: string[]; is_active: boolean;
};
type State = { ready: boolean; profile: (LodgingProfile & { updated_at?: string }) | null; rooms: Room[] };

/** 입력칸용(숫자도 글자로 들고 있다가 저장할 때 바꿈) */
type ProfileForm = Omit<LodgingProfile, "max_pet_weight_kg" | "max_pets" | "pet_fee" | "check_in" | "check_out" | "pet_fee_note" | "pet_rules" | "stay_rules" | "refund_policy"> & {
  check_in: string; check_out: string; max_pet_weight_kg: string; max_pets: string; pet_fee: string;
  pet_fee_note: string; pet_rules: string; stay_rules: string; refund_policy: string;
};
type RoomForm = {
  name: string; room_type: string; description: string; base_price: string; weekend_price: string; std_guests: string; max_guests: string;
  extra_guest_fee: string; max_pets: string; images: string[]; amenities: string[]; is_active: boolean;
};
const EMPTY_ROOM: RoomForm = { name: "", room_type: "", description: "", base_price: "", weekend_price: "", std_guests: "2", max_guests: "2", extra_guest_fee: "", max_pets: "", images: [], amenities: [], is_active: true };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const str = (v: number | string | null | undefined) => (v == null ? "" : String(v));
const toProfileForm = (p: LodgingProfile | null): ProfileForm => {
  const src = p ?? EMPTY_PROFILE;
  return {
    ...src,
    check_in: src.check_in ?? "", check_out: src.check_out ?? "",
    max_pet_weight_kg: str(src.max_pet_weight_kg), max_pets: str(src.max_pets), pet_fee: str(src.pet_fee),
    pet_fee_note: src.pet_fee_note ?? "", pet_rules: src.pet_rules ?? "", stay_rules: src.stay_rules ?? "", refund_policy: src.refund_policy ?? "",
  };
};
const toRoomForm = (r: Room): RoomForm => ({
  name: r.name, room_type: r.room_type ?? "", description: r.description ?? "", base_price: str(r.base_price), weekend_price: str(r.weekend_price),
  std_guests: str(r.std_guests), max_guests: str(r.max_guests), extra_guest_fee: str(r.extra_guest_fee), max_pets: str(r.max_pets),
  images: r.images ?? [], amenities: r.amenities ?? [], is_active: r.is_active,
});
const digits = (v: string, max = 8) => v.replace(/[^\d]/g, "").slice(0, max);

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 6, flexWrap: "wrap" };
const optional: React.CSSProperties = { fontWeight: 600, color: "#aaa" };
const section: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "#1D4F91", margin: "4px 0 -2px" };
const primaryButton = (disabled: boolean): React.CSSProperties => ({ padding: "10px 16px", borderRadius: 10, border: "none", background: disabled ? "#d6d3c9" : "#B45309", color: "white", fontSize: 13, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit" });
const iconButton: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid #e2e4e8", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const tag = (bg: string, color: string): React.CSSProperties => ({ fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: bg, color, flexShrink: 0 });
const chip = (on: boolean): React.CSSProperties => ({ padding: "7px 12px", borderRadius: 999, border: `1px solid ${on ? "#1D4F91" : "#e2dcc8"}`, background: on ? "#E3EDFA" : "white", color: on ? "#1D4F91" : "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** 원 단위 숫자 입력칸 */
function MoneyInput({ value, onChange, placeholder = "0", disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div style={{ position: "relative" }}>
      <input value={value ? Number(value).toLocaleString("ko-KR") : ""} onChange={(e) => onChange(digits(e.target.value))} placeholder={placeholder} inputMode="numeric" disabled={disabled} style={{ ...input, paddingRight: 34, textAlign: "right", fontWeight: 700 }} />
      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#888" }}>원</span>
    </div>
  );
}

export default function OwnerLodgingTab({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileForm>(toProfileForm(null));
  const [profileSaved, setProfileSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [room, setRoom] = useState<RoomForm>(EMPTY_ROOM);
  const [busy, setBusy] = useState<"" | "profile" | "room" | "upload" | "list">("");
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const call = useCallback(async (path: string, init: RequestInit = {}, extra = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    // 관리자가 다른 숙소를 볼 때만 주소에 숙소 번호를 붙입니다(사장님 본인은 서버가 본인 숙소로 고정).
    const query = [isPreview ? `placeId=${placeId}` : "", extra].filter(Boolean).join("&");
    const res = await fetch(`${path}${query ? `?${query}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const load = useCallback(async (resetProfile = false) => {
    try {
      const next: State = await call("/api/owner/lodging");
      setState(next);
      if (resetProfile) setProfile(toProfileForm(next.profile));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했어요."); }
  }, [call]);
  useEffect(() => { const timer = window.setTimeout(() => load(true), 0); return () => window.clearTimeout(timer); }, [load]);

  // ── ① 숙소 기본 정보·동반 규정 ──
  const setP = (patch: Partial<ProfileForm>) => { setProfile((prev) => ({ ...prev, ...patch })); setProfileSaved(null); };
  const saveProfile = async () => {
    if (busy) return;
    setBusy("profile");
    setError(null);
    try {
      await call("/api/owner/lodging", json("PUT", profile));
      setProfileSaved("저장했어요.");
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(""); }
  };

  // ── ② 객실 ──
  const setR = (patch: Partial<RoomForm>) => setRoom((prev) => ({ ...prev, ...patch }));
  const open = (target: Room | "new") => {
    setEditing(target);
    setRoom(target === "new" ? EMPTY_ROOM : toRoomForm(target));
    setError(null);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const upload = async (files: FileList | null) => {
    if (!files || busy) return;
    const room_images = [...room.images];
    setBusy("upload");
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (room_images.length >= ROOM_IMAGES_MAX) { setError(`객실 사진은 ${ROOM_IMAGES_MAX}장까지 올릴 수 있어요.`); break; }
        if (!IMAGE_TYPES.includes(file.type)) { setError("JPG·PNG·WEBP 사진만 올릴 수 있어요."); continue; }
        if (file.size > 5 * 1024 * 1024) { setError("사진은 한 장에 5MB까지 올릴 수 있어요."); continue; }
        const body = new FormData();
        body.append("file", file);
        const result = await call("/api/owner/lodging/image", { method: "POST", body });
        room_images.push(result.url);
        setR({ images: [...room_images] });
      }
    } catch (e) { setError(e instanceof Error ? e.message : "사진을 올리지 못했어요."); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  };
  const moveImage = (index: number, step: -1 | 1) => {
    const next = [...room.images];
    const other = index + step;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    setR({ images: next });
  };
  const saveRoom = async () => {
    if (!editing || busy) return;
    setBusy("room");
    setError(null);
    try {
      if (editing === "new") await call("/api/owner/lodging/rooms", json("POST", room));
      else await call("/api/owner/lodging/rooms", json("PATCH", { id: editing.id, ...room }));
      setEditing(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(""); }
  };
  const quick = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy("list");
    try { await call("/api/owner/lodging/rooms", json("PATCH", body)); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했어요."); }
    finally { setBusy(""); }
  };
  const remove = async (target: Room) => {
    if (busy || !window.confirm(`"${target.name}" 객실을 삭제할까요?`)) return;
    setBusy("list");
    try { await call("/api/owner/lodging/rooms", { method: "DELETE" }, `id=${target.id}`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했어요."); }
    finally { setBusy(""); }
  };

  if (!state) return <div style={{ ...card, textAlign: "center" }}>{error ? <span style={{ fontSize: 13, color: "#999" }}>{error}</span> : <LogoLoader />}</div>;
  if (!state.ready) {
    return (
      <div style={{ ...card, fontSize: 13, color: "#9a3412", background: "#fff7ed", borderColor: "#fed7aa", lineHeight: 1.7 }}>
        숙소·객실 기능을 준비하고 있어요.
        {isPreview && <> Supabase SQL 편집기에서 <b>scripts/sql/lodging.sql</b>을 한 번 실행하면 열려요.</>}
      </div>
    );
  }

  const disabled = !canAct;
  const hasDog = profile.pet_species.includes("dog");
  const summary = state.profile ? petPolicySummary(state.profile) : null;
  const canSaveRoom = room.name.trim() !== "" && room.base_price !== "" && busy === "";
  const area = (key: "pet_rules" | "stay_rules" | "refund_policy", title: string, placeholder: string) => (
    <div>
      <div style={label}>{title} <span style={optional}>(선택) {profile[key].length}/{LODGING_TEXT_MAX}</span></div>
      <textarea value={profile[key]} onChange={(e) => setP({ [key]: e.target.value })} maxLength={LODGING_TEXT_MAX} rows={3} placeholder={placeholder} disabled={disabled} style={{ ...input, resize: "vertical", lineHeight: 1.55 }} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 입점 신청·상태 — 승인 전에는 손님 예약이 열리지 않습니다 */}
      {!isPreview && <LodgingPartnerApply />}
      {/* ① 숙소 기본 정보·반려동물 동반 규정 */}
      <div style={card}>
        <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>반려동물 동반 규정</div>
        <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.7 }}>
          손님이 예약하기 전에 가장 먼저 확인하는 정보예요.<br />
          실제와 다르면 손님이 입실을 거부당할 수 있으니 정확하게 적어 주세요.
        </div>
        {summary && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 11, background: "#E3EDFA", fontSize: 12.5, color: "#1D4F91", lineHeight: 1.6 }}>
            <b>손님에게 보이는 요약</b><br />{summary}
          </div>
        )}
        {!canAct && <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>보기 전용이에요. 대신 수정하려면 위의 &quot;사장님 요청으로 대신 처리하기&quot;를 켜 주세요.</div>}

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={section}>동반 가능한 반려동물</div>
          <div>
            <div style={label}>동물 종류</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PET_SPECIES.map((s) => (
                <button key={s.id} disabled={disabled} onClick={() => setP({ pet_species: toggle<PetSpecies>(profile.pet_species, s.id) })} aria-pressed={profile.pet_species.includes(s.id)} style={chip(profile.pet_species.includes(s.id))}>{s.label}</button>
              ))}
            </div>
          </div>
          {hasDog && (
            <div>
              <div style={label}>강아지 크기 <span style={optional}>받을 수 있는 크기를 모두 골라 주세요</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PET_SIZES.map((s) => (
                  <button key={s.id} disabled={disabled} onClick={() => setP({ pet_sizes: toggle<PetSize>(profile.pet_sizes, s.id) })} aria-pressed={profile.pet_sizes.includes(s.id)} style={chip(profile.pet_sizes.includes(s.id))}>
                    {s.label} <span style={{ fontWeight: 600, opacity: 0.7 }}>{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div>
              <div style={label}>한 마리 최대 몸무게 <span style={optional}>(선택)</span></div>
              <div style={{ position: "relative" }}>
                <input value={profile.max_pet_weight_kg} onChange={(e) => setP({ max_pet_weight_kg: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) })} placeholder="제한 없음" inputMode="decimal" disabled={disabled} style={{ ...input, paddingRight: 36, textAlign: "right" }} />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#888" }}>kg</span>
              </div>
            </div>
            <div>
              <div style={label}>객실당 최대 마릿수 <span style={optional}>(선택)</span></div>
              <div style={{ position: "relative" }}>
                <input value={profile.max_pets} onChange={(e) => setP({ max_pets: digits(e.target.value, 2) })} placeholder="제한 없음" inputMode="numeric" disabled={disabled} style={{ ...input, paddingRight: 36, textAlign: "right" }} />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#888" }}>마리</span>
              </div>
            </div>
            <div>
              <div style={label}>추가 요금(1마리·1박) <span style={optional}>무료면 0</span></div>
              <MoneyInput value={profile.pet_fee} onChange={(v) => setP({ pet_fee: v })} placeholder="안 적음" disabled={disabled} />
            </div>
          </div>
          <div>
            <div style={label}>추가 요금 설명 <span style={optional}>(선택)</span></div>
            <input value={profile.pet_fee_note} onChange={(e) => setP({ pet_fee_note: e.target.value })} maxLength={LODGING_SHORT_MAX} placeholder="예: 대형견은 1박 2만 원 / 3마리부터 1마리당 1만 원 추가" disabled={disabled} style={input} />
          </div>

          <div style={section}>반려동물 편의시설</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PET_AMENITIES.map((a) => (
              <button key={a} disabled={disabled} onClick={() => setP({ pet_amenities: toggle(profile.pet_amenities, a) })} aria-pressed={profile.pet_amenities.includes(a)} style={chip(profile.pet_amenities.includes(a))}>{a}</button>
            ))}
          </div>

          <div style={section}>체크인 · 수칙 · 환불</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div>
              <div style={label}>체크인</div>
              <input type="time" value={profile.check_in} onChange={(e) => setP({ check_in: e.target.value })} disabled={disabled} style={input} />
            </div>
            <div>
              <div style={label}>체크아웃</div>
              <input type="time" value={profile.check_out} onChange={(e) => setP({ check_out: e.target.value })} disabled={disabled} style={input} />
            </div>
          </div>
          <div style={section}>성수기 · 예약 확정</div>
          <div>
            <div style={label}>성수기 기간 <span style={optional}>취소 공제율이 성수기 기준으로 계산돼요. 비우면 여름 7/15~8/24, 겨울 12/20~2/20</span></div>
            <div style={{ display: "grid", gap: 6 }}>
              {profile.peak_periods.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input value={p.from} onChange={(e) => setP({ peak_periods: profile.peak_periods.map((x, j) => (j === i ? { ...x, from: e.target.value.slice(0, 5) } : x)) })} placeholder="07-15" disabled={disabled} style={{ ...input, width: 90, textAlign: "center" }} />
                  <span style={{ color: "#888" }}>~</span>
                  <input value={p.to} onChange={(e) => setP({ peak_periods: profile.peak_periods.map((x, j) => (j === i ? { ...x, to: e.target.value.slice(0, 5) } : x)) })} placeholder="08-24" disabled={disabled} style={{ ...input, width: 90, textAlign: "center" }} />
                  {canAct && <button onClick={() => setP({ peak_periods: profile.peak_periods.filter((_, j) => j !== i) })} aria-label="이 기간 빼기" style={{ ...iconButton, borderColor: "#f3c7c5" }}><X size={13} color="#b42318" /></button>}
                </div>
              ))}
              {canAct && profile.peak_periods.length < PEAK_PERIODS_MAX && (
                <button onClick={() => setP({ peak_periods: [...profile.peak_periods, { from: "", to: "" }] })} style={{ ...chip(false), justifySelf: "start" }}>+ 성수기 기간 추가 (월-일)</button>
              )}
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#444", cursor: disabled ? "default" : "pointer", lineHeight: 1.6 }}>
            <input type="checkbox" checked={profile.instant_confirm} onChange={(e) => setP({ instant_confirm: e.target.checked })} disabled={disabled} style={{ width: 17, height: 17, marginTop: 2 }} />
            <span><b>즉시 확정</b> <span style={optional}>켜면 손님이 결제하는 순간 예약이 확정돼요. 끄면 24시간 안에 직접 확정해야 해요(미확정이면 자동 취소).</span></span>
          </label>

          {area("pet_rules", "반려동물 동반 수칙", "예: 침대·소파 위 금지(전용 방석 제공)\n객실 내 배변 시 청소비 3만 원\n공용 공간에서는 리드줄 착용")}
          {area("stay_rules", "숙소 이용 수칙", "예: 밤 10시 이후 바비큐·야외 소음 금지\n객실 내 흡연 금지")}
          {area("refund_policy", "취소·환불 규정", "예: 이용 7일 전까지 전액 환불\n3일 전까지 50% 환불\n이후 환불 불가")}

          {error && !editing && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
          {canAct && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={saveProfile} disabled={busy !== ""} style={{ ...primaryButton(busy !== ""), flex: "0 0 auto" }}>{busy === "profile" ? "저장 중…" : "동반 규정 저장"}</button>
              {profileSaved && <span role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#15803D" }}>{profileSaved}</span>}
            </div>
          )}
        </div>
      </div>

      {/* ② 객실 */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="ggk-logo" style={{ fontSize: 16, fontWeight: 800, color: "#222" }}>객실 {state.rooms.length}개</div>
          {canAct && state.rooms.length < ROOMS_PER_PLACE_MAX && <button onClick={() => open("new")} style={{ ...primaryButton(false), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}><Plus size={14} />객실 추가</button>}
        </div>
        <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.7 }}>
          객실마다 사진·요금·인원·마릿수를 올려 주세요.<br />
          예약 달력과 예약 처리는 "숙박 예약" 메뉴에 있어요.
        </div>

        {editing && (
          <div ref={formRef} style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#F7F3E8", display: "grid", gap: 14, scrollMarginTop: 12 }}>
            <div className="ggk-logo" style={{ fontSize: 14.5, fontWeight: 800, color: "#333" }}>{editing === "new" ? "새 객실 올리기" : "객실 수정"}</div>

            <div>
              <div style={label}>객실 사진 <span style={optional}>(선택) {room.images.length}/{ROOM_IMAGES_MAX}장 · 첫 장이 대표 사진</span></div>
              <input ref={fileRef} type="file" multiple accept={IMAGE_TYPES.join(",")} onChange={(e) => upload(e.target.files)} style={{ display: "none" }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {room.images.map((url, i) => (
                  <div key={url} style={{ position: "relative", width: 96 }}>
                    <div style={{ width: 96, height: 96, borderRadius: 12, background: `url("${url}") center/cover no-repeat`, border: i === 0 ? "2px solid #1D4F91" : "1px solid #e2dcc8" }} />
                    {i === 0 && <span style={{ ...tag("#1D4F91", "white"), position: "absolute", left: 5, top: 5 }}>대표</span>}
                    <button onClick={() => setR({ images: room.images.filter((u) => u !== url) })} aria-label={`${i + 1}번째 사진 빼기`} style={{ position: "absolute", right: 4, top: 4, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.55)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><X size={12} /></button>
                    <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
                      <button onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="앞으로" style={{ ...iconButton, width: 26, height: 22, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={11} style={{ transform: "rotate(-90deg)" }} /></button>
                      <button onClick={() => moveImage(i, 1)} disabled={i === room.images.length - 1} aria-label="뒤로" style={{ ...iconButton, width: 26, height: 22, opacity: i === room.images.length - 1 ? 0.35 : 1 }}><ArrowDown size={11} style={{ transform: "rotate(-90deg)" }} /></button>
                    </div>
                  </div>
                ))}
                {room.images.length < ROOM_IMAGES_MAX && (
                  <button onClick={() => fileRef.current?.click()} disabled={busy !== ""} aria-label="객실 사진 올리기" style={{ width: 96, height: 96, borderRadius: 12, border: "1.5px dashed #9db4d6", background: "#F2F6FC", color: "#1D4F91", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", padding: 0 }}>
                    <ImagePlus size={20} />{busy === "upload" ? "올리는 중…" : "사진 올리기"}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <div>
                <div style={label}>객실 이름 <span style={optional}>{room.name.length}/{ROOM_NAME_MAX}</span></div>
                <input value={room.name} onChange={(e) => setR({ name: e.target.value })} placeholder="예: 바다 앞 독채 A동" maxLength={ROOM_NAME_MAX} style={input} />
              </div>
              <div>
                <div style={label}>객실 유형 <span style={optional}>(선택)</span></div>
                <input value={room.room_type} onChange={(e) => setR({ room_type: e.target.value })} placeholder="직접 적거나 아래에서 골라 주세요" maxLength={ROOM_TYPE_MAX} style={input} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: -6 }}>
              {ROOM_TYPE_SUGGESTIONS.map((t) => (
                <button key={t} onClick={() => setR({ room_type: room.room_type.trim() === t ? "" : t })} style={chip(room.room_type.trim() === t)}>{t}</button>
              ))}
            </div>

            <div style={section}>요금</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <div>
                <div style={label}>1박 요금(일~목)</div>
                <MoneyInput value={room.base_price} onChange={(v) => setR({ base_price: v })} />
              </div>
              <div>
                <div style={label}>1박 요금(금·토) <span style={optional}>(선택)</span></div>
                <MoneyInput value={room.weekend_price} onChange={(v) => setR({ weekend_price: v })} placeholder="평일과 같음" />
              </div>
            </div>

            <div style={section}>인원 · 반려동물</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <div>
                <div style={label}>기준 인원</div>
                <input value={room.std_guests} onChange={(e) => setR({ std_guests: digits(e.target.value, 2) })} inputMode="numeric" style={{ ...input, textAlign: "right" }} />
              </div>
              <div>
                <div style={label}>최대 인원</div>
                <input value={room.max_guests} onChange={(e) => setR({ max_guests: digits(e.target.value, 2) })} inputMode="numeric" style={{ ...input, textAlign: "right" }} />
              </div>
              <div>
                <div style={label}>최대 마릿수 <span style={optional}>(선택)</span></div>
                <input value={room.max_pets} onChange={(e) => setR({ max_pets: digits(e.target.value, 2) })} placeholder="숙소 규정" inputMode="numeric" style={{ ...input, textAlign: "right" }} />
              </div>
            </div>
            {Number(room.max_guests) > Number(room.std_guests) && (
              <div>
                <div style={label}>기준 초과 1명당 1박 추가 요금 <span style={optional}>(선택)</span></div>
                <MoneyInput value={room.extra_guest_fee} onChange={(v) => setR({ extra_guest_fee: v })} />
              </div>
            )}

            <div>
              <div style={label}>객실 편의시설 <span style={optional}>(선택)</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ROOM_AMENITIES.map((a) => (
                  <button key={a} onClick={() => setR({ amenities: toggle(room.amenities, a) })} aria-pressed={room.amenities.includes(a)} style={chip(room.amenities.includes(a))}>{a}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={label}>객실 설명 <span style={optional}>(선택) {room.description.length}/{ROOM_DESC_MAX}</span></div>
              <textarea value={room.description} onChange={(e) => setR({ description: e.target.value })} maxLength={ROOM_DESC_MAX} rows={3} placeholder={"예: 바다가 보이는 2층 독채예요.\n울타리 친 개별 마당이 있어 마음껏 뛰어놀 수 있어요."} style={{ ...input, resize: "vertical", lineHeight: 1.55 }} />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#444", cursor: "pointer" }}>
              <input type="checkbox" checked={room.is_active} onChange={(e) => setR({ is_active: e.target.checked })} style={{ width: 17, height: 17 }} />판매 중 <span style={optional}>끄면 손님에게 보이지 않아요</span>
            </label>

            {error && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: "#b91c1c" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setEditing(null); setError(null); }} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #ddd", background: "white", fontSize: 13, fontWeight: 700, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
              <button onClick={saveRoom} disabled={!canSaveRoom} style={{ ...primaryButton(!canSaveRoom), flex: 2, padding: "11px 0" }}>{busy === "room" ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {state.rooms.length === 0 && !editing && <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "24px 0" }}>아직 올린 객실이 없어요. &ldquo;객실 추가&rdquo;로 첫 객실을 올려 보세요.</div>}
          {state.rooms.map((r, index) => (
            <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 12px", borderRadius: 12, border: "1px solid #f0ece0", background: r.is_active ? "white" : "#fafafa", opacity: r.is_active ? 1 : 0.7 }}>
              {r.images[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.images[0]} alt="" style={{ width: 72, height: 72, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 72, height: 72, borderRadius: 11, background: "#E3EDFA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><BedDouble size={22} color="#1D4F91" /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#222", wordBreak: "break-word" }}>{r.name}</span>
                  {r.room_type && <span style={tag("#E3EDFA", "#1D4F91")}>{r.room_type}</span>}
                  {!r.is_active && <span style={tag("#f1f2f4", "#777")}>판매 중지</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#B45309", marginTop: 3 }}>{roomPriceText(r)}</div>
                <div style={{ fontSize: 11.5, color: "#888", marginTop: 2 }}>
                  기준 {r.std_guests}명 · 최대 {r.max_guests}명{r.max_pets != null ? ` · 반려동물 최대 ${r.max_pets}마리` : ""}{r.images.length > 1 ? ` · 사진 ${r.images.length}장` : ""}
                </div>
                {r.amenities.length > 0 && <div style={{ fontSize: 11.5, color: "#999", marginTop: 2 }}>{r.amenities.join(" · ")}</div>}
                {canAct && (
                  <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => quick({ id: r.id, is_active: !r.is_active })} disabled={busy !== ""} style={{ padding: "6px 10px", borderRadius: 9, border: "1px solid #e2e4e8", background: "white", fontSize: 11.5, fontWeight: 700, color: "#555", cursor: "pointer", fontFamily: "inherit" }}>{r.is_active ? "판매 중지" : "다시 판매"}</button>
                  </div>
                )}
              </div>
              {canAct && (
                <div style={{ display: "grid", gridTemplateColumns: "32px 32px", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => quick({ id: r.id, move: "up" })} disabled={busy !== "" || index === 0} aria-label={`${r.name} 위로`} style={{ ...iconButton, opacity: index === 0 ? 0.35 : 1 }}><ArrowUp size={13} color="#666" /></button>
                  <button onClick={() => quick({ id: r.id, move: "down" })} disabled={busy !== "" || index === state.rooms.length - 1} aria-label={`${r.name} 아래로`} style={{ ...iconButton, opacity: index === state.rooms.length - 1 ? 0.35 : 1 }}><ArrowDown size={13} color="#666" /></button>
                  <button onClick={() => open(r)} aria-label={`${r.name} 수정`} style={iconButton}><Pencil size={13} color="#666" /></button>
                  <button onClick={() => remove(r)} aria-label={`${r.name} 삭제`} style={{ ...iconButton, borderColor: "#f3c7c5" }}><Trash2 size={13} color="#b42318" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
