import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OWNER_ADMIN_EMAILS = ["g.traquino66@gmail.com", "giltraquino@gmail.com"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function checkAdmin(userId: string, email?: string | null) {
    if (email && OWNER_ADMIN_EMAILS.includes(email.toLowerCase().trim())) {
      setIsAdmin(true);
      return;
    }

    try {
      // 1. Check via RPC
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      if (!error && data === true) {
        setIsAdmin(true);
        return;
      }

      // 2. Fallback: direct select on user_roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin");

      if (roles && roles.length > 0) {
        setIsAdmin(true);
        return;
      }

      // 3. Fallback: check JWT app_metadata for authenticated admin claim
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (
        authUser?.app_metadata?.role === "admin" ||
        authUser?.app_metadata?.claims_admin === true ||
        (authUser?.email && OWNER_ADMIN_EMAILS.includes(authUser.email.toLowerCase().trim()))
      ) {
        setIsAdmin(true);
        return;
      }

      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const userEmail = session.user.email?.toLowerCase().trim();
          if (
            session.user.app_metadata?.role === "admin" ||
            session.user.app_metadata?.claims_admin === true ||
            (userEmail && OWNER_ADMIN_EMAILS.includes(userEmail))
          ) {
            setIsAdmin(true);
          }
          await checkAdmin(session.user.id, session.user.email);
          setLoading(false);
        } else {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const userEmail = session.user.email?.toLowerCase().trim();
        if (
          session.user.app_metadata?.role === "admin" ||
          session.user.app_metadata?.claims_admin === true ||
          (userEmail && OWNER_ADMIN_EMAILS.includes(userEmail))
        ) {
          setIsAdmin(true);
        }
        await checkAdmin(session.user.id, session.user.email);
        setLoading(false);
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
