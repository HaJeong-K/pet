"use client";

// 입점 안내의 "입점 신청하기" — 로그인·사장님 인증 상태에 따라 가는 곳이 다릅니다.
//   비로그인 → 로그인, 사장님 아님 → 사장님 가입, 인증된 사장님 → 사장님 센터(입점 신청 화면)
// ?place=번호 로 들어왔으면 그 숙소를 입점 신청에서 미리 골라 두도록 잠깐 기억합니다.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export const PARTNER_PLACE_KEY = "ggk-partner-place";

export default function PartnerStartButton() {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const place = Number(params.get("place"));
    if (Number.isInteger(place) && place > 0) {
      try { sessionStorage.setItem(PARTNER_PLACE_KEY, String(place)); } catch {}
    }
  }, [params]);

  const start = async () => {
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push(`/login?redirect=${encodeURIComponent("/partner/lodging")}`); return; }
    const { data } = await supabase.from("users").select("owner_status").eq("auth_user_id", session.user.id).maybeSingle<{ owner_status: string | null }>();
    router.push(data?.owner_status ? "/owner" : `/signup-owner?redirect=${encodeURIComponent("/owner")}`);
  };

  return (
    <button onClick={start} disabled={busy} style={{ marginTop: 16, width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "white", color: "#1D4F91", fontSize: 15.5, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
      {busy ? "확인하는 중…" : "입점 신청하기"}
    </button>
  );
}
