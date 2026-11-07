"use client";

// 회원 이름·휴대폰 확인 — 숙박 예약·쇼핑 주문·커뮤니티 글쓰기 전에 꼭 있어야 합니다(2026-11-07 대표 결정).
//   · getMyContact(): 저장된 이름·휴대폰(없거나 만 14세 이상 확인 전이면 null) — 예약 화면 미리 채우기에도 씁니다
//   · ensureContact(이유): 없으면 등록 창(ContactPrompt, "나중에" 없음)을 띄우고, 등록하면 그 값을 돌려줍니다. 닫으면 null.

import { supabase } from "@/lib/supabase";

export const REQUIRE_CONTACT_EVENT = "ggk-require-contact";
export type MyContact = { name: string; phone: string };
export type RequireContactDetail = { reason: string; resolve: (ok: boolean) => void };

export async function getMyContact(): Promise<MyContact | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  // 만 14세 이상 확인도 함께 봅니다(간편가입 회원은 이 창에서 처음 확인받음)
  if (!session.user.user_metadata?.age14_confirmed_at) return null;
  const { data } = await supabase.from("user_contacts").select("name, phone").eq("auth_user_id", session.user.id).maybeSingle();
  return data?.name && data?.phone ? { name: data.name, phone: data.phone } : null;
}

export async function ensureContact(reason: string): Promise<MyContact | null> {
  const saved = await getMyContact();
  if (saved) return saved;
  const ok = await new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<RequireContactDetail>(REQUIRE_CONTACT_EVENT, { detail: { reason, resolve } }));
  });
  return ok ? getMyContact() : null;
}
