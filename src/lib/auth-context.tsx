import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, type Session, type User } from "@/integrations/postgres/client";
import { getMyProfileAndRoles } from "@/lib/auth.functions";

export type AppRole = "admin" | "teacher" | "parent" | "super_admin";

export interface AuthProfile {
  id: string;
  full_name: string;
  email: string;
  school_id: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  roles: AppRole[];
  isAuthenticated: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function loadProfileAndRoles(_userId: string) {
  try {
    const { profile, roles } = await getMyProfileAndRoles();
    return { profile: (profile as AuthProfile | null) ?? null, roles: roles as AppRole[] };
  } catch {
    return { profile: null, roles: [] as AppRole[] };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);
    if (data.session?.user) {
      const { profile: p, roles: r } = await loadProfileAndRoles(data.session.user.id);
      setProfile(p);
      setRoles(r);
    } else {
      setProfile(null);
      setRoles([]);
    }
  };

  useEffect(() => {
    let lastUserId: string | null = null;

    const { data: sub } = auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Only re-fetch profile/roles when the signed-in user actually changes;
        // token refreshes must not re-trigger the full-screen loading state.
        if (lastUserId === s.user.id) return;
        lastUserId = s.user.id;
        void loadProfileAndRoles(s.user.id).then(({ profile: p, roles: r }) => {
          setProfile(p);
          setRoles(r);
          setLoading(false);
        });
      } else {
        lastUserId = null;
        setProfile(null);
        setRoles([]);
        setLoading(false);
      }
    });

    void auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      setSession(data.session);
      setUser(u);
      if (u) {
        lastUserId = u.id;
        const { profile: p, roles: r } = await loadProfileAndRoles(u.id);
        setProfile(p);
        setRoles(r);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isAuthenticated: !!user,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
