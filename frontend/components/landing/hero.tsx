"use client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, Github, GitBranch, Sparkles, ArrowRight} from "lucide-react"
import Link from "next/link"
import { HeroCTAButton} from "../auth/cta-github-button"
import { useAuthButton } from "@/hooks/use-auth-button";

export function Hero() {
  const { label, action, loading, showGithubIcon } = useAuthButton();

  return (
    <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-background to-muted/20">
      <div className="container px-4 py-16 sm:py-24 md:py-32 lg:py-40">
        <div className="mx-auto max-w-4xl text-center">
          {/* <Badge variant="secondary" className="mb-4 sm:mb-6 px-3 sm:px-4 py-1.5 text-xs sm:text-sm">
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            AI-Powered Security Analysis
          </Badge> */}
           <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4 backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            v2.0 is now live: AI-Powered Auto-Fix
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4 sm:mb-6 text-balance leading-tight">
            AI Security Scans for <span className="text-gradient">Your Code</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8 lg:mb-12 leading-relaxed">
            Find vulnerabilities instantly. Get fix suggestions in plain English. Protect your repositories with
            AI-powered security audits.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-12">
            {/* Start Free Button */}
            {/* <Button size="lg" className=" xs:w-auto" asChild>
              <Link href="/register">
                <Github className="mr-2 h-5 w-5" />
                Start for free  <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button> */}
             {/* <Button size="lg" className=" xs:w-auto" asChild>
              <Link href="/register">
                <Github className="mr-2 h-5 w-5" />
                Continue with Github  <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button> */}
            <HeroCTAButton size="lg" className="w-full sm:w-auto" />
            {/* <Button size="lg" onClick={action} disabled={loading}>
      {loading ? (
        <div className="animate-pulse w-32 h-4 bg-gray-300 rounded" />
      ) : (
        <>
          {showGithubIcon && <Github className="mr-2 h-4 w-4" />}
          {label}
        </>
      )}
    </Button> */}
            <Button
              size="lg"
              variant="outline"
              className=" xs:w-auto bg-transparent"
              disabled
              title="Coming soon"
            >
              <GitBranch className="mr-2 h-5 w-5" />
              GitLab Support
              <Badge variant="secondary" className="ml-2 text-xs">
                Coming Soon
              </Badge>
            </Button>
            <Button size="lg" variant="ghost" className=" xs:w-auto" asChild>
              <Link href="#demo">Request Demo</Link>
            </Button>
          </div>

          {/* Trust Badges - responsive grid */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span>Enterprise Security</span>
            </div>
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-primary" />
              <span>GitHub Verified</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>AI-Powered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 blur-3xl opacity-20">
          <div className="aspect-square w-[400px] sm:w-[600px] md:w-[800px] bg-gradient-to-r from-primary to-accent rounded-full" />
        </div>
      </div>
    </section>
  )
}
