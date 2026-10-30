"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OwnerSignupForm from "@/components/OwnerSignupForm";
import OwnerUpgradeForm from "@/components/OwnerUpgradeForm";
import OwnerJoinFrame from "@/components/owner/OwnerJoinFrame";
import LogoLoader from "@/components/LogoLoader";
import { supabase } from "@/lib/supabase";
import type { OwnerKind } from "@/lib/ownerKind";

// 사장님 가입·전환 페이지(/signup-owner?kind=lodging&redirect=/owner)
//   · 로그인 전: 새 사장님 계정 가입(OwnerSignupForm)
//   · 로그인 후: 지금 계정을 사장님으로 전환(OwnerUpgradeForm) — 이미 인증·심사 중이면 사장님 센터로
//   · kind=lodging이면 "숙소"를 미리 골라 둡니다(숙소 입점 안내의 "입점 신청하기")
// 예전엔 가입은 작은 창, 전환은 지도 위 작은 창으로 따로 떴습니다 — 지금은 이 한 페이지에서 같은 모양(OwnerJoinFrame)으로 합니다.
function Content() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/owner";
  const kind: OwnerKind = params.get("kind") === "lodging" ? "lodging" : "store";
  const [state, setState] = useState<{ userId: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancelled) setState({ userId: null }); return; }
      const { data } = await supabase.from("users").select("owner_status").eq("auth_user_id", session.user.id).maybeSingle<{ owner_status: string | null }>();
      if (cancelled) return;
      // 이미 사장님(인증·심사 중)이면 사장님 센터로
      if (data?.owner_status === "verified" || data?.owner_status === "pending") { router.replace("/owner"); return; }
      setState({ userId: session.user.id });
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!state) return <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F3E8" }}><LogoLoader /></div>;
  return (
    <OwnerJoinFrame kind={kind} mode={state.userId ? "upgrade" : "signup"}>
      {state.userId
        ? <OwnerUpgradeForm userId={state.userId} initialKind={kind} framed onDone={() => { window.location.href = redirect; }} />
        : (
          <>
            <OwnerSignupForm redirect={redirect} initialKind={kind} framed />
            {/* 일반 회원 가입으로 — 회원가입 화면의 "사장님으로 가입하기" 버튼과 같은 모양 */}
            <button
              type="button"
              onClick={() => router.push("/signup")}
              style={{ width: "100%", padding: "12px", borderRadius: 14, border: "1px solid var(--join-soft-line)", background: "var(--join-soft)", color: "var(--join-soft-ink)", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 10, fontFamily: "inherit" }}
            >
              일반 회원이신가요? 일반 회원으로 가입하기
            </button>
          </>
        )}
    </OwnerJoinFrame>
  );
}

export default function SignupOwnerPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
