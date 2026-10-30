"use client";
// src/components/OwnerBadge.tsx
//
// 닉네임 옆 "가게명 사장님" 배지 — 인증된 사장님 계정에만 붙고, 누르면 그 가게 화면으로 갑니다.
// 닉네임은 자유롭게 정하고, 사장님인지는 이 배지로 보여 줍니다(닉네임에 '사장님'은 못 넣게 막아 사칭 불가).
// 화면에 배지가 여러 개여도 한 번에 묻습니다(/api/owner-badges). 받은 회원은 탭이 열려 있는 동안 다시 묻지 않습니다.

import { useEffect, useState } from "react";

type Owner = { name: string; placeId: number | null };
const known = new Map<string, Owner | null>();
const queue = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const ids = [...queue];
  queue.clear();
  if (ids.length === 0) return;
  fetch(`/api/owner-badges?ids=${ids.join(",")}`)
    .then((r) => (r.ok ? r.json() : { owners: {} }))
    .then((d: { owners?: Record<string, Owner> }) => { for (const id of ids) known.set(id, d.owners?.[id] ?? null); })
    .catch(() => { for (const id of ids) known.set(id, null); })
    .finally(() => listeners.forEach((fn) => fn()));
}

function request(id: string) {
  if (known.has(id) || queue.has(id)) return;
  queue.add(id);
  if (!timer) timer = setTimeout(flush, 30);
}

export default function OwnerBadge({ userId }: { userId: string | null | undefined }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const update = () => setTick((n) => n + 1);
    listeners.add(update);
    request(userId);
    return () => { listeners.delete(update); };
  }, [userId]);
  const owner = userId ? known.get(userId) : null;
  if (!owner) return null;
  const style: React.CSSProperties = {
    flexShrink: 1, minWidth: 0, maxWidth: 170, display: "inline-block", padding: "2px 7px", borderRadius: 7, background: "#EAF0E3", color: "#2F3B28",
    fontSize: 11, fontWeight: 800, lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none", verticalAlign: "middle",
  };
  const label = `${owner.name} 사장님`;
  if (owner.placeId == null) return <span title={label} style={style}>{label}</span>;
  return <a href={`/place/${owner.placeId}`} title={label} onClick={(e) => e.stopPropagation()} style={style}>{label}</a>;
}
