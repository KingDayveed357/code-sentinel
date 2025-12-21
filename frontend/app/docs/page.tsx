import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/landing/header"
import { Footer } from "@/components/landing/footer"
import { BookOpen, Code, Zap, Github } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Documentation - CodeSentinel",
  description: "Learn how to use CodeSentinel to secure your repositories",
}

export default function DocsPage() {
  const sections = [
    {
      icon: BookOpen,
      title: "Getting Started",
      description: "Set up CodeSentinel in minutes and start scanning your repositories",
      href: "#getting-started",
    },
    {
      icon: Code,
      title: "API Reference",
      description: "Integrate CodeSentinel with your CI/CD pipeline using our API",
      href: "#api",
    },
    {
      icon: Zap,
      title: "Configuration",
      description: "Customize scanning rules and settings for your projects",
      href: "#config",
    },
    {
      icon: Github,
      title: "GitHub Integration",
      description: "Connect your GitHub repositories and enable automatic scanning",
      href: "#github",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 py-12">
        {/* Hero */}
        <section className="max-w-3xl mx-auto mb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Documentation</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Everything you need to get started with CodeSentinel and maximize security for your repositories.
          </p>
        </section>

        {/* Quick Start Cards */}
        <section className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl font-bold mb-8">Quick Start Guides</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {sections.map((section) => (
              <Card key={section.title} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <section.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="mt-2">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={section.href}>Learn More</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Getting Started Section */}
        <section className="max-w-4xl mx-auto mb-16" id="getting-started">
          <h2 className="text-2xl font-bold mb-6">Getting Started</h2>
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Connect Your Repository</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Go to the Dashboard and click "Connect Repository". Select your Git provider (GitHub, GitLab, or
                Bitbucket) and authorize CodeSentinel to access your repositories.
              </p>
              <code className="block bg-muted p-3 rounded text-sm overflow-x-auto">
                1. Click Dashboard → Repositories
                <br />
                2. Click "Connect Repository"
                <br />
                3. Select your Git provider
                <br />
                4. Authorize and select repositories
              </code>
            </CardContent>
          </Card>
        </section>

        {/* API Reference */}
        <section className="max-w-4xl mx-auto mb-16" id="api">
          <h2 className="text-2xl font-bold mb-6">API Reference</h2>
          <Card>
            <CardHeader>
              <CardTitle>Webhooks</CardTitle>
              <CardDescription>Trigger scans automatically on code push</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>CodeSentinel integrates with your repository webhooks to automatically scan code changes.</p>
              <code className="block bg-muted p-3 rounded text-sm overflow-x-auto whitespace-pre-wrap">
                {`POST /api/scan
{
  "repository": "owner/repo",
  "branch": "main",
  "commit": "abc123def456"
}`}
              </code>
            </CardContent>
          </Card>
        </section>
      </main>

      <Footer />
    </div>
  )
}
