// 최근 본 장소·숙소 — 2026-11-13
// 이 기기(브라우저)에만 저장합니다(localStorage). 로그인하지 않아도 되고, 서버로 보내지 않습니다.
// 숙소 화면·장소 상세를 열 때 remember로 남기고, 숙소 탭·마이페이지에서 최근 순으로 보여 줍니다.

export type RecentView = { kind: "stay" | "place"; id: number; name: string; image: string | null; sub: string | null; at: number };

const KEY = "ggk-recent-views";
const MAX = 20;

export function readRecentViews(kind?: RecentView["kind"]): RecentView[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]") as RecentView[];
    const clean = Array.isArray(list) ? list.filter((v) => v && typeof v.id === "number" && typeof v.name === "string") : [];
    return kind ? clean.filter((v) => v.kind === kind) : clean;
  } catch {
    return [];
  }
}

export function rememberView(view: Omit<RecentView, "at">): void {
  if (typeof window === "undefined" || !view.name) return;
  try {
    const rest = readRecentViews().filter((v) => !(v.kind === view.kind && v.id === view.id));
    localStorage.setItem(KEY, JSON.stringify([{ ...view, at: Date.now() }, ...rest].slice(0, MAX)));
  } catch { /* 저장소를 못 쓰는 경우(사생활 보호 모드 등)는 그냥 넘어갑니다 */ }
}

export function clearRecentViews(): void {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}
