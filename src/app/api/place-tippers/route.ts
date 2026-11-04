import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/ownerStore";

// 장소 상세의 "제보자 표시" — 이 장소를 제보했거나 정보를 보탠 사람의 닉네임(비회원은 "비회원")
//   GET ?placeId= → { tippers: [{ name, kind: "new_place" | "info_update" }], ownerAt }
//   ownerAt: 인증된 사장님이 이 장소 정보를 마지막으로 직접 고치거나 "지금 정보가 맞아요"를 누른 때(없으면 null)
// 제보 표(proposals)는 본인만 읽을 수 있어서 서버가 승인된 것만 골라 닉네임만 내보냅니다(이메일·연락처는 보내지 않음).

export async function GET(req: NextRequest) {
  const placeId = Number(req.nextUrl.searchParams.get("placeId"));
  if (!Number.isInteger(placeId) || placeId <= 0) return NextResponse.json({ tippers: [], ownerAt: null });
  const ownerAt = placeId < 1_000_000_000
    ? ((await db.from("places").select("owner_verified_at").eq("id", placeId).maybeSingle()).data?.owner_verified_at as string | null) ?? null
    : null;
  const { data } = await db.from("proposals").select("auth_user_id, proposal_kind, created_at").eq("place_id", placeId).eq("status", "approved").order("created_at", { ascending: true }).limit(10);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.auth_user_id).filter((v): v is string => !!v))];
  const { data: profiles } = ids.length ? await db.from("public_profiles").select("auth_user_id, nickname").in("auth_user_id", ids) : { data: [] };
  const nick = new Map((profiles ?? []).map((p) => [p.auth_user_id, p.nickname as string | null]));
  const seen = new Set<string>();
  const tippers = rows
    .map((r) => ({ name: (r.auth_user_id && nick.get(r.auth_user_id)) || "비회원", kind: r.proposal_kind === "info_update" ? "info_update" : "new_place" }))
    .filter((t) => (seen.has(`${t.name}|${t.kind}`) ? false : (seen.add(`${t.name}|${t.kind}`), true)));
  return NextResponse.json({ tippers, ownerAt }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
