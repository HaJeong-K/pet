// src/lib/savedCourses.ts
//
// 저장한 코스(AI 추천 코스 보관함) — 로그인한 회원 전용.
// 지도에서 "이 코스 저장"을 누르면 그 시점의 정거장 목록을 그대로 담아 두고, 마이페이지에서 다시 봅니다.
// 저장·조회·삭제는 본인 것만 되도록 DB 정책(scripts/sql/saved-courses.sql)이 막습니다.

import { supabase } from "@/lib/supabase";
import { parkPlaceId } from "@/lib/parkPlace";

export type SavedStop = {
  /** 장소 상세로 갈 때 쓰는 번호(공원은 공원 장소 번호로 바꿔 둠) */
  id: number;
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
  address?: string | null;
  role?: string | null;
};

export type SavedCourse = {
  id: number;
  title: string;
  theme: string | null;
  stops: SavedStop[];
  total_distance_km: number | null;
  estimated_minutes: number | null;
  created_at: string;
};

/** 한 사람이 보관할 수 있는 코스 수 */
export const MAX_SAVED_COURSES = 30;

type RouteLike = {
  stops: { place: { id: string | number; name: string; lat?: unknown; lng?: unknown; category?: string | null; address?: string | null }; role?: string }[];
  totalDistanceKm: number;
  estimatedMinutes: number;
};

/** 추천 코스 → 저장용 정거장 목록(좌표가 없는 정거장은 뺌) */
export function toSavedStops(route: RouteLike): SavedStop[] {
  const stops: SavedStop[] = [];
  for (const s of route.stops) {
    const lat = parseFloat(String(s.place.lat)), lng = parseFloat(String(s.place.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const raw = String(s.place.id);
    const id = raw.startsWith("park-") ? parkPlaceId(raw.slice("park-".length)) : Number(raw);
    if (!Number.isFinite(id)) continue;
    stops.push({ id, name: s.place.name, lat, lng, category: s.place.category ?? null, address: s.place.address ?? null, role: s.role ?? null });
  }
  return stops;
}

/** 코스 이름 — "산책 중심 · 플러피크림 외 3곳" */
export function courseTitle(themeLabel: string, stops: SavedStop[]): string {
  if (stops.length === 0) return themeLabel;
  return stops.length === 1 ? `${themeLabel} · ${stops[0].name}` : `${themeLabel} · ${stops[0].name} 외 ${stops.length - 1}곳`;
}

const tableMissing = (message: string) => /saved_courses/.test(message) && /find|exist|schema cache/i.test(message);

/** 저장하고, 저장된 코스 번호를 돌려줍니다(잘못 눌렀을 때 바로 취소할 수 있게). */
export async function saveCourse(input: { title: string; theme: string; route: RouteLike }): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const stops = toSavedStops(input.route);
  if (stops.length === 0) return { ok: false, error: "저장할 정거장이 없어요." };
  const { count, error: countError } = await supabase.from("saved_courses").select("id", { count: "exact", head: true });
  if (countError) return { ok: false, error: tableMissing(countError.message) ? "코스 저장 기능을 준비 중이에요." : "코스를 저장하지 못했어요." };
  if ((count ?? 0) >= MAX_SAVED_COURSES) return { ok: false, error: `코스는 ${MAX_SAVED_COURSES}개까지 저장할 수 있어요. 마이페이지에서 안 쓰는 코스를 지워 주세요.` };
  const { data, error } = await supabase.from("saved_courses").insert([{
    title: input.title.slice(0, 80),
    theme: input.theme,
    stops,
    total_distance_km: input.route.totalDistanceKm,
    estimated_minutes: Math.round(input.route.estimatedMinutes),
  }]).select("id").single();
  return error || !data ? { ok: false, error: "코스를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." } : { ok: true, id: data.id as number };
}

export async function listSavedCourses(): Promise<SavedCourse[]> {
  const { data, error } = await supabase
    .from("saved_courses")
    .select("id, title, theme, stops, total_distance_km, estimated_minutes, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_SAVED_COURSES);
  if (error || !data) return [];
  return data.map((row) => ({ ...row, stops: Array.isArray(row.stops) ? (row.stops as SavedStop[]) : [] })) as SavedCourse[];
}

export async function deleteSavedCourse(id: number): Promise<boolean> {
  const { error } = await supabase.from("saved_courses").delete().eq("id", id);
  return !error;
}
