// src/lib/ownerTab.ts
//
// 사장님 센터(/owner)에서 지금 보고 있는 메뉴 — 화면 위쪽 메뉴 줄(owner/page.tsx)과 아래 탭바(TabBar.tsx)가 같이 씁니다.
// 주소 끝의 #이름(예: /owner#reservations)과 맞춰 두어, 새로고침하거나 주소를 공유해도 같은 메뉴가 열립니다.

// "stays"(숙박 예약)·"lodging"(숙소·객실)은 숙소 사장님에게만, "reservations"·"products"는 가게 사장님에게만 보입니다(owner/page.tsx).
export type OwnerTabKey = "dashboard" | "reservations" | "products" | "stays" | "lodging" | "banner" | "reviews" | "notices" | "place" | "ads" | "report";
const KEYS: OwnerTabKey[] = ["dashboard", "reservations", "products", "stays", "lodging", "banner", "reviews", "notices", "place", "ads", "report"];

const listeners = new Set<() => void>();
let current: OwnerTabKey = "dashboard";
let hooked = false;

function fromHash(): OwnerTabKey {
  const key = typeof window === "undefined" ? "" : window.location.hash.replace("#", "");
  return (KEYS as string[]).includes(key) ? (key as OwnerTabKey) : "dashboard";
}

function ensureHooked() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  current = fromHash();
  // 뒤로 가기·주소 직접 입력으로 #이 바뀌면 따라갑니다.
  window.addEventListener("hashchange", () => {
    const next = fromHash();
    if (next !== current) { current = next; listeners.forEach((fn) => fn()); }
  });
}

export function subscribeOwnerTab(listener: () => void): () => void {
  ensureHooked();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getOwnerTab(): OwnerTabKey {
  ensureHooked();
  return current;
}
/** 서버에서 화면을 만들 때는 늘 첫 메뉴(대시보드) */
export const getOwnerTabOnServer = (): OwnerTabKey => "dashboard";

export function setOwnerTab(next: OwnerTabKey) {
  ensureHooked();
  if (next === current) return;
  current = next;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/owner")) {
    window.history.replaceState(null, "", next === "dashboard" ? window.location.pathname : `#${next}`);
  }
  listeners.forEach((fn) => fn());
}
