// src/lib/experiment.ts
//
// 추천 알고리즘 A/B 버킷 배정.
//
// user_key(비로그인 포함 모든 방문자에게 이미 부여되는 localStorage UUID)를 해시해서
// 0~99 버킷에 고정 배정합니다 — 같은 사용자는 새로고침/재방문해도 항상 같은 그룹이라
// 그룹 간 지표(클릭률·찜 전환율)를 공정하게 비교할 수 있습니다.
//
// 롤아웃 비율은 NEXT_PUBLIC_REC_V2_ROLLOUT(0~100, 기본 100)으로 조절합니다.
//   - 100: 전원 v2(신규 알고리즘) — 출시 기본값
//   - 50 : 절반은 v1(기존 규칙), 절반은 v2 → /admin/analytics의 "추천 성과"에서 비교
//   - 0  : 전원 v1(문제 발생 시 즉시 롤백용 — 재배포 없이 환경변수만 바꾸면 됩니다)

export type RecVariant = "v1" | "v2";

/** FNV-1a 32bit — 가볍고 분포가 고른 비암호학적 해시(버킷 배정 용도로 충분) */
export function hashToBucket(key: string, salt = "rec"): number {
  let h = 0x811c9dc5;
  const s = `${salt}:${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

export function getRolloutPercent(): number {
  const raw = Number(process.env.NEXT_PUBLIC_REC_V2_ROLLOUT ?? 100);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(100, raw));
}

export function assignRecVariant(userKey: string, rolloutPercent = getRolloutPercent()): RecVariant {
  if (!userKey) return rolloutPercent >= 50 ? "v2" : "v1";
  return hashToBucket(userKey) < rolloutPercent ? "v2" : "v1";
}
