"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthGuard() {
  useEffect(() => {
    const checkUser = async () => {
      const alreadyProcessed = sessionStorage.getItem("logout_processed");
      if (alreadyProcessed === "true") {
        sessionStorage.removeItem("logout_processed");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ✅ [추가] 로그인 유저의 users 테이블 동기화
      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!profile) {
        // users 테이블에 없으면 새로 생성
        const nickname =
          user.user_metadata?.full_name ||
          user.user_metadata?.preferred_username ||
          user.user_metadata?.nickname ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "사용자";

        await supabase.from("users").upsert([
          {
            auth_user_id: user.id,
            email: user.email || "",
            nickname,
          },
        ], { onConflict: "auth_user_id" });
      }
    };

    checkUser();
  }, []);

  return null;
}