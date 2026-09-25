"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReporting";

// 루트 레이아웃 자체가 던지는 오류까지 잡는 최상위 경계 — 이 경우 layout.tsx가
// 통째로 대체되므로 <html>/<body>를 직접 그립니다.
export default function GlobalError({
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
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 14,
            fontFamily: "'Noto Sans KR', sans-serif", textAlign: "center", padding: 24,
          }}
        >
          <div style={{ fontSize: 40 }}>🐾</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#222" }}>
            서비스에 문제가 발생했어요
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
      </body>
    </html>
  );
}
