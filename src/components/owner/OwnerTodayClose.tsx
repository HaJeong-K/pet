"use client";

// 사장님 센터 — 재료가 떨어지거나 급하게 문을 닫을 때 오늘 들어오는 주문을 막습니다.
// 날짜로 저장하므로 다음 날이 되면 자동으로 다시 주문을 받습니다. 이미 들어온 주문은 그대로 남습니다.
// 서버는 /api/owner/store-settings.

import { useCallback, useEffect, useState } from "react";
import { DoorClosed, DoorOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function OwnerTodayClose({ placeId, isPreview, canAct }: { placeId: number; isPreview: boolean; canAct: boolean }) {
  const [closed, setClosed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const call = useCallback(async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("로그인이 필요합니다.");
    const res = await fetch(`/api/owner/store-settings${isPreview ? `?placeId=${placeId}` : ""}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "처리하지 못했습니다.");
    return json;
  }, [placeId, isPreview]);

  useEffect(() => {
    call().then((d) => setClosed(!!d.closedToday)).catch((e) => setError(e.message));
  }, [call]);

  const toggle = async () => {
    const next = !closed;
    if (next && !window.confirm("오늘 들어오는 주문을 마감할까요?\n이미 들어온 주문은 그대로 남습니다.")) return;
    setBusy(true);
    setError("");
    try {
      await call({ method: "PATCH", body: JSON.stringify({ closedToday: next }) });
      setClosed(next);
    } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); }
    finally { setBusy(false); }
  };

  if (closed === null && !error) return null;
  const Icon = closed ? DoorClosed : DoorOpen;
  return (
    <div style={{ marginBottom: 16, padding: 16, borderRadius: 16, background: closed ? "#FEF2F2" : "white", border: `1px solid ${closed ? "#FBD5D5" : "#E7E6E5"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Icon size={22} color={closed ? "#B91C1C" : "#A05A32"} style={{ flexShrink: 0 }} />
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div className="ggk-logo" style={{ fontSize: 15, fontWeight: 800, color: closed ? "#B91C1C" : "#222" }}>{closed ? "오늘 주문을 마감했습니다" : "오늘 주문을 받고 있습니다"}</div>
          <div style={{ marginTop: 3, fontSize: 13, color: "#5c5c5c", lineHeight: 1.6 }}>
            {closed ? "내일이 되면 자동으로 다시 주문을 받습니다." : "재고 소진이나 급한 휴무 때 오늘 주문만 닫을 수 있습니다."}
          </div>
        </div>
        {canAct && closed !== null && (
          <button type="button" onClick={toggle} disabled={busy} style={{ flexShrink: 0, padding: "11px 18px", borderRadius: 11, border: closed ? "1px solid #3B2A20" : "none", background: closed ? "white" : "#3B2A20", color: closed ? "#3B2A20" : "white", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            {closed ? "다시 주문 받기" : "오늘 주문 마감"}
          </button>
        )}
      </div>
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#B91C1C" }}>{error}</div>}
    </div>
  );
}
