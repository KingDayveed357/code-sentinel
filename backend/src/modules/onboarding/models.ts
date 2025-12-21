// src/modules/onboarding/models.ts
export interface OnboardingStep {
    step: string;
    completed: boolean;
    data?: Record<string, any>;
}

export interface OnboardingStatus {
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    preferences: {
        autoScan: boolean;
        pullRequests: boolean;
        slackNotifications: boolean;
        weeklyReports: boolean;
    };
    githubConnected: boolean;
    selectedPlan: string;
}

export const ONBOARDING_STEPS = [
    "welcome",
    "connect",
    "preferences",
    "pricing",
    "payment",
] as const;

export type OnboardingStepName = typeof ONBOARDING_STEPS[number];