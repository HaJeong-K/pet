"use client";
// src/components/MemberVisitPing.tsx
//
// 로그인한 회원이 들어온 날을 하루에 한 번 서버에 알립니다(회원 레벨의 "한 달 방문 일수"에 쓰입니다).
// 같은 날 다시 들어오면 이 기기에서는 다시 알리지 않습니다(서버도 하루에 한 줄만 기록합니다).
// 화면에는 아무것도 그리지 않습니다.
import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";

/** 한국 시간 기준 오늘(YYYY-MM-DD) */
const kstToday = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function MemberVisitPing() {
  const { session } = useAuth();
  const userId: string | undefined = session?.user?.id;
  const token: string | undefined = session?.access_token;

  useEffect(() => {
    if (!userId || !token) return;
    const storageKey = `ggk_visit_${userId}`;
    const today = kstToday();
    try { if (localStorage.getItem(storageKey) === today) return; } catch { /* 저장소를 못 쓰면 매번 알립니다(서버가 하루 한 줄로 막음) */ }
    // 첫 화면이 뜨는 것을 방해하지 않게 잠깐 뒤에 보냅니다.
    const timer = window.setTimeout(() => {
      fetch("/api/me/visit", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data?.ok) { try { localStorage.setItem(storageKey, today); } catch { /* 무시 */ } } })
        .catch(() => { /* 실패하면 다음에 들어올 때 다시 시도 */ });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [userId, token]);

  return null;
}
