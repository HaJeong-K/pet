"use client";
import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext<{ session: any; profile: any; isAdmin: boolean }>({
  session: null, profile: null, isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from("users").select("*").eq("auth_user_id", uid).single();
    setProfile(data);
    setIsAdmin(!!data?.is_admin);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      // 콜백 안에서 바로 supabase를 부르면 인증 잠금과 엉킬 수 있어 한 박자 뒤로 미룹니다.
      if (session?.user) { const uid = session.user.id; setTimeout(() => loadProfile(uid), 0); }
      else { setProfile(null); setIsAdmin(false); }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);