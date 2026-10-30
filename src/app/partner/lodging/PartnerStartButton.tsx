"use client";

// 입점 안내의 "입점 신청하기" — 로그인·사장님 인증 상태에 따라 가는 곳이 다릅니다.
//   사장님 아님(로그인 전·후 모두) → 사장님 가입·전환 페이지(숙소 미리 선택), 사장님 → 사장님 센터(입점 신청 화면)
// ?place=번호 로 들어왔으면 그 숙소를 입점 신청에서 미리 골라 두도록 잠깐 기억합니다.
// variant: hero(첫 화면 금색 큰 버튼) · nav(머리 줄 작은 버튼) · dark(마지막 띠의 버튼)

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const PARTNER_PLACE_KEY = "ggk-partner-place";

const STYLES: Record<"hero" | "nav" | "dark", React.CSSProperties> = {
  hero: { padding: "15px 24px", borderRadius: 999, background: "#F3DA9B", color: "#2F3B28", fontSize: 15.5, boxShadow: "0 10px 26px rgba(0,0,0,0.25)" },
  nav: { padding: "9px 16px", borderRadius: 999, background: "#2F3B28", color: "white", fontSize: 13 },
  dark: { padding: "15px 26px", borderRadius: 999, background: "#F3DA9B", color: "#2F3B28", fontSize: 16 },
};

export default function PartnerStartButton({ variant = "hero" }: { variant?: "hero" | "nav" | "dark" }) {
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
    // 사장님 가입·전환 페이지에 "숙소"를 미리 골라 둔 채로 보냅니다(로그인 전이면 가입, 로그인했으면 전환)
    const join = `/signup-owner?kind=lodging&redirect=${encodeURIComponent("/owner")}`;
    if (!session) { router.push(join); return; }
    const { data } = await supabase.from("users").select("owner_status").eq("auth_user_id", session.user.id).maybeSingle<{ owner_status: string | null }>();
    router.push(data?.owner_status ? "/owner" : join);
  };

  return (
    <button onClick={start} disabled={busy} style={{ ...STYLES[variant], display: "inline-flex", alignItems: "center", gap: 8, border: "none", fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {busy ? "확인하는 중…" : "입점 신청하기"}{!busy && variant !== "nav" && <ArrowRight size={variant === "dark" ? 18 : 17} />}
    </button>
  );
}
