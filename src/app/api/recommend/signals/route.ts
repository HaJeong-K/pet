import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { reviewSatisfactionScore, type AffinityReviewInput } from "@/lib/affinityScore";
import { RECOMMEND_V2_WEIGHTS } from "@/lib/scoringConfig";
import type { PlaceSignals } from "@/lib/recommend";

// 추천 점수 계산에 쓰는 장소별 집계 신호(찜·좋아요·싫어요 수, 시간 감쇠 반영 수,
// 리뷰 만족도)를 서버에서 한 번에 계산해 내려줍니다.
//
// 예전에는 지도 첫 화면마다 reactions 테이블 "전체 행"을 브라우저로 내려받아 직접
// 세었습니다 — 반응이 쌓일수록 첫 로딩이 계속 무거워지는 구조였고, 리뷰 만족도는
// 장소마다 리뷰 원문이 필요해서 목록 정렬에는 아예 반영할 수 없었습니다. 이제는 서버가
// 집계 결과만(장소당 숫자 몇 개) 내려주고, 5분 동안 캐시합니다.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_ROWS = 200_000;
const DAY_MS = 24 * 60 * 60 * 1000;

let cache: { at: number; body: Record<string, PlaceSignals> } | null = null;
let inflight: Promise<Record<string, PlaceSignals>> | null = null;

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let q = supabaseAdmin.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data as T[]) || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

type ReactionRow = { place_id: string | number; type: string; created_at?: string | null };
type ReviewRow = {
  place_id: string | number;
  content: string | null;
  likes: number | null;
  sentiment_score: number | null;
  deleted: boolean | null;
};

async function compute(): Promise<Record<string, PlaceSignals>> {
  // created_at 컬럼이 없는 예전 스키마에서도 동작하도록(감쇠 없이 1로 취급) 폴백합니다.
  let reactions: ReactionRow[];
  try {
    reactions = await fetchAll<ReactionRow>("reactions", "place_id, type, created_at");
  } catch {
    reactions = await fetchAll<ReactionRow>("reactions", "place_id, type");
  }

  let reviews: ReviewRow[] = [];
  try {
    reviews = await fetchAll<ReviewRow>("reviews", "place_id, content, likes, sentiment_score, deleted");
  } catch (e) {
    console.error("[/api/recommend/signals] reviews load failed:", e);
  }

  const now = Date.now();
  const halfLife = RECOMMEND_V2_WEIGHTS.REACTION_HALF_LIFE_DAYS;
  const decay = (iso?: string | null) => {
    if (!iso) return 1;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 1;
    const ageDays = Math.max(0, (now - t) / DAY_MS);
    return Math.pow(0.5, ageDays / halfLife);
  };

  const signals: Record<string, PlaceSignals> = {};
  const get = (id: string) => (signals[id] ??= { b: 0, l: 0, d: 0, bd: 0, ld: 0, rs: null, rc: 0 });

  for (const r of reactions) {
    const s = get(String(r.place_id));
    if (r.type === "bookmark") {
      s.b += 1;
      s.bd += decay(r.created_at);
    } else if (r.type === "like") {
      s.l += 1;
      s.ld += decay(r.created_at);
    } else if (r.type === "dislike") {
      s.d += 1;
    }
  }

  const reviewsByPlace = new Map<string, AffinityReviewInput[]>();
  for (const rv of reviews) {
    if (rv.deleted) continue;
    const id = String(rv.place_id);
    const list = reviewsByPlace.get(id) ?? [];
    list.push({ content: rv.content || "", likes: rv.likes ?? 0, sentimentScore: rv.sentiment_score });
    reviewsByPlace.set(id, list);
  }
  for (const [id, list] of reviewsByPlace) {
    const s = get(id);
    s.rs = reviewSatisfactionScore(list);
    s.rc = list.length;
  }

  // 응답 크기를 줄이기 위해 감쇠값은 소수 둘째 자리까지만 보냅니다.
  for (const s of Object.values(signals)) {
    s.bd = Math.round(s.bd * 100) / 100;
    s.ld = Math.round(s.ld * 100) / 100;
  }
  return signals;
}

export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
      // 동시에 여러 요청이 들어와도 집계는 한 번만 돌도록 진행 중인 작업을 공유합니다.
      inflight ??= compute().finally(() => {
        inflight = null;
      });
      const body = await inflight;
      cache = { at: Date.now(), body };
    }
    return NextResponse.json(
      { signals: cache.body, generatedAt: new Date(cache.at).toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e) {
    console.error("[/api/recommend/signals] failed:", e);
    // 캐시가 있으면 오래됐더라도 그걸 주는 편이 빈 추천보다 낫습니다.
    if (cache) return NextResponse.json({ signals: cache.body, generatedAt: new Date(cache.at).toISOString(), stale: true });
    return NextResponse.json({ signals: {}, error: "signals_unavailable" }, { status: 200 });
  }
}
