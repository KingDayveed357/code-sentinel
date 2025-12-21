"use client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Github, GitBranch, Sparkles, Shield } from "lucide-react"
import Link from "next/link"
import { useAuthButton } from "@/hooks/use-auth-button"

export function CtaSection() {
  const { label, action, loading, showGithubIcon } = useAuthButton();
  return (
    <section className="border-t border-border/40 py-16 md:py-24 bg-gradient-to-b from-background to-muted/20">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-balance">Ready to secure your future?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            CodeSentinel uses advanced AI to find vulnerabilities instantly. Get fix suggestions in plain English and
            protect your repositories with enterprise-grade security.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            {/* <Button size="lg" className="flex items-center gap-2" asChild>
              <Link href="/register">
                <Github className="h-5 w-5" />
                Connect GitHub
              </Link>
            </Button> */}
            
            <Button size="lg" onClick={action} disabled={loading}>
      {loading ? (
        <div className="animate-pulse w-32 h-4 bg-gray-300 rounded" />
      ) : (
        <>
          {showGithubIcon && <Github className="mr-2 h-4 w-4" />}
          {label}
        </>
      )}
    </Button>

            <Button size="lg" variant="outline" disabled className="flex items-center gap-2 bg-transparent">
              <GitBranch className="h-5 w-5" />
              Connect GitLab
              <Badge variant="secondary" className="ml-2">
                Coming Soon
              </Badge>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link href="#pricing">Request Demo</Link>
            </Button>
          </div>

          {/* Trust Signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-medium">GitHub Verified</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">AI-Powered</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-medium">Enterprise Security</span>
            </div>
          </div>
        </div>


      </div>
    </section>
  )
}
