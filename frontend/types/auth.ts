// frontend/types/auth.ts
export type UserRole = 'user' | 'team' | 'enterprise';
export type UserPlan = 'Free' | 'Dev' | 'Team' | 'Enterprise';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: UserPlan;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
    role?: UserRole;
  };
  app_metadata: {
    provider?: string;
    providers?: string[];
  };
}

export interface AuthState {
  user: AuthUser | null;
  profile: UserProfile | null;
  session: any | null;
  loading: boolean;
  role: UserRole;
}

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AuthContextValue extends AuthState {
  signIn: (data: SignInData) => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
  oauthSignIn: (provider: "google" | "github") => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}