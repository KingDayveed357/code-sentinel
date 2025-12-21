import { Card, CardContent } from "@/components/ui/card"
import { Zap, MessageSquare, Shield, Users, Layers, GitBranch } from "lucide-react"

const features = [
  {
    icon: Zap,
    title: "Automated Scans",
    description:
      "Continuous monitoring with scheduled scans. Get instant alerts when vulnerabilities are detected in your repositories.",
    details: ["Real-time scanning", "Scheduled audits", "CI/CD integration", "Instant notifications"],
  },
  {
    icon: MessageSquare,
    title: "AI Explanations",
    description:
      "Plain-English vulnerability descriptions with code-level fix suggestions powered by advanced AI models.",
    details: ["Human-readable reports", "Code examples", "Step-by-step fixes", "Context-aware suggestions"],
  },
  {
    icon: Shield,
    title: "Severity Scoring",
    description: "Automatic risk prioritization with industry-standard CVE scoring. Focus on what matters most.",
    details: ["CVSS scoring", "Risk categorization", "Priority sorting", "Impact analysis"],
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Share scan results, assign fixes, and track resolution progress across your entire engineering team.",
    details: ["Shared dashboards", "Audit logs", "Role-based access", "Team notifications"],
  },
  {
    icon: Layers,
    title: "Deep Analysis",
    description:
      "Comprehensive scanning of dependencies, containers, IaC, and source code for complete security coverage.",
    details: ["Dependency scanning", "Container security", "IaC analysis", "Secret detection"],
  },
  {
    icon: GitBranch,
    title: "Integrations",
    description: "Seamlessly connect with GitHub, GitLab, and your CI/CD pipeline for automated security workflows.",
    details: ["GitHub Apps", "GitLab webhooks", "CI/CD plugins", "API access"],
  },
]

export function Features() {
  return (
    <section id="features" className="py-20 md:py-32 border-b border-border/40">
      <div className="container px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Enterprise Security, Developer Experience
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Comprehensive security scanning with an intuitive interface built for modern development teams.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg">{feature.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{feature.description}</p>
                  <ul className="space-y-2">
                    {feature.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
