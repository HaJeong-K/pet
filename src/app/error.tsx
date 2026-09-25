"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReporting";

// App Router 라우트 세그먼트 오류 경계 — 렌더링 중 던져진 오류를 잡아 흰 화면
// 대신 재시도 버튼이 있는 화면을 보여주고, 동시에 /api/log-error로 보고합니다.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error.message, error.stack, "react-error-boundary");
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 14,
        fontFamily: "'Noto Sans KR', sans-serif", textAlign: "center", padding: 24,
      }}
    >
      <div style={{ fontSize: 40 }}>🐾</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#222" }}>
        일시적인 오류가 발생했어요
      </div>
      <div style={{ fontSize: 13, color: "#888" }}>
        잠시 후 다시 시도해주세요.
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 6, padding: "10px 20px", borderRadius: 10, border: "none",
          background: "#5C7A4A", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
