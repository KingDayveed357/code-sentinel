// hooks/use-auth.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { supabase, getCurrentSession } from "@/lib/supabase-client";
import { authApi } from "@/lib/api/auth";
import type { User, Session } from "@supabase/supabase-js";

type AuthUser = User & {
  plan?: string;
  onboarding_completed?: boolean;
  full_name?: string;
  role?: string;
  avatar_url?: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  profileLoading: boolean;
  githubSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isOnboardingComplete: boolean;
  userPlan: string;
  canAccessTeam: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const isNavigatingRef = useRef(false);
  const profileFetchTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Fetch profile from backend
  const fetchUserProfile = useCallback(async (accessToken?: string) => {
    try {
      const resp = await authApi.me();
      const maybeUser = (resp as any)?.user;
      if (!maybeUser) return null;
      return maybeUser as AuthUser;
    } catch (err) {
      console.error("fetchUserProfile error:", err);
      return null;
    }
  }, []);

  // Refresh user public method
  const refreshUser = useCallback(async () => {
    const curr = await getCurrentSession();
    if (!curr?.access_token) return;
    const profile = await fetchUserProfile(curr.access_token);
    if (!profile) return;
    setUser((prev) => {
      if (
        prev?.id === profile.id &&
        prev?.onboarding_completed === profile.onboarding_completed &&
        prev?.plan === profile.plan
      ) {
        return prev; 
      }
      return profile;
    });
  }, [fetchUserProfile]);

  // GitHub OAuth Sign In
  const githubSignIn = useCallback(async () => {
    try {
      isNavigatingRef.current = true;
      const { url } = await authApi.githubOAuth();
      // Full redirect required for OAuth flows
      window.location.href = url;
    } catch (err) {
      console.error("GitHub OAuth error:", err);
      isNavigatingRef.current = false;
      throw err;
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      isNavigatingRef.current = true;
      setUser(null);
      setSession(null);
      await supabase.auth.signOut();
      router.replace("/");
    } catch (err) {
      console.error("logout error:", err);
      router.replace("/");
    } finally {
      isNavigatingRef.current = false;
    }
  }, [router]);

  // Init + listener
  useEffect(() => {
    mountedRef.current = true;
    let unsub: (() => void) | null = null;

    async function init() {
      setLoading(true);
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        setSession(currentSession ?? null);

        if (currentSession?.access_token) {
          setProfileLoading(true);
          const profile = await fetchUserProfile(currentSession.access_token);
          if (!mountedRef.current) return;
          if (profile) setUser(profile);
          setProfileLoading(false);
        } else {
          setUser(null);
          setProfileLoading(false);
        }
      } catch (err) {
        console.error("auth init error:", err);
        setUser(null);
        setSession(null);
        setProfileLoading(false);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    init();

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Ignore initial session
      if (event === "INITIAL_SESSION") return;

      // Ignore changes during programmatic navigation
      if (isNavigatingRef.current) return;

      setSession(newSession ?? null);

      if (newSession?.access_token) {
        // Clear any pending timer
        if (profileFetchTimerRef.current) {
          window.clearTimeout(profileFetchTimerRef.current);
          profileFetchTimerRef.current = null;
        }

        // Debounce for SIGNED_IN event (OAuth returns)
        if (event === "SIGNED_IN") {
          profileFetchTimerRef.current = window.setTimeout(async () => {
            setProfileLoading(true);
            const profile = await fetchUserProfile(newSession.access_token);
            if (!mountedRef.current) return;

            if (profile) {
              setUser(profile);
            }
            setProfileLoading(false);
          }, 300);
        } else {
          // Immediate fetch for TOKEN_REFRESHED, USER_UPDATED, etc.
          setProfileLoading(true);
          fetchUserProfile(newSession.access_token)
            .then((profile) => {
              if (!mountedRef.current) return;
              if (profile) setUser(profile);
            })
            .finally(() => {
              if (mountedRef.current) setProfileLoading(false);
            });
        }
      } else {
        // Signed out
        setUser(null);
        setProfileLoading(false);
      }
    });

    unsub = () => {
      (data?.subscription as any)?.unsubscribe?.();
      if (profileFetchTimerRef.current) {
        window.clearTimeout(profileFetchTimerRef.current);
        profileFetchTimerRef.current = null;
      }
    };

    return () => {
      mountedRef.current = false;
      unsub?.();
    };
  }, [fetchUserProfile]);

  const isOnboardingComplete = useMemo(
    () => !!user?.onboarding_completed,
    [user?.onboarding_completed]
  );
  const userPlan = useMemo(() => user?.plan || "Free", [user?.plan]);
  const canAccessTeam = useMemo(
    () => ["Team", "Enterprise"].includes(userPlan),
    [userPlan]
  );

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      profileLoading,
      githubSignIn,
      logout,
      refreshUser,
      isOnboardingComplete,
      userPlan,
      canAccessTeam,
    }),
    [
      user,
      session,
      loading,
      profileLoading,
      githubSignIn,
      logout,
      refreshUser,
      isOnboardingComplete,
      userPlan,
      canAccessTeam,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};