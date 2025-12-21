"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Shield, Zap, Users } from "lucide-react"

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-8 animate-in fade-in duration-500">
      <div className="space-y-4">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-lg bg-primary/10 border border-primary/20">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-balance">
          Secure Your Code with <span className="text-primary">AI-Powered Audits</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
          Code Sentinel automatically scans your GitHub and GitLab repositories, identifies vulnerabilities, and
          suggests AI-powered fixes—all in seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-12 max-w-3xl mx-auto">
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-accent/20 border border-accent/30">
            <Shield className="h-5 w-5 text-accent" />
          </div>
          <h3 className="font-semibold">Security</h3>
          <p className="text-sm text-muted-foreground">Detect vulnerabilities instantly</p>
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-accent/20 border border-accent/30">
            <Zap className="h-5 w-5 text-accent" />
          </div>
          <h3 className="font-semibold">Fast</h3>
          <p className="text-sm text-muted-foreground">Scans complete in seconds</p>
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-accent/20 border border-accent/30">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <h3 className="font-semibold">Collaboration</h3>
          <p className="text-sm text-muted-foreground">Team security at scale</p>
        </div>
      </div>

      <Button onClick={onNext} size="lg" className="rounded-lg">
        Get Started
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}
