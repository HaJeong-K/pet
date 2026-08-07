"use client";

// src/lib/AdminAuthContext.tsx
//
// ⚠ 최적화: 예전엔 /admin, /admin/reports, /admin/tips, /admin/owners, /admin/analytics
// 5개 페이지가 각자 자기 컴포넌트 안에서 "세션 확인 → users.is_admin 조회" 인증 체크를
// 독립적으로 실행했습니다. Next.js App Router에서 형제 페이지 간 이동은 각 page.tsx를
// 통째로 새로 마운트하기 때문에, 관리자 탭을 하나 클릭할 때마다 이 인증 체크가 처음부터
// 다시 실행되어 "권한 확인 중..." 문구가 매번 다시 뜨고 실제 화면 전환이 늦어졌습니다.
//
// src/app/admin/layout.tsx가 /admin 하위 모든 페이지를 감싸는 공용 레이아웃이라, 그
// 안에서 이 컨텍스트로 인증 체크를 "레이아웃이 처음 마운트될 때 딱 한 번만" 실행하고
// 결과(isAuth)를 하위 페이지들이 공유해서 쓰도록 바꿨습니다. 레이아웃은 /admin/* 사이를
// 탭으로 이동할 때 리마운트되지 않으므로, 이후 탭 이동은 이미 확인된 권한을 그대로
// 재사용해 즉시 전환됩니다.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AdminAuthState = {
  isChecking: boolean;
  isAuth: boolean;
};

const AdminAuthContext = createContext<AdminAuthState>({ isChecking: true, isAuth: false });

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuth, setIsAuth] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsChecking(false); router.push("/login?redirect=/admin"); return; }
      const { data: profile } = await supabase
        .from("users").select("is_admin").eq("auth_user_id", session.user.id).single();
      if (!profile?.is_admin) { setIsChecking(false); router.push("/"); return; }
      setIsAuth(true);
      setIsChecking(false);
    };
    checkAdmin();
  }, [router]);

  return (
    <AdminAuthContext.Provider value={{ isChecking, isAuth }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
