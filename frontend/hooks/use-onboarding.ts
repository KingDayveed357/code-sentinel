// // hooks/use-onboarding.ts
// import { useState, useEffect, useCallback } from "react";
// import { useRouter } from "next/navigation";
// import { onboardingApi } from "@/lib/api/onboarding";
// import { useAuth } from "./old-use-auth";

// interface OnboardingStatus {
//   currentStep: number;
//   totalSteps: number;
//   completedSteps: string[];
//   preferences: {
//     autoScan: boolean;
//     pullRequests: boolean;
//     slackNotifications: boolean;
//     weeklyReports: boolean;
//   };
//   githubConnected: boolean;
//   selectedPlan: string;
// }

// interface UseOnboardingReturn {
//   status: OnboardingStatus | null;
//   loading: boolean;
//   error: string | null;
//   saveStep: (step: string, stepData?: Record<string, any>) => Promise<void>;
//   updatePreferences: (preferences: Partial<OnboardingStatus["preferences"]>) => Promise<void>;
//   completeOnboarding: () => Promise<void>;
//   canAccessStep: (step: string) => boolean;
//   refreshStatus: () => Promise<void>;
// }

// const STEP_ORDER = ["welcome", "connect", "preferences", "pricing", "payment"];

// export function useOnboarding(): UseOnboardingReturn {
//   const router = useRouter();
//   const { refreshUser } = useAuth();
  
//   const [status, setStatus] = useState<OnboardingStatus | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   // Fetch onboarding status
//   const refreshStatus = useCallback(async () => {
//     try {
//       setLoading(true);
//       setError(null);
      
//       const response = await onboardingApi.getStatus() as any;
//       setStatus(response.status);
//     } catch (err) {
//       console.error("Failed to fetch onboarding status:", err);
//       setError(err instanceof Error ? err.message : "Failed to load onboarding status");
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   // Initial load
//   useEffect(() => {
//     refreshStatus();
//   }, [refreshStatus]);

//   // Save onboarding step
//   const saveStep = useCallback(
//     async (step: string, stepData?: Record<string, any>) => {
//       try {
//         setError(null);
        
//         const response = await onboardingApi.saveStep(step, stepData) as any;
        
//         // Update status with response
//         if (response.status) {
//           setStatus(response.status);
//         } else {
//           // Fallback: refresh status
//           await refreshStatus();
//         }
//       } catch (err) {
//         console.error(`Failed to save step ${step}:`, err);
//         setError(err instanceof Error ? err.message : `Failed to save step ${step}`);
//         throw err;
//       }
//     },
//     [refreshStatus]
//   );

//   // Update preferences
//   const updatePreferences = useCallback(
//     async (preferences: Partial<OnboardingStatus["preferences"]>) => {
//       try {
//         setError(null);
        
//         const response = await onboardingApi.updatePreferences(preferences) as any;
        
//         if (response.status) {
//           setStatus(response.status);
//         } else {
//           await refreshStatus();
//         }
//       } catch (err) {
//         console.error("Failed to update preferences:", err);
//         setError(err instanceof Error ? err.message : "Failed to update preferences");
//         throw err;
//       }
//     },
//     [refreshStatus]
//   );

//   // Complete onboarding
//   const completeOnboarding = useCallback(async () => {
//     try {
//       setError(null);
      
//       await onboardingApi.complete();
      
//       // Refresh user profile to update onboarding_completed flag
//       await refreshUser();
      
//       // Redirect to dashboard
//       router.push("/dashboard");
//     } catch (err) {
//       console.error("Failed to complete onboarding:", err);
//       setError(err instanceof Error ? err.message : "Failed to complete onboarding");
//       throw err;
//     }
//   }, [refreshUser, router]);

//   // Check if user can access a specific step
//   const canAccessStep = useCallback(
//     (step: string): boolean => {
//       if (!status) return false;
      
//       const stepIndex = STEP_ORDER.indexOf(step);
//       const currentIndex = Math.max(0, status.currentStep - 1);
      
//       // Can access current step or any previous step
//       return stepIndex <= currentIndex + 1;
//     },
//     [status]
//   );

//   return {
//     status,
//     loading,
//     error,
//     saveStep,
//     updatePreferences,
//     completeOnboarding,
//     canAccessStep,
//     refreshStatus,
//   };
// }