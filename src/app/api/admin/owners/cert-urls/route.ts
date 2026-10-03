import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";

// POST /api/admin/owners/cert-urls   body: { userIds: string[] }   (관리자 전용)
// 사업자등록증 버킷(owner-docs)은 개인정보 보호를 위해 비공개라, 관리자 화면에서 볼 때만
// 10분 동안 유효한 임시 주소(signed URL)를 만들어 줍니다.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const SIGNED_URL_SECONDS = 10 * 60;

/** 예전에 저장된 공개 주소(…/object/public/owner-docs/<경로>)에서 저장소 안 경로만 꺼냅니다. */
function certPath(stored: string): string | null {
  const marker = "/owner-docs/";
  const i = stored.indexOf(marker);
  if (i >= 0) return decodeURIComponent(stored.slice(i + marker.length).split("?")[0]);
  return stored.startsWith("http") ? null : stored;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "관리자 권한 없음" }, { status: 403 });
  const { userIds } = (await req.json().catch(() => ({}))) as { userIds?: string[] };
  if (!Array.isArray(userIds) || userIds.length === 0) return NextResponse.json({ urls: {} });

  const { data: rows } = await supabaseAdmin
    .from("users")
    .select("auth_user_id, owner_cert_url")
    .in("auth_user_id", userIds.slice(0, 100));

  const urls: Record<string, string> = {};
  await Promise.all(
    (rows || []).map(async (r) => {
      const path = r.owner_cert_url ? certPath(r.owner_cert_url) : null;
      if (!path) return;
      const { data } = await supabaseAdmin.storage.from("owner-docs").createSignedUrl(path, SIGNED_URL_SECONDS);
      if (data?.signedUrl) urls[r.auth_user_id] = data.signedUrl;
    })
  );
  return NextResponse.json({ urls });
}
