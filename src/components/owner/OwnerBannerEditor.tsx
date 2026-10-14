"use client";

// 사장님 센터의 "배너 광고" 메뉴 — 배너 광고를 내는 가게('동네 대표' 요금제 · 관리자가 켜 준 배너 혜택)에만 보입니다.
//   · 큰 문구·작은 문구·사진·글꼴을 고르면 바로 아래 미리보기에 실제 광고와 같은 모양으로 보입니다(PC 양옆 칸 / 휴대폰 한 줄).
//   · "배너 저장"을 누르면 그 내용이 광고 칸에 자동으로 나갑니다(배너가 나가는 요금제·혜택일 때).
//   · 저장은 2주에 한 번 — 미리보기는 몇 번이든 됩니다. 잘못 저장했으면 관리자에게 한도 변경을 요청할 수 있습니다.
// 규칙은 src/lib/bannerCreative.ts, 그림은 components/BannerCreativeView.tsx(실제 광고와 같은 것).

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Megaphone, Trash2 } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import BannerCreativeView, { useBannerFonts } from "@/components/BannerCreativeView";
import { supabase } from "@/lib/supabase";
import {
  BANNER_BODY_MAX, BANNER_CHANGE_DAYS, BANNER_FONTS, BANNER_HEADLINE_MAX, BANNER_IMAGE_MAX_BYTES, BANNER_IMAGE_TYPES,
  bannerFontScale, type BannerFontId, type ChangeAllowance,
} from "@/lib/bannerCreative";

type ChangeRequest = { id: number; reason: string; status: "pending" | "approved" | "rejected"; admin_note: string | null; created_at: string };
type Loaded = {
  ready: boolean;
  place?: { name: string; image: string | null; region: string; address?: string | null };
  live?: boolean;
  banner?: { headline: string; body: string | null; imageUrl: string | null; font: BannerFontId; changedAt: string; hidden: boolean; hiddenReason: string | null } | null;
  allowance?: ChangeAllowance;
  extraChanges?: number;
  requests?: ChangeRequest[];
};

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "18px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: "#444", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 };
const fmtDate = (s: string) => new Date(s).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
const REQUEST_LABEL: Record<ChangeRequest["status"], { text: string; bg: string; color: string }> = {
  pending: { text: "확인 중", bg: "#FEF3C7", color: "#92400E" },
  approved: { text: "승인됨", bg: "#DCFCE7", color: "#15803D" },
  rejected: { text: "거절됨", bg: "#FEE2E2", color: "#B91C1C" },
};

