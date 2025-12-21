"use client"

import { useState, useEffect } from "react"
import OnboardingFlow from "@/components/onboarding/onboarding-flow"
import { RequireOnboardingIncomplete } from "@/components/guards/require-onboarding-incomplete"

export default function Onboarding() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )


  return (
      <RequireOnboardingIncomplete>
      <OnboardingFlow />
    </RequireOnboardingIncomplete>
  )
}
