// components/onboarding/onboarding-steps/success-step.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";

export function SuccessStep() {
  const router = useRouter();

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  return (
    <div className="text-center space-y-8 py-12 animate-in fade-in duration-500">
      <div className="flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl"></div>
          <CheckCircle2 className="h-24 w-24 text-primary relative animate-bounce" />
        </div>
      </div>

      <div className="space-y-4">
        <h1 className="text-4xl font-bold">Welcome to Code Sentinel!</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
          Your account is all set. You're now ready to start securing your code with AI-powered audits.
        </p>
      </div>

      <div className="space-y-4 bg-secondary/50 border border-border rounded-lg p-8 max-w-2xl mx-auto text-left">
        <h2 className="font-bold text-lg">What's Next?</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold flex-shrink-0">1</span>
            <span>Connect your first repository from GitHub or GitLab</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold flex-shrink-0">2</span>
            <span>Run your first security scan (takes about 30 seconds)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold flex-shrink-0">3</span>
            <span>Review findings and implement AI-suggested fixes</span>
          </li>
        </ul>
      </div>

      <Button onClick={handleGoToDashboard} size="lg" className="rounded-lg">
        Go to Dashboard
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}