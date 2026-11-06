"use client";

import LogoLoader from "@/components/LogoLoader";
import { AdminFrame } from "@/components/AdminNav";
import { AdminAuthProvider, useAdminAuth } from "@/lib/AdminAuthContext";

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isChecking, isAuth } = useAdminAuth();

  if (isChecking) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F3F2" }}>
        <LogoLoader size={56} label="권한 확인 중…" />
      </div>
    );
  }

  if (!isAuth) return null;

  return <>{children}</>;
}

// /admin 하위 모든 페이지가 공유하는 레이아웃 — 인증 체크를 여기 한 곳으로 모아서
// 탭 이동마다 "권한 확인 중..."이 반복해서 뜨는 문제를 없앴습니다.
// 화면 틀(위 막대·왼쪽 메뉴·제목·폭)도 여기서 한 번만 그려 사장님 센터·마이페이지와 똑같이 맞춥니다.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminGate><AdminFrame>{children}</AdminFrame></AdminGate>
    </AdminAuthProvider>
  );
}
