"use client";

// 숙소 찜 버튼 — 숙소 화면(/stay/번호) 사진 위에 놓습니다(2026-11-13).
// 장소 찜과 같은 표(reactions, type = bookmark)를 써서 마이페이지 "찜한 장소"에 함께 모입니다. 로그인한 회원만.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function StayBookmarkButton({ placeId }: { placeId: number }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled || !session) return;
      setUserId(session.user.id);
      const { count } = await supabase.from("reactions").select("*", { count: "exact", head: true }).eq("place_id", placeId).eq("user_key", session.user.id).eq("type", "bookmark");
      if (!cancelled) setSaved((count ?? 0) > 0);
    });
    return () => { cancelled = true; };
  }, [placeId]);

  const toggle = async () => {
    if (!userId) { router.push(`/login?redirect=/stay/${placeId}`); return; }
    if (busy) return;
    setBusy(true);
    const { error } = saved
      ? await supabase.from("reactions").delete().eq("place_id", placeId).eq("user_key", userId).eq("type", "bookmark")
      : await supabase.from("reactions").insert([{ place_id: placeId, user_key: userId, type: "bookmark" }]);
    setBusy(false);
    if (error) { alert("잠시 후 다시 눌러 주세요."); return; }
    setSaved(!saved);
    if (!saved) alert("찜했어요. 마이페이지에서 볼 수 있어요.");
  };

  return (
    <button onClick={toggle} aria-pressed={saved} aria-label={saved ? "찜 취소" : "찜하기"} style={{ height: 38, padding: "0 12px", borderRadius: 999, border: "none", background: "rgba(255,255,255,0.92)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", color: saved ? "#A05A32" : "#222" }}>
      <Heart size={15} fill={saved ? "#A05A32" : "none"} color={saved ? "#A05A32" : "#222"} />{saved ? "찜함" : "찜"}
    </button>
  );
}
