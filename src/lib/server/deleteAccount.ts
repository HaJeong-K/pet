// src/lib/server/deleteAccount.ts
//
// 회원 탈퇴 처리(서버 전용) — 마이페이지 탈퇴(/api/account/delete)와 카카오 연결 해제 웹훅(/api/kakao/unlink)이
// 같은 규칙으로 정리하도록 한곳에 둡니다.
//   1) 프로필(users 행) 삭제
//   2) 로그인 계정(auth.users — 이메일·카카오 연결 정보) 삭제
//   3) (우리 쪽에서 탈퇴했고 카카오 계정이면) 카카오에도 앱 연결 해제 요청 — 카카오 쪽에 연결이 남지 않게
// 작성한 후기·댓글·글은 마이페이지 안내("작성한 댓글은 유지됩니다")대로 남깁니다.
//
// ⚠ 예전엔 브라우저에서 supabase.auth.admin.deleteUser를 불렀는데, 이 함수는 서버 관리자 권한이 있어야만
//    동작해서 실제로는 로그인 계정이 지워지지 않고 남아 있었습니다(다시 로그인하면 계정이 되살아남).

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const KAKAO_UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** 카카오 회원번호(카카오 user_id) */
export function kakaoIdOf(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === "kakao");
  const id = identity?.id ?? identity?.identity_data?.sub ?? identity?.identity_data?.provider_id;
  return id ? String(id) : null;
}

/** 카카오 회원번호로 우리 회원을 찾습니다(카카오 연결 해제 웹훅용). */
export async function findUserByKakaoId(kakaoId: string): Promise<User | null> {
  const client = admin();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => kakaoIdOf(u) === kakaoId);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function unlinkKakao(kakaoId: string): Promise<boolean> {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) return false;
  try {
    const res = await fetch(KAKAO_UNLINK_URL, {
      method: "POST",
      headers: { Authorization: `KakaoAK ${adminKey}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ target_id_type: "user_id", target_id: kakaoId }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteAccount(
  authUserId: string,
  opts: { unlinkKakao?: boolean } = {}
): Promise<{ profileDeleted: boolean; authDeleted: boolean; kakaoUnlinked: boolean | null }> {
  const client = admin();
  const { data: { user } } = await client.auth.admin.getUserById(authUserId);
  const kakaoId = user ? kakaoIdOf(user) : null;

  const { error: profileError } = await client.from("users").delete().eq("auth_user_id", authUserId);
  const { error: authError } = await client.auth.admin.deleteUser(authUserId);
  if (authError) console.error("[deleteAccount] 로그인 계정 삭제 실패:", authError.message);

  const kakaoUnlinked = opts.unlinkKakao && kakaoId ? await unlinkKakao(kakaoId) : null;
  return { profileDeleted: !profileError, authDeleted: !authError, kakaoUnlinked };
}
