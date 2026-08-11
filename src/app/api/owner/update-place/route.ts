import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// 인증된 사장님이 "본인 업장"의 정보를 직접 수정할 때 쓰는 라우트입니다.
// 클라이언트(anon key)로 직접 update()를 하면 RLS에 막혀 조용히 0건 수정되는
// 문제가 있었던 전례(장소 삭제 버그와 동일 원인)가 있어, 여기서도 service role로
// 처리하되 "이 사람이 정말 이 장소의 인증된 사장님인가"를 서버에서 다시 확인합니다
// (요청 바디의 placeId를 그대로 믿지 않음 — 다른 장소를 수정하려는 시도를 막기 위함).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EDITABLE_FIELDS = [
  "hours", "phone", "closed_days", "pet_zone", "memo",
  "parking", "entry_fee", "website", "large_dog",
] as const;

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "인증 정보 없음" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("owner_status, owner_place_id")
      .eq("auth_user_id", user.id)
      .single();

    if (profile?.owner_status !== "verified" || !profile?.owner_place_id) {
      return NextResponse.json({ error: "인증된 사장님 계정이 아니거나 연결된 업장이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const { placeId, fields } = body as { placeId: number; fields: Record<string, unknown> };

    if (Number(placeId) !== Number(profile.owner_place_id)) {
      return NextResponse.json({ error: "본인 업장만 수정할 수 있습니다" }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in (fields || {})) update[key] = fields[key];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "수정할 항목이 없습니다" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("places").update(update).eq("id", placeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/owner/update-place] failed:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
