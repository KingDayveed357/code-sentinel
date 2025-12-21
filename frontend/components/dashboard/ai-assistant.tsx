"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { MessageCircle, X, Sparkles, ChevronDown, ChevronUp } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

const presetPrompts = [
  {
    title: "Explain this vulnerability",
    description: "Get details about the selected vulnerability and its impact",
    category: "Education",
  },
  {
    title: "Which scan should I run next?",
    description: "Recommendations based on your repository and scan history",
    category: "Guidance",
  },
  {
    title: "Best practices for dependency management",
    description: "Learn security best practices for managing dependencies",
    category: "Best Practices",
  },
  {
    title: "How to fix critical vulnerabilities",
    description: "Step-by-step guidance on patching critical issues",
    category: "Fixes",
  },
]

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)

  const getResponseForPrompt = (prompt: string): string => {
    const responses: Record<string, string> = {
      "Explain this vulnerability":
        "SQL Injection is a critical vulnerability that occurs when user input is directly concatenated into SQL queries without proper escaping or parameterization. Attackers can manipulate the query to access, modify, or delete unauthorized data. Always use parameterized queries (prepared statements) to prevent this vulnerability.",
      "Which scan should I run next?":
        "Based on your recent scans, we recommend running a dependency scan on your package.json files to identify outdated libraries with known vulnerabilities. Your last dependency scan was 5 days ago.",
      "Best practices for dependency management":
        "1. Regularly update dependencies\n2. Use lock files (package-lock.json)\n3. Implement dependency scanning in CI/CD\n4. Review security advisories\n5. Use npm audit or similar tools\n6. Minimize production dependencies",
      "How to fix critical vulnerabilities":
        "Critical vulnerabilities should be prioritized immediately. Steps: 1) Identify the root cause, 2) Check for available patches, 3) Test patches in dev environment, 4) Deploy to production with monitoring, 5) Verify the fix with a re-scan.",
    }
    return responses[prompt] || "This feature is coming soon. We're building advanced AI capabilities."
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          size="icon"
          title="Open AI Assistant"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Assistant Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-1.5rem)] rounded-xl shadow-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">CodeSentinel AI</h3>
                <p className="text-xs text-muted-foreground">Security guidance & insights</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-8 w-8">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isExpanded && (
            <ScrollArea className="h-96">
              <CardContent className="p-4">
                {selectedPrompt ? (
                  <div className="space-y-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPrompt(null)}
                      className="text-xs text-muted-foreground hover:text-foreground mb-2"
                    >
                      ← Back to prompts
                    </Button>

                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="font-medium text-sm text-foreground">{selectedPrompt}</p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <p className="text-sm text-foreground leading-relaxed">{getResponseForPrompt(selectedPrompt)}</p>
                    </div>

                    <Button size="sm" className="w-full" asChild>
                      <a href="/docs">Learn more in Docs</a>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Quick prompts:</p>
                    {presetPrompts.map((prompt) => (
                      <button
                        key={prompt.title}
                        onClick={() => setSelectedPrompt(prompt.title)}
                        className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors border border-border/50 hover:border-primary/50 group"
                      >
                        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                          {prompt.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{prompt.description}</p>
                      </button>
                    ))}

                    <div className="mt-4 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        Advanced AI chat features coming soon
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          )}
        </div>
      )}
    </>
  )
}
