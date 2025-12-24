// src/modules/onboarding/state-machine.ts

export type OnboardingState = {
  workspace_created: boolean;
  github_connected: boolean;
  repos_imported: boolean;
  completed_at: string | null;
};

export const ONBOARDING_STEPS = {
  WELCOME: { id: 'welcome', requires: [] },
  CONNECT_GITHUB: { id: 'connect_github', requires: ['workspace_created'] },
  IMPORT_REPOS: { id: 'import_repos', requires: ['workspace_created', 'github_connected'] },
} as const;

export function canAccessStep(
  step: keyof typeof ONBOARDING_STEPS,
  state: OnboardingState
): boolean {
  const requirements = ONBOARDING_STEPS[step].requires;
  return requirements.every(req => state[req as keyof OnboardingState] === true);
}