export default function OwnerBannerEditor({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [form, setForm] = useState<{ headline: string; body: string; imageUrl: string | null; font: BannerFontId }>({ headline: "", body: "", imageUrl: null, font: "gothic" });
  const [busy, setBusy] = useState<"" | "save" | "upload" | "request">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 글꼴 목록의 견본 글자를 각 글꼴로 보여 주려면 전부 받아 둡니다.
  useBannerFonts(BANNER_FONTS.map((f) => f.id));

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    // 관리자가 다른 가게를 볼 때만 주소에 가게 번호를 붙입니다(사장님 본인은 서버가 본인 가게로 고정).
    const res = await fetch(`${path}${isPreview ? `?placeId=${placeId}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);

  const load = useCallback(async () => {
    try {
      const next = (await call("/api/owner/banner")) as Loaded;
      setData(next);
      if (next.banner) setForm({ headline: next.banner.headline, body: next.banner.body ?? "", imageUrl: next.banner.imageUrl, font: next.banner.font });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); setData({ ready: false }); }
  }, [call]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  if (!data) return <div style={{ ...card, textAlign: "center" }}><LogoLoader /></div>;
  if (!data.ready) {
    return (
      <div style={{ ...card, fontSize: 13, color: "#9a3412", background: "#fff7ed", borderColor: "#fed7aa", lineHeight: 1.7 }}>
        배너 광고 만들기를 준비하고 있어요.
        {isPreview && <> Supabase SQL 편집기에서 <b>scripts/sql/banner-ads.sql</b>을 한 번 실행하면 열려요.</>}
      </div>
    );
  }

  const allowance = data.allowance!;
  const saved = data.banner;
  const dirty = !saved || saved.headline !== form.headline.trim() || (saved.body ?? "") !== form.body.trim() || saved.imageUrl !== form.imageUrl || saved.font !== form.font;
  // 관리자가 대신 고칠 때는 한도를 따지지 않습니다.
  const canSave = canAct && (isPreview || allowance.allowed) && form.headline.trim() !== "" && dirty && busy === "";
  const preview = { name: data.place?.name ?? "우리 가게", address: data.place?.address ?? null, headline: form.headline.trim() || "여기에 큰 문구가 보여요", body: form.body.trim() || null, image: form.imageUrl || data.place?.image || null, font: form.font };
  const pendingRequest = (data.requests ?? []).find((r) => r.status === "pending");

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!BANNER_IMAGE_TYPES.includes(file.type)) { setMessage({ ok: false, text: "JPG·PNG·WEBP 사진만 올릴 수 있어요." }); return; }
    if (file.size > BANNER_IMAGE_MAX_BYTES) { setMessage({ ok: false, text: "사진은 5MB까지 올릴 수 있어요." }); return; }
    setBusy("upload");
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const json = await call("/api/owner/banner/image", { method: "POST", body });
      setForm((prev) => ({ ...prev, imageUrl: json.url }));
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "사진을 올리지 못했어요." }); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (!canSave) return;
    const warn = isPreview
      ? "사장님 대신 배너를 저장할까요? (사장님의 2주 한도에는 영향을 주지 않아요)"
      : `이 내용으로 배너를 저장할까요?\n저장하면 ${BANNER_CHANGE_DAYS}일 동안 다시 바꿀 수 없어요. 미리보기를 한 번 더 확인해 주세요.${allowance.usesExtra ? "\n(관리자가 풀어 준 추가 변경 1회를 사용해요)" : ""}`;
    if (!window.confirm(warn)) return;
    setBusy("save");
    setMessage(null);
    try {
      await call("/api/owner/banner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headline: form.headline, body: form.body, imageUrl: form.imageUrl, font: form.font }) });
      await load();
      setMessage({ ok: true, text: data.live ? "저장했어요. 지금부터 광고 칸에 이 배너가 나가요." : "저장했어요. 배너가 나가는 요금제(동네 대표)를 이용하면 이 배너가 광고 칸에 나가요." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했어요." }); }
    finally { setBusy(""); }
  };

  const sendRequest = async () => {
    if (busy || reason.trim().length < 5) return;
    setBusy("request");
    setMessage(null);
    try {
      await call("/api/owner/banner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      setReason("");
      setShowRequest(false);
      await load();
      setMessage({ ok: true, text: "요청을 보냈어요. 관리자가 확인하면 한 번 더 바꿀 수 있게 열어 드려요." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "요청하지 못했어요." }); }
    finally { setBusy(""); }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Megaphone size={16} color="#7c3aed" />
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>배너 광고 만들기</div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: data.live ? "#f3f0ff" : "#f1f2f4", color: data.live ? "#7c3aed" : "#777" }}>
          {data.live ? (saved && !saved.hidden ? "내 배너 노출 중" : "기본 모양으로 노출 중") : "아직 노출 전"}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "#888", marginTop: 4, lineHeight: 1.65 }}>
        커뮤니티·마이페이지의 광고 칸에 나가는 배너예요. 문구와 사진을 넣으면 아래에서 실제 모습을 바로 볼 수 있어요.
        {data.place?.region && <> 먼저 <b style={{ color: "#555" }}>{data.place.region}</b> 사용자에게 보여요.</>}
        {!data.live && <> 지금은 미리 만들어 두는 단계이고, <b style={{ color: "#555" }}>동네 대표</b> 요금제를 이용하면 노출돼요.</>}
      </div>
      {saved?.hidden && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12.5, color: "#991B1B", lineHeight: 1.6 }}>
          관리자가 이 배너를 내렸어요{saved.hiddenReason ? ` — ${saved.hiddenReason}` : ""}. 내용을 고쳐 다시 저장하면 다시 나가요.
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
        <div>
          <div style={label}>큰 문구 <span style={{ fontWeight: 600, color: "#aaa" }}>{form.headline.length}/{BANNER_HEADLINE_MAX}</span></div>
          <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={BANNER_HEADLINE_MAX} placeholder="예: 댕댕이랑 브런치, 테라스에서" disabled={!canAct} style={input} />
        </div>
        <div>
          <div style={label}>작은 문구 <span style={{ fontWeight: 600, color: "#aaa" }}>(선택) {form.body.length}/{BANNER_BODY_MAX}</span></div>
          <input value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={BANNER_BODY_MAX} placeholder="예: 대형견 환영 · 반려견 전용 메뉴 · 주차 가능" disabled={!canAct} style={input} />
        </div>
        <div>
          <div style={label}>사진 <span style={{ fontWeight: 600, color: "#aaa" }}>(선택) 가고 싶어지는 가게 사진 한 장 · 5MB까지</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept={BANNER_IMAGE_TYPES.join(",")} onChange={(e) => upload(e.target.files?.[0])} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} disabled={!canAct || busy !== ""} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, border: "1px dashed #c9b98a", background: "#FFFBEB", color: "#7a5a12", fontSize: 13, fontWeight: 700, cursor: canAct ? "pointer" : "default", fontFamily: "inherit" }}>
              <ImagePlus size={15} />{busy === "upload" ? "올리는 중…" : form.imageUrl ? "다른 사진으로 바꾸기" : "사진 올리기"}
            </button>
            {form.imageUrl && (
              <button onClick={() => setForm({ ...form, imageUrl: null })} disabled={!canAct} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "10px 12px", borderRadius: 10, border: "1px solid #eee", background: "white", color: "#888", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                <Trash2 size={13} />사진 빼기
              </button>
            )}
            <span style={{ fontSize: 11.5, color: "#999" }}>사진을 안 넣으면 가게에 등록된 사진을 써요.</span>
          </div>
        </div>
        <div>
          <div style={label}>글꼴</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 7 }}>
            {BANNER_FONTS.map((f) => {
              const active = form.font === f.id;
              return (
                <button key={f.id} onClick={() => setForm({ ...form, font: f.id })} disabled={!canAct} aria-pressed={active} style={{ padding: "9px 10px", borderRadius: 11, border: `1.5px solid ${active ? "#7c3aed" : "#e6e2d6"}`, background: active ? "#f7f3ff" : "white", cursor: canAct ? "pointer" : "default", textAlign: "left" }}>
                  <span style={{ display: "block", fontFamily: f.family, fontWeight: f.weight, fontSize: 16 * bannerFontScale(f.id), lineHeight: 1.25, color: "#222", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>같이가개 멍멍</span>
                  <span style={{ display: "block", fontSize: 10.5, color: active ? "#7c3aed" : "#999", fontWeight: 700, marginTop: 3, fontFamily: "'Noto Sans KR', sans-serif" }}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 미리보기 — 실제 광고 칸과 같은 그림 */}
      <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#F7F3E8" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#444", marginBottom: 10 }}>미리보기 <span style={{ fontWeight: 600, color: "#999" }}>— 저장하기 전에는 나만 보여요</span></div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 200px" }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 5 }}>PC 화면 양옆</div>
            <div style={{ width: 200, height: 300, display: "flex" }}><BannerCreativeView banner={preview} shape="rail" /></div>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 5 }}>휴대폰 화면 위쪽</div>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #eadfbf", maxWidth: 400 }}><BannerCreativeView banner={preview} shape="strip" style={{ borderBottom: "none" }} /></div>
          </div>
        </div>
      </div>

      {/* 저장 · 한도 */}
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={save} disabled={!canSave} style={{ padding: "11px 20px", borderRadius: 11, border: "none", background: canSave ? "#7c3aed" : "#d6d3c9", color: "white", fontSize: 13.5, fontWeight: 800, cursor: canSave ? "pointer" : "default", fontFamily: "inherit" }}>
          {busy === "save" ? "저장 중…" : "배너 저장"}
        </button>
        <span style={{ flex: "1 1 220px", fontSize: 12, color: "#888", lineHeight: 1.6 }}>
          {!canAct ? "보기 전용이에요. 대신 고치려면 위의 “사장님 요청으로 대신 처리하기”를 켜 주세요."
            : !saved ? `저장하면 ${BANNER_CHANGE_DAYS}일 동안 다시 바꿀 수 없으니 미리보기를 꼭 확인해 주세요.`
            : allowance.usesExtra ? `관리자가 한도를 풀어 줬어요 — 지금 한 번 더 바꿀 수 있어요(남은 횟수 ${data.extraChanges}회).`
            : allowance.allowed ? `지금 바꿀 수 있어요. 저장하면 ${BANNER_CHANGE_DAYS}일 동안 다시 바꿀 수 없어요.`
            : <>배너는 2주에 한 번 바꿀 수 있어요. <b style={{ color: "#B45309" }}>{allowance.nextChangeAt ? fmtDate(allowance.nextChangeAt) : ""}</b>부터 다시 바꿀 수 있어요({allowance.daysLeft}일 남음).</>}
        </span>
      </div>
      {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c", lineHeight: 1.55 }}>{message.text}</div>}

      {/* 한도 변경 요청 — 잘못 저장했을 때 */}
      {saved && !isPreview && canAct && !allowance.allowed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed #eee" }}>
          {pendingRequest ? (
            <div style={{ fontSize: 12.5, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px", lineHeight: 1.6 }}>
              한도 변경 요청을 확인하고 있어요({fmtDate(pendingRequest.created_at)} 요청). 승인되면 바로 다시 바꿀 수 있어요.
            </div>
          ) : !showRequest ? (
            <button onClick={() => setShowRequest(true)} style={{ border: "none", background: "transparent", padding: 0, fontSize: 12.5, fontWeight: 700, color: "#7c3aed", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "inherit" }}>
              잘못 저장했나요? 관리자에게 한도 변경 요청하기
            </button>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#444" }}>한도 변경 요청</div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="왜 다시 바꿔야 하는지 적어 주세요. 예: 문구에 오타가 있어요 / 사진을 잘못 올렸어요" style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowRequest(false)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", color: "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>취소</button>
                <button onClick={sendRequest} disabled={busy !== "" || reason.trim().length < 5} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: reason.trim().length < 5 ? "#d6d3c9" : "#7c3aed", color: "white", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{busy === "request" ? "보내는 중…" : "요청 보내기"}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {(data.requests ?? []).filter((r) => r.status !== "pending").slice(0, 2).map((r) => (
        <div key={r.id} style={{ marginTop: 8, fontSize: 11.5, color: "#888", lineHeight: 1.55 }}>
          <span style={{ fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: REQUEST_LABEL[r.status].bg, color: REQUEST_LABEL[r.status].color, marginRight: 6 }}>{REQUEST_LABEL[r.status].text}</span>
          {fmtDate(r.created_at)} 요청 · {r.reason}{r.admin_note ? ` → 관리자: ${r.admin_note}` : ""}
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
        · 사실과 다른 내용, 다른 가게 비방, 남의 사진·상표를 쓴 배너는 관리자가 내릴 수 있어요. 사진은 직접 찍었거나 쓸 권리가 있는 것만 올려 주세요.
      </div>
    </div>
  );
}
