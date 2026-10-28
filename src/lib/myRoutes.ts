// src/lib/myRoutes.ts
//
// 내 경로 — 회원이 직접 장소를 골라 순서대로 엮는 여행 경로입니다(장소 상세의 "내 경로에 추가").
// 저장은 AI 코스와 같은 saved_courses 표를 쓰고, theme = 'custom'으로 구분합니다(scripts/sql/my-routes.sql).
// 마이페이지 "코스·내 경로"에서 순서 바꾸기·빼기·이름 바꾸기를 합니다.
// 순서·거리 계산은 글자·숫자만 다루는 함수로 따로 두었습니다(myRoutes.test.ts).

import { supabase } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import type { SavedCourse, SavedStop } from "@/lib/savedCourses";

export const MY_ROUTE_THEME = "custom";
/** 한 경로에 담을 수 있는 장소 수 / 한 사람이 만들 수 있는 경로 수 */
export const MY_ROUTE_STOPS_MAX = 20;
export const MY_ROUTES_MAX = 20;
export const MY_ROUTE_TITLE_MAX = 40;

// ── 순서·거리(순수 함수) ──

/** 장소를 경로 끝에 붙입니다. 이미 있으면 그대로 두고 added: false */
export function appendStop(stops: SavedStop[], stop: SavedStop): { stops: SavedStop[]; added: boolean } {
  if (stops.some((s) => s.id === stop.id)) return { stops, added: false };
  return { stops: [...stops, stop], added: true };
}
/** index번째 장소를 한 칸 위(-1)·아래(+1)로 옮깁니다. 끝에서는 그대로 */
export function moveStop(stops: SavedStop[], index: number, step: -1 | 1): SavedStop[] {
  const other = index + step;
  if (index < 0 || index >= stops.length || other < 0 || other >= stops.length) return stops;
  const next = [...stops];
  [next[index], next[other]] = [next[other], next[index]];
  return next;
}
export const removeStop = (stops: SavedStop[], index: number) => stops.filter((_, i) => i !== index);

/** 순서대로 이은 직선거리 합(km, 소수 한 자리) */
export function routeDistanceKm(stops: SavedStop[]): number {
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  return Math.round(km * 10) / 10;
}

export const isMyRoute = (course: Pick<SavedCourse, "theme">) => course.theme === MY_ROUTE_THEME;

// ── 저장(로그인한 본인 것만 — DB 정책) ──

const NOT_READY = "내 경로 기능을 준비 중이에요.";
const missing = (message: string) => /saved_courses|policy|permission/i.test(message);

export async function listMyRoutes(): Promise<SavedCourse[]> {
  const { data, error } = await supabase.from("saved_courses")
    .select("id, title, theme, stops, total_distance_km, estimated_minutes, created_at")
    .eq("theme", MY_ROUTE_THEME).order("created_at", { ascending: false }).limit(MY_ROUTES_MAX);
  if (error || !data) return [];
  return data.map((row) => ({ ...row, stops: Array.isArray(row.stops) ? (row.stops as SavedStop[]) : [] })) as SavedCourse[];
}

/** 새 경로를 만들고 첫 장소를 담습니다 */
export async function createMyRoute(title: string, first: SavedStop): Promise<{ ok: true; route: SavedCourse } | { ok: false; error: string }> {
  const name = title.trim().slice(0, MY_ROUTE_TITLE_MAX);
  if (!name) return { ok: false, error: "경로 이름을 적어 주세요." };
  const { count } = await supabase.from("saved_courses").select("id", { count: "exact", head: true }).eq("theme", MY_ROUTE_THEME);
  if ((count ?? 0) >= MY_ROUTES_MAX) return { ok: false, error: `내 경로는 ${MY_ROUTES_MAX}개까지 만들 수 있어요. 마이페이지에서 안 쓰는 경로를 지워 주세요.` };
  const { data, error } = await supabase.from("saved_courses")
    .insert([{ title: name, theme: MY_ROUTE_THEME, stops: [first], total_distance_km: 0, estimated_minutes: null }])
    .select("id, title, theme, stops, total_distance_km, estimated_minutes, created_at").single();
  if (error || !data) return { ok: false, error: error && missing(error.message) ? NOT_READY : "경로를 만들지 못했어요." };
  return { ok: true, route: { ...data, stops: data.stops as SavedStop[] } as SavedCourse };
}

/** 경로의 장소 목록(순서)·이름을 저장합니다. 거리도 다시 계산합니다 */
export async function saveMyRoute(id: number, stops: SavedStop[], title?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (stops.length > MY_ROUTE_STOPS_MAX) return { ok: false, error: `한 경로에 ${MY_ROUTE_STOPS_MAX}곳까지 담을 수 있어요.` };
  const patch: Record<string, unknown> = { stops, total_distance_km: routeDistanceKm(stops) };
  if (title !== undefined) {
    const name = title.trim().slice(0, MY_ROUTE_TITLE_MAX);
    if (!name) return { ok: false, error: "경로 이름을 적어 주세요." };
    patch.title = name;
  }
  const { data, error } = await supabase.from("saved_courses").update(patch).eq("id", id).eq("theme", MY_ROUTE_THEME).select("id");
  // 수정 정책(scripts/sql/my-routes.sql)이 없으면 오류 없이 0건이 바뀝니다
  if (error || !data || data.length === 0) return { ok: false, error: !error || missing(error.message) ? NOT_READY : "저장하지 못했어요." };
  return { ok: true };
}

/** 경로 끝에 장소를 붙입니다 */
export async function addStopToMyRoute(route: SavedCourse, stop: SavedStop): Promise<{ ok: true; added: boolean } | { ok: false; error: string }> {
  const { stops, added } = appendStop(route.stops, stop);
  if (!added) return { ok: true, added: false };
  if (stops.length > MY_ROUTE_STOPS_MAX) return { ok: false, error: `한 경로에 ${MY_ROUTE_STOPS_MAX}곳까지 담을 수 있어요.` };
  const saved = await saveMyRoute(route.id, stops);
  return saved.ok ? { ok: true, added: true } : saved;
}
