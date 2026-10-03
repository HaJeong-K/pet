import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { deleteAccount } from "@/lib/server/deleteAccount";

// POST /api/account/delete   (Authorization: Bearer <로그인 토큰>)
// 마이페이지 회원 탈퇴. 로그인한 본인 계정만 지울 수 있습니다(토큰으로 본인 확인).
// 이메일 가입자는 브라우저에서 비밀번호를 다시 확인한 뒤 이 주소를 부릅니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "로그인 정보가 올바르지 않아요." }, { status: 401 });

  const result = await deleteAccount(user.id, { unlinkKakao: true });
  if (!result.authDeleted) {
    return NextResponse.json({ error: "탈퇴 처리 중 오류가 났어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
