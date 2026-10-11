// src/lib/server/memberLevelData.ts
//
// 회원 레벨을 실제 기록에서 계산해 저장합니다(서버 전용).
// 규칙(점수·단계·방문 조건)은 src/lib/memberLevel.ts — 여기서는 DB에서 활동·방문 기록을 모아 그 함수에 넘기기만 합니다.
// 필요한 표는 scripts/sql/member-level.sql로 만듭니다. 표가 아직 없으면 null을 돌려줍니다(화면은 레벨 없이 그대로 동작).
//
// 점수로 치는 활동
//   · 장소 제보 승인 / 정보 추가 제안 승인 : proposals (status = approved)
//   · 받아들여진 신고                      : reports (resolution = accepted, reporter_auth_user_id)
//   · 후기                                 : reviews (본인이 지운 것은 제외)
//   · 커뮤니티 글                          : community_posts (공지·검토 중·반려·본인 삭제 제외 — 글쓴이는 author_auth_key 칸)
//   · 댓글·답글                            : community_comments + review_replies
//   · 관리자 삭제(감점)                    : 위 글·후기·댓글 중 관리자가 지운 것
//   · 장소 사진 등록                       : place_images (auth_user_id — 누가 올렸는지는 DB가 채웁니다)
import { createClient } from "@supabase/supabase-js";
import { kstMonth, scoreActivities, updateLevel, type Activity, type LevelProgress, type LevelState, type ScoreBreakdown } from "@/lib/memberLevel";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** 한 회원의 활동을 읽는 최대 줄 수(표마다) — 넘으면 최근 것부터 */
const MAX_ROWS = 3000;

/** 한국 시간 기준 오늘 날짜(YYYY-MM-DD) */
export function kstToday(now: number | Date = Date.now()): string {
  return new Date(new Date(now).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 표가 아직 없을 때의 오류인지(SQL을 실행하기 전) */
const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? ""));

/** 오늘 방문을 기록합니다(하루에 한 줄 — 이미 있으면 그대로). 표가 없으면 false */
export async function recordVisit(authUserId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("member_visits")
    .upsert({ auth_user_id: authUserId, visit_day: kstToday() }, { onConflict: "auth_user_id,visit_day", ignoreDuplicates: true });
  if (error) {
    if (!isMissingTable(error)) console.error("[memberLevel] 방문 기록 실패:", error.message);
    return false;
  }
  return true;
}

export type MemberLevelResult = { progress: LevelProgress; score: ScoreBreakdown };

