"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import OwnerSignupForm from "@/components/OwnerSignupForm";

// 새로고침/직접 URL 접근 시(모달 인터셉트가 적용 안 될 때) 보여줄 standalone 페이지.
function Content() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <OwnerSignupForm redirect={redirect} />
    </div>
  );
}

export default function SignupOwnerPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
