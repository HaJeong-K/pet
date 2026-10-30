"use client";
// src/components/stamps/PlaceStampButton.tsx
//
// 장소 상세의 "다녀왔어요 · 추억 스탬프 받기" — 누르는 순간 현재 위치를 확인해 장소 근처면 스탬프를 발급합니다.
// 위치는 거리 확인에만 쓰고 저장하지 않습니다(/api/me/stamps).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Stamp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { STAMP_RADIUS_M, STAMP_VALUE_WON } from "@/lib/memoryStamps";

export default function PlaceStampButton({ placeId }: { placeId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/me/stamps?placeId=${placeId}`, { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      const json = res && res.ok ? await res.json().catch(() => null) : null;
      if (!cancelled && json?.stampedHere) setDone(true);
    })();
    return () => { cancelled = true; };
  }, [placeId]);

  const claim = async () => {
    setMessage(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push(`/login?redirect=${encodeURIComponent(`/place/${placeId}`)}`); return; }
    if (!navigator.geolocation) { setMessage({ ok: false, text: "이 기기에서는 위치를 확인할 수 없어요." }); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch("/api/me/stamps", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ placeId, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setMessage({ ok: false, text: json.error || "스탬프를 받지 못했어요." }); return; }
        setDone(true);
        const course = (json.newlyCompleted ?? []) as string[];
        setMessage({ ok: true, text: course.length ? `추억 스탬프를 받았어요! 코스 완주 스탬프도 함께 받았어요: ${course.join(", ")}` : "추억 스탬프를 받았어요! 마이페이지에서 모아 볼 수 있어요." });
      } catch { setMessage({ ok: false, text: "스탬프를 받지 못했어요. 잠시 후 다시 시도해 주세요." }); }
      finally { setBusy(false); }
    }, () => {
      setBusy(false);
      setMessage({ ok: false, text: "위치 권한을 허용해야 다녀온 곳을 확인할 수 있어요." });
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  };

  return (
    <div style={{ marginTop: 7 }}>
      <button type="button" onClick={claim} disabled={busy || done} className="ggk-body" style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 10px", borderRadius: 11, cursor: busy || done ? "default" : "pointer",
        border: `1px solid ${done ? "#D5E0C9" : "#E8D9A8"}`, background: done ? "#EEF3E8" : "#FBF3DA", color: done ? "#48603A" : "#6B5525", fontSize: 13, fontWeight: 800,
      }}>
        {done ? <Check size={15} /> : <Stamp size={15} />}
        {done ? "추억 스탬프를 받은 곳이에요" : busy ? "위치를 확인하는 중…" : "다녀왔어요 · 추억 스탬프 받기"}
      </button>
      {!done && !message && <div style={{ fontSize: 11.5, color: "#666", textAlign: "center", marginTop: 4 }}>장소 {STAMP_RADIUS_M}m 안에서 받을 수 있어요 · 숙소 예약 때 1개당 {STAMP_VALUE_WON}원 할인</div>}
      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 600, color: message.ok ? "#48603A" : "#B4412B", textAlign: "center", marginTop: 5, lineHeight: 1.5 }}>{message.text}</div>}
    </div>
  );
}
