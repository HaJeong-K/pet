// src/lib/staleDeploy.ts
//
// 새 버전을 배포하면 예전 버전의 화면 조각 파일(chunk)은 서버에서 사라집니다. 그때 예전 버전을 열어 둔
// 브라우저가 다른 메뉴로 이동하면 "Failed to load chunk …" 오류가 나서 오류 화면이 떴습니다
// (실제 사례: 배포 직후 관리자 "성과 지표"를 누르자 "일시적인 오류가 발생했어요").
// 이 오류는 새로고침 한 번이면 새 버전을 받아 해결되므로, 사용자가 누르지 않아도 자동으로 새로고침합니다.
// 새로고침해도 계속 실패하는 경우 무한 반복하지 않도록 짧은 시간 안에는 한 번만 합니다.

const KEY = "ggk_stale_reload_at";
const RETRY_GAP_MS = 30_000;

export function isStaleDeployError(error: { name?: string; message?: string } | null | undefined): boolean {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /ChunkLoadError|Failed to load chunk|Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(text);
}

/** 배포로 인한 파일 누락 오류면 새로고침하고 true를 돌려줍니다(방금 이미 새로고침했다면 false). */
export function reloadIfStaleDeploy(error: { name?: string; message?: string } | null | undefined): boolean {
  if (typeof window === "undefined" || !isStaleDeployError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < RETRY_GAP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* 저장소를 못 쓰면 그냥 한 번 새로고침 */ }
  window.location.reload();
  return true;
}
