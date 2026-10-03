"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── 유기동물 공고 지역 알림 스위치(브라우저 알림) ──
// 켜면 브라우저에 알림 권한을 묻고, 서비스 워커(/sw.js)로 구독을 만들어 서버에 저장합니다.
// 이후 그 지역에 새 공고가 올라오면 사이트를 닫아 둬도 알림이 옵니다(새벽 자동 작업이 발송).
// 보안 연결(https·localhost)에서만 동작하고, 아이폰은 홈 화면에 추가한 경우에만 지원됩니다.

const REGION_KEY = "ggk_push_region";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function ShelterAlertToggle({ region }: { region: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribedRegion, setSubscribedRegion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC_KEY;
    setSupported(ok);
    if (!ok) return;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setSubscribedRegion(localStorage.getItem(REGION_KEY));
    })().catch(() => {});
  }, []);

  const save = async (sub: PushSubscription, targetRegion: string) => {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ subscription: sub.toJSON(), region: targetRegion }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "알림 설정에 실패했어요.");
    localStorage.setItem(REGION_KEY, json.region || targetRegion);
    setSubscribedRegion(json.region || targetRegion);
  };

  const enable = async () => {
    if (!region) { setMessage("알림 받을 지역을 먼저 골라 주세요."); return; }
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
      await save(sub, region);
      setMessage(`${region}에 새 공고가 올라오면 알려드릴게요.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "알림 설정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      localStorage.removeItem(REGION_KEY);
      setSubscribedRegion(null);
      setMessage("알림을 껐어요.");
    } catch {
      setMessage("알림 해제에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (supported === null) return null;
  const on = subscribedRegion != null;
  const differentRegion = on && region && subscribedRegion !== region;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 14px", marginBottom: 14,
      background: "white", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: on ? "#E4EBDC" : "#f1f2f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {on ? <Bell size={17} color="#48603A" /> : <BellOff size={17} color="#888" />}
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#222" }}>
          {on ? `${subscribedRegion} 새 공고 알림 받는 중` : "내 지역 새 공고 알림"}
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 2, lineHeight: 1.5 }}>
          {!supported
            ? "이 브라우저에서는 알림을 쓸 수 없어요. (아이폰은 홈 화면에 추가한 뒤에 쓸 수 있어요.)"
            : message ?? (on ? "새 보호동물 공고가 올라오면 하루 한 번 알려드려요." : "새 가족을 기다리는 아이들 소식을 알림으로 받아 보세요.")}
        </div>
      </div>
      {supported && (
        <div style={{ display: "flex", gap: 6 }}>
          {differentRegion && (
            <button disabled={busy} onClick={enable} style={btn("#E4EBDC", "#48603A", busy)}>{region}(으)로 바꾸기</button>
          )}
          <button disabled={busy} onClick={on ? disable : enable} style={btn(on ? "#f1f2f4" : "#5C7A4A", on ? "#555" : "white", busy)}>
            {busy ? "처리 중…" : on ? "알림 끄기" : region ? `${region} 알림 받기` : "알림 받기"}
          </button>
        </div>
      )}
    </div>
  );
}

const btn = (bg: string, color: string, busy: boolean): React.CSSProperties => ({
  minHeight: 38, padding: "0 14px", borderRadius: 10, border: "none", background: bg, color, fontWeight: 700, fontSize: 12.5,
  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "'Noto Sans KR', sans-serif", whiteSpace: "nowrap",
});
