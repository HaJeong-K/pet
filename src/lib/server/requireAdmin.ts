// src/lib/server/requireAdmin.ts
//
// 관리자 전용 API에서 쓰는 공용 확인 함수. 요청 헤더의 "Authorization: Bearer <로그인 토큰>"으로
// 사용자를 확인하고, users.is_admin이 true일 때만 사용자 정보를 돌려줍니다(아니면 null).
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin
    .from("users").select("is_admin").eq("auth_user_id", user.id).single();
  return profile?.is_admin ? user : null;
}
