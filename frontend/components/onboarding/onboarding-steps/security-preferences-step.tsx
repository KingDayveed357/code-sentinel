// components/onboarding/onboarding-steps/security-preferences-step.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SecurityPreferencesStepProps {
  onNext: () => void;
  onPrevious: () => void;
  initialPreferences?: {
    autoScan: boolean;
    pullRequests: boolean;
    slackNotifications: boolean;
    weeklyReports: boolean;
  };
  updatePreferences: (
    preferences: Partial<{
      autoScan: boolean;
      pullRequests: boolean;
      slackNotifications: boolean;
      weeklyReports: boolean;
    }>
  ) => Promise<void>;
}

export function SecurityPreferencesStep({
  onNext,
  onPrevious,
  initialPreferences,
  updatePreferences,
}: SecurityPreferencesStepProps) {
  const [preferences, setPreferences] = useState({
    autoScan: true,
    pullRequests: true,
    slackNotifications: false,
    weeklyReports: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPreferences) {
      setPreferences(initialPreferences);
    }
  }, [initialPreferences]);

  const handleToggle = (key: keyof typeof preferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleContinue = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await updatePreferences(preferences);
      onNext();
    } catch (err) {
      console.error("Failed to save preferences:", err);
      setError(err instanceof Error ? err.message : "Failed to save preferences");
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Security Preferences</h2>
        <p className="text-muted-foreground">Configure how Code Sentinel works with your repositories</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div
          className="flex items-start gap-4 p-4 border border-border rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer"
          onClick={() => handleToggle("autoScan")}
        >
          <Checkbox checked={preferences.autoScan} className="mt-1" />
          <div className="space-y-1 flex-1">
            <p className="font-medium">Automatic Scans</p>
            <p className="text-sm text-muted-foreground">Scan repositories automatically when new code is pushed</p>
          </div>
        </div>

        <div
          className="flex items-start gap-4 p-4 border border-border rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer"
          onClick={() => handleToggle("pullRequests")}
        >
          <Checkbox checked={preferences.pullRequests} className="mt-1" />
          <div className="space-y-1 flex-1">
            <p className="font-medium">Pull Request Reviews</p>
            <p className="text-sm text-muted-foreground">Add security comments to pull requests with suggestions</p>
          </div>
        </div>

        <div
          className="flex items-start gap-4 p-4 border border-border rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer"
          onClick={() => handleToggle("slackNotifications")}
        >
          <Checkbox checked={preferences.slackNotifications} className="mt-1" />
          <div className="space-y-1 flex-1">
            <p className="font-medium">Slack Notifications</p>
            <p className="text-sm text-muted-foreground">Receive alerts in Slack when vulnerabilities are found</p>
          </div>
        </div>

        <div
          className="flex items-start gap-4 p-4 border border-border rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer"
          onClick={() => handleToggle("weeklyReports")}
        >
          <Checkbox checked={preferences.weeklyReports} className="mt-1" />
          <div className="space-y-1 flex-1">
            <p className="font-medium">Weekly Security Reports</p>
            <p className="text-sm text-muted-foreground">Get weekly email summaries of security findings</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          onClick={onPrevious}
          variant="outline"
          size="lg"
          className="rounded-lg bg-transparent"
          disabled={isSaving}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleContinue} size="lg" className="rounded-lg flex-1" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}