/** 활동·방문 기록으로 레벨을 계산하고 저장합니다. 레벨 표가 없으면 null */
export async function computeMemberLevel(authUserId: string): Promise<MemberLevelResult | null> {
  const [saved, visits, proposals, reports, reviews, replies, posts, comments, photos] = await Promise.all([
    supabaseAdmin.from("member_levels").select("level, earned_level, evaluated_month, started_month").eq("auth_user_id", authUserId).maybeSingle(),
    supabaseAdmin.from("member_visits").select("visit_day").eq("auth_user_id", authUserId).order("visit_day", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("proposals").select("created_at, proposal_kind").eq("auth_user_id", authUserId).eq("status", "approved").limit(MAX_ROWS),
    supabaseAdmin.from("reports").select("created_at").eq("reporter_auth_user_id", authUserId).eq("resolution", "accepted").limit(MAX_ROWS),
    supabaseAdmin.from("reviews").select("created_at, deleted, is_admin_deleted").eq("auth_user_id", authUserId).order("created_at", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("review_replies").select("created_at, deleted, is_admin_deleted").eq("auth_user_id", authUserId).order("created_at", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("community_posts").select("created_at, deleted, is_admin_deleted, is_notice, review_status").eq("author_auth_key", authUserId).order("created_at", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("community_comments").select("created_at, deleted, is_admin_deleted").eq("author_auth_key", authUserId).order("created_at", { ascending: false }).limit(MAX_ROWS),
    supabaseAdmin.from("place_images").select("created_at").eq("auth_user_id", authUserId).order("created_at", { ascending: false }).limit(MAX_ROWS),
  ]);
  // 레벨 표가 없으면(SQL 실행 전) 레벨 기능 없이 동작합니다.
  if (isMissingTable(saved.error) || isMissingTable(visits.error)) return null;
  if (saved.error) throw new Error(saved.error.message);

  const activities: Activity[] = [];
  for (const p of proposals.data ?? []) activities.push({ type: p.proposal_kind === "info_update" ? "info_update_approved" : "tip_approved", at: p.created_at });
  // reporter_auth_user_id 칸이 아직 없으면(오류) 신고 점수만 0으로 둡니다.
  for (const r of reports.data ?? []) activities.push({ type: "report_accepted", at: r.created_at });
  for (const r of reviews.data ?? []) {
    if (r.is_admin_deleted) activities.push({ type: "admin_deleted", at: r.created_at });
    else if (!r.deleted) activities.push({ type: "review", at: r.created_at });
  }
  for (const list of [replies.data ?? [], comments.data ?? []]) {
    for (const c of list) {
      if (c.is_admin_deleted) activities.push({ type: "admin_deleted", at: c.created_at });
      else if (!c.deleted) activities.push({ type: "comment", at: c.created_at });
    }
  }
  for (const p of posts.data ?? []) {
    if (p.is_notice) continue;
    if (p.is_admin_deleted) activities.push({ type: "admin_deleted", at: p.created_at });
    else if (!p.deleted && (p.review_status == null || p.review_status === "visible")) activities.push({ type: "post", at: p.created_at });
  }
  // 장소 사진: 지워진 사진(신고·관리자 삭제)은 줄 자체가 없어 점수도 함께 사라집니다. 올린 사람 칸이 아직 없으면 0.
  for (const p of photos.data ?? []) activities.push({ type: "place_photo", at: p.created_at });
  // 하루 상한은 "그날 먼저 한 것부터" 인정되도록 시간순으로 넘깁니다.
  activities.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const score = scoreActivities(activities);

  // 방문: 날짜(한국 시간)가 이미 하루에 한 줄이므로 달별로 세기만 합니다.
  const visitsByMonth: Record<string, number> = {};
  for (const v of visits.data ?? []) {
    const month = String(v.visit_day).slice(0, 7);
    visitsByMonth[month] = (visitsByMonth[month] ?? 0) + 1;
  }

  const previous: LevelState | null = saved.data
    ? { level: saved.data.level, earnedLevel: saved.data.earned_level, evaluatedMonth: saved.data.evaluated_month, startedMonth: saved.data.started_month }
    : null;
  const progress = updateLevel(previous, { points: score.total, mapContributions: score.mapContributions, visits: visitsByMonth });

  const { error: saveError } = await supabaseAdmin.from("member_levels").upsert({
    auth_user_id: authUserId,
    level: progress.state.level,
    earned_level: progress.state.earnedLevel,
    evaluated_month: progress.state.evaluatedMonth,
    started_month: progress.state.startedMonth,
    points: score.total,
    map_contributions: score.mapContributions,
    updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id" });
  if (saveError) console.error("[memberLevel] 레벨 저장 실패:", saveError.message);

  return { progress, score };
}

/** 여러 회원의 지금 레벨(배지 표시용). 기록이 없는 회원은 결과에 없습니다(화면에서는 1단계로 봅니다). */
export async function getMemberLevels(authUserIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(authUserIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (ids.length === 0) return {};
  const { data, error } = await supabaseAdmin.from("member_levels").select("auth_user_id, level").in("auth_user_id", ids);
  if (error) {
    if (!isMissingTable(error)) console.error("[memberLevel] 레벨 조회 실패:", error.message);
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.auth_user_id as string] = row.level as number;
  return out;
}

/** 요청의 로그인 토큰으로 회원을 확인합니다(아니면 null). */
export async function userFromRequest(authorization: string | null): Promise<{ id: string } | null> {
  if (!authorization) return null;
  const token = authorization.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error || !user ? null : { id: user.id };
}

/** 이번 달(한국 시간) — 화면 표시용 */
export const currentKstMonth = () => kstMonth(Date.now());
