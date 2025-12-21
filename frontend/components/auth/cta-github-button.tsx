"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Github, Loader2, ArrowRight } from "lucide-react";
import { useAuthButton } from "@/hooks/use-auth-button";

interface HeroCTAButtonProps {
  size?: "sm" | "default" | "lg";
  className?: string;
  variant?: "default" | "outline" | "secondary";
  showIcon?: boolean;
}

export function HeroCTAButton({
  size = "lg",
  className = "",
  variant = "default",
  showIcon = true,
}: HeroCTAButtonProps) {
  const { label, action, loading, showGithubIcon } = useAuthButton();
  const [isExecuting, setIsExecuting] = useState(false);

  const handleClick = async () => {
    setIsExecuting(true);
    try {
      await action();
    } catch (error) {
      console.error("Action failed:", error);
    } finally {
      // Reset after a short delay to handle redirects
      setTimeout(() => setIsExecuting(false), 1000);
    }
  };

  const isLoading = loading || isExecuting;

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading...
        </>
      ) : (
        <>
          {showIcon && showGithubIcon && <Github className="mr-2 h-5 w-5" />}
          {showIcon && !showGithubIcon && <ArrowRight className="mr-2 h-5 w-5" />}
          {label}
        </>
      )}
    </Button>
  );
}