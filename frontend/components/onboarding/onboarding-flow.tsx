// components/onboarding/onboarding-flow.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WelcomeStep } from "./onboarding-steps/welcome-step";
import { ImportReposStep } from "./onboarding-steps/import-repos-step";
import ProgressIndicator from "./progress-indicator";
import { useAuth } from "@/hooks/use-auth";
import { onboardingApi } from "@/lib/api/onboarding";
import { Loader2 } from "lucide-react";

type Step = "welcome" | "import-repos";

const STEP_ORDER: Step[] = ["welcome", "import-repos"];

export default function OnboardingFlow() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(currentStep);

  const handleNext = () => {
    if (stepIndex < STEP_ORDER.length - 1) {
      const nextStep = STEP_ORDER[stepIndex + 1];
      setIsTransitioning(true);
      setCurrentStep(nextStep);
      setTimeout(() => setIsTransitioning(false), 300);
    }
  };

  const handlePrevious = () => {
    if (stepIndex > 0) {
      const prevStep = STEP_ORDER[stepIndex - 1];
      setIsTransitioning(true);
      setCurrentStep(prevStep);
      setTimeout(() => setIsTransitioning(false), 300);
    }
  };

  const handleComplete = async () => {
    try {
      // Mark onboarding as complete
      await onboardingApi.complete();

      // Refresh user profile
      await refreshUser();

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      alert("Failed to complete onboarding. Please try again.");
    }
  };

  const handleSkip = async () => {
    // Skip repo import and go to dashboard
    await handleComplete();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 transition-colors">
      <main className="pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProgressIndicator
            currentStep={stepIndex}
            totalSteps={STEP_ORDER.length}
          />

          <div
            className={`mt-8 ${
              isTransitioning ? "opacity-50" : "opacity-100"
            } transition-opacity`}
          >
            {currentStep === "welcome" && <WelcomeStep onNext={handleNext} />}

            {currentStep === "import-repos" && (
              <ImportReposStep
                onNext={handleComplete}
                onSkip={handleSkip}
                onPrevious={handlePrevious}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
