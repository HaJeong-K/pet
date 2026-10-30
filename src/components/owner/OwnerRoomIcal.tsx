"use client";

// 객실 "달력 연동" — 같은 객실을 다른 예약 사이트(에어비앤비·부킹닷컴 등)에서도 팔 때 중복 예약을 막습니다.
//   ① 가져오기: 그 사이트의 객실 달력(iCal) 주소를 넣으면, 그쪽에서 팔린 날을 같이가개에서 자동으로 막아요(매일 새벽 + 손님이 예약할 때).
//   ② 내보내기: 같이가개 달력 주소를 복사해 그 사이트의 "달력 가져오기"에 넣으면, 같이가개 예약이 그쪽에서도 막혀요.
// 서버는 /api/owner/lodging/ical, 규칙은 src/lib/ical.ts.

import { useCallback, useEffect, useState } from "react";
import { CalendarSync, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Info = { importUrl: string | null; exportUrl: string; syncedAt: string | null; error: string | null; blockedNights: number };
const input: React.CSSProperties = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "white" };
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({ padding: "9px 13px", borderRadius: 10, border: primary ? "none" : "1px solid #e2e4e8", background: disabled ? "#d6d3c9" : primary ? "#1D4F91" : "white", color: primary ? "white" : "#555", fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });

export default function OwnerRoomIcal({ roomId, placeId, isPreview, canAct }: { roomId: number; placeId: number; isPreview: boolean; canAct: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const call = useCallback(async (init: RequestInit = {}, query = "") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    const q = [isPreview ? `placeId=${placeId}` : "", query].filter(Boolean).join("&");
    const res = await fetch(`/api/owner/lodging/ical${q ? `?${q}` : ""}`, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);

  useEffect(() => {
    let cancelled = false;
    call({}, `roomId=${roomId}`).then((j: Info) => { if (!cancelled) { setInfo(j); setUrl(j.importUrl ?? ""); } })
      .catch((e) => { if (!cancelled) setMessage({ ok: false, text: e instanceof Error ? e.message : "불러오지 못했어요." }); });
    return () => { cancelled = true; };
  }, [call, roomId]);

  const run = async (init: RequestInit) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const j = await call(init);
      setInfo(j);
      setUrl(j.importUrl ?? "");
      const r = j.result as { blocked?: number; error?: string } | undefined;
      setMessage(r?.error ? { ok: false, text: r.error } : { ok: true, text: j.importUrl ? `동기화했어요. 다른 사이트에서 팔린 밤 ${r?.blocked ?? j.blockedNights}일을 막았어요.` : "연동을 해제했어요." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "처리하지 못했어요." }); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!info) return;
    try { await navigator.clipboard.writeText(info.exportUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* 복사 실패 */ }
  };

  return (
    <div style={{ marginTop: 10, padding: "12px 13px", borderRadius: 12, background: "#F7F9FC", border: "1px solid #e3eaf3", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#1D4F91" }}><CalendarSync size={15} />달력 연동(중복 예약 방지)</div>
      <div style={{ fontSize: 12, color: "#666", lineHeight: 1.65 }}>
        이 객실을 다른 예약 사이트에서도 판다면 꼭 연결해 주세요.<br />
        한쪽에서 팔린 날이 다른 쪽에서 자동으로 막혀요.
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#444", marginBottom: 5 }}>① 다른 사이트 달력 가져오기</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={!canAct || busy} placeholder="https://…/calendar.ics (에어비앤비·부킹닷컴의 달력 내보내기 주소)" aria-label="다른 사이트 달력 주소" style={input} />
          {canAct && <button onClick={() => run({ method: "PUT", body: JSON.stringify({ roomId, importUrl: url.trim() }) })} disabled={busy} style={btn(true, busy)}>{busy ? "확인 중…" : "저장"}</button>}
        </div>
        {info && (
          <div style={{ fontSize: 11.5, color: info.error ? "#b91c1c" : "#5c5c5c", marginTop: 5, lineHeight: 1.6 }}>
            {info.importUrl
              ? info.error ? `동기화하지 못했어요: ${info.error}` : `${info.syncedAt ? `${new Date(info.syncedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 동기화` : "아직 동기화 전"} · 막힌 밤 ${info.blockedNights}일 · 매일 새벽과 손님이 예약할 때 다시 확인해요.`
              : "아직 연결하지 않았어요."}
            {info.importUrl && canAct && <> <button onClick={() => run({ method: "POST", body: JSON.stringify({ roomId }) })} disabled={busy} style={{ border: "none", background: "transparent", color: "#1D4F91", fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>지금 동기화</button></>}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#444", marginBottom: 5 }}>② 같이가개 달력 내보내기</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={info?.exportUrl ?? "불러오는 중…"} readOnly aria-label="같이가개 달력 주소" style={{ ...input, color: "#555", background: "#fff" }} onFocus={(e) => e.currentTarget.select()} />
          <button onClick={copy} disabled={!info} style={btn(false)}><Copy size={12} style={{ verticalAlign: -2 }} /> {copied ? "복사됨" : "복사"}</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#5c5c5c", marginTop: 5 }}>이 주소를 다른 사이트의 &ldquo;달력 가져오기(iCal)&rdquo;에 넣어 주세요. 손님 이름·연락처는 담기지 않고 날짜만 담겨요.</div>
      </div>
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message.ok ? "#15803D" : "#b91c1c" }}>{message.text}</div>}
    </div>
  );
}
