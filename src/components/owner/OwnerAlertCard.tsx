"use client";

// 사장님 센터 "예약" 화면 맨 위의 "새 예약 알림" 카드.
//   · 이 기기로 알림 받기: 켜면 새 예약이 들어올 때 휴대폰 상단바에 알림이 쌓입니다(사이트를 닫아 두어도).
//   · 알림음(멍멍): 사이트를 열어 둔 화면에서 나는 소리를 켜고 끕니다. 안드로이드 앱에서는 앱의 "새 예약 알림" 알림음으로도 울립니다.
// 구독 방식은 관리자 폰 알림(AdminPushCard)·유기동물 공고 알림과 같습니다 — 같은 서비스 워커(/sw.js)와 발송 키를 씁니다.

import { useCallback, useEffect, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isOwnerSoundOn, playBark, setOwnerSoundOn } from "@/lib/ownerAlertSound";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
/** 이 기기를 알아보기 쉬운 이름(목록 표시용) */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "안드로이드" : /iPhone|iPad/i.test(ua) ? "아이폰" : /Windows/i.test(ua) ? "윈도우 PC" : /Mac/i.test(ua) ? "맥" : "기기";
  const browser = /Edg\//.test(ua) ? "엣지" : /SamsungBrowser/i.test(ua) ? "삼성 인터넷" : /Chrome\//.test(ua) ? "크롬" : /Safari\//.test(ua) ? "사파리" : "브라우저";
  return `${os} · ${browser}`;
}

type Device = { id: string; label: string | null; addedAt: string };
type Status = { ready: boolean; configured: boolean; devices: Device[] };

const card: React.CSSProperties = { background: "white", borderRadius: 18, border: "1px solid #ece6d6", padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" };
const button = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding: "9px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  border: primary ? "none" : "1px solid #ddd", background: disabled ? "#d6d3c9" : primary ? "#B45309" : "white", color: primary ? "white" : "#555",
});

export default function OwnerAlertCard({ placeId, isPreview }: { placeId: number; isPreview: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const call = useCallback(async (method: "GET" | "POST" | "DELETE", body?: unknown) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요해요.");
    // 관리자가 다른 가게를 볼 때만 주소에 가게 번호를 붙입니다(사장님 본인은 서버가 본인 가게로 고정).
    const res = await fetch(`/api/owner/push${isPreview ? `?placeId=${placeId}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
    return json;
  }, [placeId, isPreview]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC_KEY;
      const on = isOwnerSoundOn();
      const [next, sub] = await Promise.all([
        call("GET").catch(() => null),
        ok ? navigator.serviceWorker.getRegistration("/").then((reg) => reg?.pushManager.getSubscription()).catch(() => null) : null,
      ]);
      if (cancelled) return;
      setSupported(ok);
      setSoundOn(on);
      setStatus(next);
      setEndpoint(sub?.endpoint ?? null);
    })();
    return () => { cancelled = true; };
  }, [call]);

  // 관리자가 다른 가게를 보는 중에는 관리자 기기를 그 가게의 알림 기기로 등록하지 않습니다.
  if (isPreview || !status) return null;

  const on = endpoint != null && status.devices.some((d) => d.id === endpoint.slice(-12));
  const refresh = async () => { try { setStatus(await call("GET")); } catch { /* 목록을 못 받아도 켜기·끄기는 가능 */ } };

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("알림이 차단돼 있어요. 휴대폰 설정(또는 주소창 왼쪽 자물쇠)에서 같이가개 알림을 허용해 주세요."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const json = await call("POST", { subscription: sub.toJSON(), label: deviceLabel() });
      setEndpoint(sub.endpoint);
      setMessage(json.welcomed ? "켜졌어요. 방금 시험 알림을 보냈어요." : "켜졌어요. 시험 알림은 보내지 못했어요 — \"시험 알림\"을 눌러 다시 확인해 주세요.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "알림을 켜지 못했어요."); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      // 서버 목록에서만 뺍니다 — 브라우저 구독 자체는 유기동물 공고 알림이 함께 쓰고 있을 수 있어 그대로 둡니다.
      await call("DELETE", { endpoint });
      setMessage("이 기기의 새 예약 알림을 껐어요.");
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "끄지 못했어요."); }
    finally { setBusy(false); }
  };
  const test = async () => {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      const json = await call("POST", { test: true, endpoint });
      setMessage(json.ok ? "시험 알림을 보냈어요. 몇 초 안에 도착해요." : "보내지 못했어요. 껐다가 다시 켜 주세요.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "보내지 못했어요."); }
    finally { setBusy(false); }
  };
  const toggleSound = () => { const next = !soundOn; setSoundOn(next); setOwnerSoundOn(next); if (next) playBark(true); };
  const listen = async () => { if (!(await playBark(true))) setMessage("소리를 재생하지 못했어요. 기기의 소리(미디어 음량)를 확인해 주세요."); };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BellRing size={16} color="#B45309" />
        <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>새 예약 알림</div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: on ? "#DCFCE7" : "#f1f2f4", color: on ? "#15803D" : "#555" }}>{on ? "이 기기 켜짐" : "이 기기 꺼짐"}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "#5c5c5c", marginTop: 4, lineHeight: 1.65 }}>
        켜 두면 손님이 예약을 넣을 때 이 기기 상단바에 알림이 쌓여요. 사이트를 닫아 두어도 와요.
      </div>

      {!status.ready ? (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "9px 11px" }}>알림 기능을 준비하고 있어요.</div>
      ) : supported === false || !status.configured ? (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#555", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: "9px 11px", lineHeight: 1.6 }}>
          이 브라우저에서는 알림을 켤 수 없어요. 같이가개 앱이나 크롬에서 열어 주세요(아이폰은 홈 화면에 추가한 뒤에 쓸 수 있어요).
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {on
            ? <><button onClick={test} disabled={busy} style={button(true, busy)}>시험 알림</button><button onClick={disable} disabled={busy} style={button(false)}>이 기기 알림 끄기</button></>
            : <button onClick={enable} disabled={busy} style={button(true, busy)}>{busy ? "켜는 중…" : "이 기기로 알림 받기"}</button>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px dashed #eee", flexWrap: "wrap" }}>
        <button onClick={toggleSound} aria-pressed={soundOn} style={{ ...button(false), display: "inline-flex", alignItems: "center", gap: 6, borderColor: soundOn ? "#F0C36A" : "#ddd", background: soundOn ? "#FFFBEB" : "white", color: soundOn ? "#92400E" : "#555" }}>
          {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}멍멍 알림음 {soundOn ? "켜짐" : "꺼짐"}
        </button>
        <button onClick={listen} style={button(false)}>소리 들어보기</button>
        <span style={{ flex: "1 1 200px", fontSize: 11.5, color: "#666", lineHeight: 1.55 }}>
          사장님 화면을 열어 둔 동안 새 예약이 오면 이 소리가 나요. 같이가개 앱에서는 알림 자체도 이 소리로 울려요.
        </span>
      </div>

      {status.devices.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: "#666" }}>
          알림을 받는 기기 {status.devices.length}대 · {status.devices.map((d) => d.label || "기기").join(", ")}
        </div>
      )}
      {message && <div role="status" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#444", lineHeight: 1.55 }}>{message}</div>}
    </div>
  );
}
