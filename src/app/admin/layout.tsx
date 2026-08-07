"use client";

import { AdminAuthProvider, useAdminAuth } from "@/lib/AdminAuthContext";

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isChecking, isAuth } = useAdminAuth();

  if (isChecking) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F3E8" }}>
        <span className="ggk-body" style={{ fontSize: 13, color: "#888" }}>권한 확인 중...</span>
      </div>
    );
  }

  if (!isAuth) return null;

  return <>{children}</>;
}

// /admin 하위 모든 페이지가 공유하는 레이아웃 — 인증 체크를 여기 한 곳으로 모아서
// 탭 이동마다 "권한 확인 중..."이 반복해서 뜨는 문제를 없앴습니다.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminGate>{children}</AdminGate>
    </AdminAuthProvider>
  );
}
