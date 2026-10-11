"use client";
// src/lib/useMemberLevels.ts
//
// 닉네임 옆 레벨 배지용: 화면에 나온 글쓴이들의 레벨을 한 번에 받아 옵니다(/api/member-levels).
// 한 번 받은 회원은 이 탭이 열려 있는 동안 다시 묻지 않습니다. 레벨 기록이 없는 회원은 결과에 없습니다(배지 없음).
import { useEffect, useMemo, useState } from "react";

const known = new Map<string, number | null>(); // null = 물어봤지만 기록 없음
const waiting = new Map<string, Promise<void>>();

async function load(ids: string[]): Promise<void> {
  const need = ids.filter((id) => !known.has(id) && !waiting.has(id));
  if (need.length === 0) { await Promise.all(ids.map((id) => waiting.get(id)).filter(Boolean)); return; }
  const request = fetch(`/api/member-levels?ids=${need.join(",")}`)
    .then((r) => (r.ok ? r.json() : { levels: {} }))
    .then((data: { levels?: Record<string, number> }) => { for (const id of need) known.set(id, data.levels?.[id] ?? null); })
    .catch(() => { /* 못 받으면 배지 없이 둡니다 — 다음에 다시 시도 */ })
    .finally(() => { for (const id of need) waiting.delete(id); });
  for (const id of need) waiting.set(id, request);
  await request;
}

/** 회원 번호(auth_user_id) 목록 → { 회원 번호: 레벨 }. 아직 못 받은 회원은 결과에 없습니다. */
export function useMemberLevels(authUserIds: (string | null | undefined)[]): Record<string, number> {
  const key = useMemo(() => [...new Set(authUserIds.filter((id): id is string => !!id))].sort().join(","), [authUserIds]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    load(key.split(",")).then(() => { if (!cancelled) setTick((n) => n + 1); });
    return () => { cancelled = true; };
  }, [key]);
  const out: Record<string, number> = {};
  if (key) for (const id of key.split(",")) { const level = known.get(id); if (level != null) out[id] = level; }
  return out;
}
