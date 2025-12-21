"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, Play, Shield, Zap } from "lucide-react"
import { useState } from "react"

export function ProblemSolutionDemo() {
  const [isScanning, setIsScanning] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const handleDemoScan = () => {
    setIsScanning(true)
    setShowResults(false)

    setTimeout(() => {
      setIsScanning(false)
      setShowResults(true)
    }, 2500)
  }

  return (
    <section id="demo" className="py-20 md:py-32 border-b border-border/40">
      <div className="container px-4">
        <div className="mx-auto max-w-6xl">
          {/* Problem Statement */}
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Stop Discovering Vulnerabilities Too Late
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Manual security reviews are slow, expensive, and often miss critical issues. Security breaches cost
              companies an average of $4.45M per incident.
            </p>
          </div>

          {/* Before vs After */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Card className="border-destructive/50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <h3 className="font-semibold text-lg">Manual Reviews</h3>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-destructive mt-0.5">×</span>
                    <span>Days or weeks to complete security audits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-destructive mt-0.5">×</span>
                    <span>Expensive consultant fees and limited availability</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-destructive mt-0.5">×</span>
                    <span>Technical jargon that developers struggle to action</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-destructive mt-0.5">×</span>
                    <span>Vulnerabilities discovered in production</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-success/50 bg-success/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <h3 className="font-semibold text-lg">CodeSentinel</h3>
                </div>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span>Scan completed in seconds, not days</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span>Unlimited scans at a fraction of consultant costs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span>Plain-English explanations with code-level fixes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span>Catch issues before they reach production</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Demo */}
          <Card className="shadow-md transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-semibold text-lg mb-1">Try a Live Demo Scan</h3>
                  <p className="text-sm text-muted-foreground">
                    See how CodeSentinel analyzes code and provides AI fix suggestions
                  </p>
                </div>
                <Button onClick={handleDemoScan} disabled={isScanning} className="w-full md:w-auto">
                  {isScanning ? (
                    <>
                      <Zap className="mr-2 h-4 w-4 animate-scan-pulse" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Run Demo Scan
                    </>
                  )}
                </Button>
              </div>

              {isScanning && (
                <div className="bg-muted rounded-lg p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-scan-pulse" />
                    <span className="text-sm">Analyzing repository structure...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-scan-pulse animation-delay-200" />
                    <span className="text-sm">Scanning for vulnerabilities...</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-scan-pulse animation-delay-400" />
                    <span className="text-sm">Generating AI fix suggestions...</span>
                  </div>
                </div>
              )}

              {showResults && !isScanning && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-success" />
                      <span className="font-medium">Scan Complete</span>
                    </div>
                    <Badge variant="outline">2.3s</Badge>
                  </div>

                  <div className="grid gap-3">
                    <Card className="border-destructive/50">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="destructive" className="text-xs">
                                Critical
                              </Badge>
                              <span className="text-sm font-medium">SQL Injection Vulnerability</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">
                              Found in <code className="text-xs">api/users.ts:42</code>
                            </p>
                            <div className="bg-muted/50 rounded p-3 text-xs font-mono mb-3">
                              {`const query = 'SELECT * FROM users WHERE id = ' + userId`}
                            </div>
                            <div className="bg-success/10 border border-success/20 rounded p-3">
                              <p className="text-xs font-medium text-success mb-2">💡 AI Fix Suggestion:</p>
                              <p className="text-xs text-foreground/80 mb-2">
                                Use parameterized queries to prevent SQL injection attacks.
                              </p>
                              <div className="bg-background rounded p-2 text-xs font-mono">
                                {`const query = 'SELECT * FROM users WHERE id = ?'\ndb.query(query, [userId])`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-warning/50">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-warning text-warning-foreground text-xs">High</Badge>
                              <span className="text-sm font-medium">Exposed API Key</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">
                              Found in <code className="text-xs">config/api.ts:15</code>
                            </p>
                            <div className="bg-success/10 border border-success/20 rounded p-3">
                              <p className="text-xs font-medium text-success mb-2">💡 AI Fix Suggestion:</p>
                              <p className="text-xs text-foreground/80">
                                Move API keys to environment variables and add to .gitignore.
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
