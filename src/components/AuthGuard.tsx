"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthGuard() {
  useEffect(() => {
    const checkUser = async () => {
      const alreadyProcessed =
        sessionStorage.getItem("logout_processed");

      if (alreadyProcessed === "true") {
        sessionStorage.removeItem("logout_processed");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      // users 테이블에 유저가 없으면 세션 정리
      if (!profile) {
        console.log("users 테이블 없음");
        return;
      }
    };

    checkUser();
  }, []);

  return null;
}