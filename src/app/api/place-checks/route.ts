import { NextRequest, NextResponse } from "next/server";
import { db, isMissingSchema, userOf } from "@/lib/server/ownerStore";
import { clientIp, createRateLimiter } from "@/lib/server/rateLimit";
import { notifyAdmin } from "@/lib/server/notify";
import { getPublicDataBuiltAt } from "@/lib/publicDataAggregate";
import { CHANGE_DETAILS, CHECK_COOLDOWN_DAYS, changeDetailLabel, dataSourceOf, summarizeChecks, type CheckRow } from "@/lib/placeChecks";

// 장소 정보 확인(최신성) — 장소 상세 화면의 "정보 확인" 칸
//   GET  ?placeId=&userKey=  → 최근 확인 요약(방문자 확인·달라졌어요 제보), 사장님 확인일, 공공데이터 갱신일, 내 최근 확인
//   POST { placeId, verdict: "ok" | "changed", detail, userKey }
//        같은 사람(회원이면 계정, 아니면 기기)이 같은 장소를 7일 안에 다시 누르면 앞의 확인을 바꿉니다(한 사람이 여러 번 세지지 않게).
//        "동반 불가"·"폐업" 제보는 관리자에게 바로 알립니다.

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
// 한 기기에서 1시간에 30번까지(여러 장소를 둘러보며 누르는 정도는 충분히)
const allow = createRateLimiter({ windowMs: 60 * 60_000, max: 30 });
const DAY = 86_400_000;
const validPlaceId = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const validUserKey = (v: unknown) => (typeof v === "string" && /^[\w-]{8,64}$/.test(v) ? v : null);

export async function GET(req: NextRequest) {
  const placeId = validPlaceId(req.nextUrl.searchParams.get("placeId"));
  if (!placeId) return fail("장소를 찾을 수 없어요.", 400);
  const userKey = validUserKey(req.nextUrl.searchParams.get("userKey"));
  const user = await userOf(req);

  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const [checks, owner] = await Promise.all([
    db.from("place_checks").select("verdict, detail, created_at, auth_user_id, user_key").eq("place_id", placeId).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    placeId < 1_000_000_000 ? db.from("places").select("owner_verified_at").eq("id", placeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (checks.error && isMissingSchema(checks.error)) return NextResponse.json({ ready: false });
  if (checks.error) return fail(checks.error.message, 500);

  const rows = (checks.data ?? []) as (CheckRow & { auth_user_id: string | null; user_key: string | null })[];
  const mineRow = rows.find((r) => (user && r.auth_user_id === user.id) || (!user && userKey && r.user_key === userKey));
  const source = dataSourceOf(placeId);
  const builtAt = source && placeId < 9_000_000_000 ? await getPublicDataBuiltAt() : null;

  return NextResponse.json({
    ready: true,
    summary: summarizeChecks(rows),
    ownerVerifiedAt: (owner.data as { owner_verified_at?: string | null } | null)?.owner_verified_at ?? null,
    dataSource: source,
    dataSyncedAt: builtAt ? new Date(builtAt).toISOString() : null,
    mine: mineRow ? { verdict: mineRow.verdict, detail: mineRow.detail, at: mineRow.created_at } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!allow(clientIp(req))) return fail("확인을 너무 자주 눌렀어요. 잠시 후 다시 시도해 주세요.", 429);
  const body = (await req.json().catch(() => null)) as { placeId?: unknown; verdict?: unknown; detail?: unknown; userKey?: unknown; placeName?: unknown } | null;
  const placeId = validPlaceId(body?.placeId);
  if (!placeId) return fail("장소를 찾을 수 없어요.", 400);
  const verdict = body?.verdict === "ok" || body?.verdict === "changed" ? body.verdict : null;
  if (!verdict) return fail("확인 내용을 골라 주세요.", 400);
  const detail = verdict === "changed" ? CHANGE_DETAILS.find((d) => d.id === body?.detail)?.id ?? null : null;
  if (verdict === "changed" && !detail) return fail("무엇이 달라졌는지 골라 주세요.", 400);

  const user = await userOf(req);
  const userKey = validUserKey(body?.userKey);
  if (!user && !userKey) return fail("기기 정보를 확인하지 못했어요. 화면을 새로 고쳐 주세요.", 400);

  // 같은 사람의 최근 확인이 있으면 그것을 바꿉니다.
  const since = new Date(Date.now() - CHECK_COOLDOWN_DAYS * DAY).toISOString();
  let query = db.from("place_checks").select("id").eq("place_id", placeId).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  query = user ? query.eq("auth_user_id", user.id) : query.eq("user_key", userKey!);
  const { data: recent, error: findError } = await query;
  if (findError) return fail(isMissingSchema(findError) ? "정보 확인 기능을 준비하고 있어요." : findError.message, isMissingSchema(findError) ? 503 : 500);

  const row = { place_id: placeId, verdict, detail, auth_user_id: user?.id ?? null, user_key: user ? null : userKey, created_at: new Date().toISOString() };
  const { error } = recent && recent.length > 0
    ? await db.from("place_checks").update(row).eq("id", recent[0].id)
    : await db.from("place_checks").insert([row]);
  if (error) return fail(error.message, 500);

  // 동반 불가·폐업 제보는 지도에서 바로 고쳐야 할 수 있어 관리자에게 알립니다.
  if (verdict === "changed" && (detail === "no_pets" || detail === "closed")) {
    const name = typeof body?.placeName === "string" ? body.placeName.slice(0, 40) : `장소 #${placeId}`;
    await notifyAdmin({ title: `⚠️ 방문자 제보: ${changeDetailLabel(detail)}`, lines: [name, user ? "회원 제보" : "비회원 제보"], path: "/admin/quality" });
  }
  return NextResponse.json({ ok: true, updated: !!(recent && recent.length > 0) });
}
