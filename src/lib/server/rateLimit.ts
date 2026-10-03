// src/lib/server/rateLimit.ts
//
// 공개 API 주소(누구나 부를 수 있는 /api/...)에 붙이는 간단한 호출 제한.
// 외부에서 반복 호출해 카카오·공공데이터·AI 같은 유료/한도 있는 외부 API를 소진시키거나
// 서버 비용을 늘리는 것을 막습니다.
//
// ⚠ 서버 메모리 기반이라 서버 인스턴스가 여러 개면 인스턴스마다 따로 셉니다(보수적인 상한).
// 사용자가 많아져 정확한 전역 제한이 필요해지면 Upstash Redis 같은 공용 저장소로 바꾸면 됩니다.
import type { NextRequest } from "next/server";

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

/** windowMs 동안 key당 max회까지 허용하는 제한기를 만듭니다. 허용되면 true. */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return function allow(key: string): boolean {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    // 오래된 기록이 계속 쌓이지 않도록 가끔 정리합니다.
    if (hits.size > 5000) {
      for (const [k, l] of hits) if (l.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}
