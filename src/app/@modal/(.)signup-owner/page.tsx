"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OwnerSignupForm from "@/components/OwnerSignupForm";

function Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, boxSizing: "border-box",
      }}
    >
      <div style={{
        position: "relative", width: "100%", maxWidth: 640, background: "white",
        borderRadius: 24, padding: 28, boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
      }}>
        <button
          onClick={() => router.back()}
          style={{
            position: "absolute", top: 18, right: 18, width: 36, height: 36, borderRadius: "50%",
            border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: 16, fontWeight: 700, zIndex: 1,
          }}
        >
          ✕
        </button>
        <OwnerSignupForm redirect={redirect} />
      </div>
    </div>
  );
}

export default function SignupOwnerModal() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
