"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageCircle } from "lucide-react";

// ── 관리자 대시보드: 카카오톡 알림 연결 카드 ──
// "연결하기"를 누르면 카카오 동의 화면(카카오톡 메시지 전송)으로 갔다가 돌아오고, 이후 운영 알림이
// 관리자 카톡 '나와의 채팅'으로 옵니다(src/lib/server/kakaoTalk.ts).

const RESULT_TEXT: Record<string, string> = {
  connected: "카카오톡 알림이 연결됐어요. '나와의 채팅'에 확인 메시지를 보냈어요.",
  denied: "카카오톡 메시지 전송 동의를 하지 않아 연결되지 않았어요.",
  invalid: "연결 요청이 만료됐어요. 다시 눌러 주세요.",
  secret: "카카오 앱의 Client Secret이 켜져 있어요. 서버 설정에 KAKAO_CLIENT_SECRET을 넣어야 해요.",
  error: "연결 중 오류가 났어요. 잠시 후 다시 시도해 주세요.",
};

async function call(method: "GET" | "POST", body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/admin/kakao-talk", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

export default function KakaoTalkAlertCard() {
  const [status, setStatus] = useState<{ connected: boolean; refreshExpiresAt?: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setStatus((await call("GET")).json); } catch { setStatus({ connected: false }); }
  };

  useEffect(() => {
    refresh();
    // 카카오 동의 화면에서 돌아온 결과(?kakaoTalk=...)를 한 번 보여주고 주소에서 지웁니다.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("kakaoTalk");
    if (result) {
      setMessage(RESULT_TEXT[result] || RESULT_TEXT.error);
      params.delete("kakaoTalk");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const run = async (action: "connect" | "test" | "disconnect") => {
    setBusy(true);
    setMessage(null);
    try {
      const { ok, json } = await call("POST", { action });
      if (action === "connect") {
        if (json.url) { window.location.href = json.url; return; }
        setMessage(json.error || RESULT_TEXT.error);
      } else if (action === "test") {
        setMessage(ok ? "시험 메시지를 보냈어요. 카카오톡 '나와의 채팅'을 확인해 주세요." : "보내지 못했어요. 연결을 다시 해 주세요.");
      } else {
        setMessage("연결을 해제했어요.");
        await refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : RESULT_TEXT.error);
    } finally {
      setBusy(false);
    }
  };

  const expiresSoon = status?.refreshExpiresAt && status.refreshExpiresAt - Date.now() < 7 * 24 * 60 * 60_000;
  const btn = (bg: string, color: string): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 10, border: "none", background: bg, color, fontWeight: 700, fontSize: 12.5,
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "'Noto Sans KR', sans-serif",
  });

  return (
    <div style={{
      background: "white", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", margin: "16px 0",
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "#FEE500", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MessageCircle size={20} color="#191919" />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#222" }}>
          카카오톡 알림 {status == null ? "" : status.connected ? "· 연결됨" : "· 연결 안 됨"}
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 3, lineHeight: 1.5 }}>
          새 사장님 신청·제보·신고, 자동 작업 실패, 아침 요약을 내 카카오톡 &apos;나와의 채팅&apos;으로 받아요.
          {status?.connected && status.refreshExpiresAt && (
            <span style={{ color: expiresSoon ? "#d9534f" : "#999" }}>
              {" "}(연결 유지: {new Date(status.refreshExpiresAt).toLocaleDateString("ko-KR")}까지{expiresSoon ? " — 곧 만료돼요, 다시 연결해 주세요" : ", 자동 연장"})
            </span>
          )}
        </div>
        {message && <div style={{ fontSize: 12, color: "#48603A", marginTop: 6, fontWeight: 600 }}>{message}</div>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {status?.connected ? (
          <>
            <button disabled={busy} onClick={() => run("test")} style={btn("#FEE500", "#191919")}>시험 메시지</button>
            {expiresSoon && <button disabled={busy} onClick={() => run("connect")} style={btn("#5C7A4A", "white")}>다시 연결</button>}
            <button disabled={busy} onClick={() => run("disconnect")} style={btn("#f1f2f4", "#555")}>해제</button>
          </>
        ) : (
          <button disabled={busy} onClick={() => run("connect")} style={btn("#FEE500", "#191919")}>카카오톡으로 연결하기</button>
        )}
      </div>
    </div>
  );
}
