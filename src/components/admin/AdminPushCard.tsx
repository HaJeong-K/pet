"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BellRing } from "lucide-react";

// ── 관리자 대시보드: 폰 알림 카드 ──
// 카카오톡 '나와의 채팅' 알림은 알림음이 울리지 않아서, 같은 관리자 알림(새 제보·신고·글 검토, 새벽 작업 결과)을
// 이 기기의 브라우저 알림으로도 받습니다. 기기마다 한 번씩 켜야 하고(폰·PC 각각), 아이폰은 홈 화면에 추가한 뒤에 쓸 수 있습니다.
// 구독 방식은 유기동물 공고 알림(ShelterAlertToggle)과 같습니다 — 같은 서비스 워커(/sw.js)와 발송 키를 씁니다.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Device = { id: string; label: string; addedAt: number };

async function call(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/push", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "처리하지 못했어요.");
  return json;
}

/** 이 기기를 알아보기 쉬운 이름(목록 표시용) */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "안드로이드" : /iPhone|iPad/i.test(ua) ? "아이폰" : /Windows/i.test(ua) ? "윈도우 PC" : /Mac/i.test(ua) ? "맥" : "기기";
  const browser = /Edg\//.test(ua) ? "엣지" : /SamsungBrowser/i.test(ua) ? "삼성 인터넷" : /Chrome\//.test(ua) ? "크롬" : /Safari\//.test(ua) ? "사파리" : "브라우저";
  return `${os} · ${browser}`;
}

export default function AdminPushCard() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try { setDevices((await call("GET")).devices ?? []); } catch { /* 목록을 못 받아도 켜기·끄기는 가능 */ }
  };

  useEffect(() => {
    const ok = typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC_KEY;
    setSupported(ok);
    refresh();
    if (!ok) return;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
    })().catch(() => {});
  }, []);

  // 이 기기가 관리자 알림 목록에 올라 있는지(브라우저 구독은 유기동물 공고 알림과 함께 쓰므로 목록으로 판단)
  const on = endpoint != null && devices.some((d) => d.id === endpoint.slice(-12));

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("브라우저에서 알림이 차단돼 있어요. 주소창 왼쪽 자물쇠(사이트 설정)에서 알림을 허용해 주세요.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const json = await call("POST", { subscription: sub.toJSON(), label: deviceLabel() });
      setEndpoint(sub.endpoint);
      setMessage(json.welcomed ? "켜졌어요. 방금 시험 알림을 보냈어요." : "켜졌어요. 다만 시험 알림은 보내지 못했어요 — \"시험 알림\"을 눌러 다시 확인해 주세요.");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "알림 설정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      // 서버 목록에서만 뺍니다 — 브라우저 구독 자체는 유기동물 공고 알림이 함께 쓰고 있을 수 있어 그대로 둡니다.
      await call("DELETE", { endpoint });
      setMessage("이 기기의 관리자 알림을 껐어요.");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "해제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      const json = await call("POST", { test: true, endpoint });
      setMessage(json.ok ? "시험 알림을 보냈어요. 몇 초 안에 도착해요." : "보내지 못했어요. 껐다가 다시 켜 주세요.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  if (supported === null) return null;
  const others = devices.filter((d) => !endpoint || d.id !== endpoint.slice(-12));

  return (
    <div className="ggk-body" style={{ background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: "16px 18px", marginBottom: 24, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: on ? "#E4EBDC" : "#f1f2f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <BellRing size={19} color={on ? "#48603A" : "#888"} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
          폰 알림 · {on ? "이 기기에서 받는 중" : "이 기기는 꺼져 있음"}
        </div>
        <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6, marginTop: 3 }}>
          {supported
            ? "새 제보·신고·글 검토와 새벽 작업 결과를 알림음과 함께 받아요. 폰과 PC에서 각각 한 번씩 켜야 해요."
            : "이 브라우저에서는 알림을 쓸 수 없어요. (아이폰은 홈 화면에 추가한 뒤에 쓸 수 있어요.)"}
          {others.length > 0 && ` 다른 기기 ${others.length}대도 받는 중이에요(${others.map((d) => d.label).join(", ")}).`}
        </div>
        {message && <div role="status" style={{ fontSize: 12, color: "#48603A", fontWeight: 600, marginTop: 6 }}>{message}</div>}
        {supported && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={on ? disable : enable} disabled={busy} style={{ padding: "8px 14px", borderRadius: 10, border: on ? "1px solid #ddd" : "none", background: on ? "white" : "#5C7A4A", color: on ? "#555" : "white", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "처리 중…" : on ? "이 기기 알림 끄기" : "이 기기에서 알림 받기"}
            </button>
            {on && (
              <button onClick={test} disabled={busy} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#E4EBDC", color: "#48603A", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                시험 알림
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
