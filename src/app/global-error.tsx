"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReporting";
import { reloadIfStaleDeploy } from "@/lib/staleDeploy";
import ErrorScreen from "@/components/ErrorScreen";

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
    if (reloadIfStaleDeploy(error)) return; // 배포 직후 예전 화면의 파일 누락 오류 → 자동 새로고침
    reportClientError(error.message, error.stack, "react-error-boundary");
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <ErrorScreen title="서비스에 문제가 발생했어요" onRetry={reset} />
      </body>
    </html>
  );
}
