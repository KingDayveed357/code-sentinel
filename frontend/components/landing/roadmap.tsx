import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, Clock } from "lucide-react"

const roadmapItems = [
  {
    status: "completed",
    quarter: "Q4 2024",
    items: [
      "GitHub & GitLab integration",
      "AI-powered vulnerability detection",
      "Real-time scanning engine",
      "Team collaboration features",
    ],
  },
  {
    status: "current",
    quarter: "Q1 2025",
    items: [
      "Advanced CI/CD integrations",
      "Custom security policies",
      "Enhanced AI fix suggestions",
      "API v2 with webhooks",
    ],
  },
  {
    status: "planned",
    quarter: "Q2 2025",
    items: [
      "Container security scanning",
      "Compliance reporting (SOC2, ISO 27001)",
      "Multi-language support expansion",
      "Advanced threat intelligence",
    ],
  },
  {
    status: "planned",
    quarter: "Q3 2025",
    items: [
      "AI-powered auto-remediation",
      "Enterprise SSO & SAML",
      "Custom integration marketplace",
      "Mobile app for security alerts",
    ],
  },
]

export function Roadmap() {
  return (
    <section id="roadmap" className="py-20 md:py-32 border-b border-border/40 bg-muted/20">
      <div className="container px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Building the Future of Code Security
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Our transparent roadmap shows where we are and where we're heading. Your feedback shapes our priorities.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roadmapItems.map((milestone, index) => (
              <Card key={index} className={milestone.status === "current" ? "border-primary shadow-md" : ""}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <Badge
                      variant={
                        milestone.status === "completed"
                          ? "default"
                          : milestone.status === "current"
                            ? "default"
                            : "secondary"
                      }
                      className={
                        milestone.status === "completed"
                          ? "bg-success text-success-foreground"
                          : milestone.status === "current"
                            ? "bg-primary text-primary-foreground"
                            : ""
                      }
                    >
                      {milestone.status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {milestone.status === "current" && <Clock className="mr-1 h-3 w-3" />}
                      {milestone.status === "planned" && <Circle className="mr-1 h-3 w-3" />}
                      {milestone.quarter}
                    </Badge>
                  </div>
                  <ul className="space-y-3">
                    {milestone.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        {milestone.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                        ) : milestone.status === "current" ? (
                          <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        )}
                        <span className={milestone.status === "planned" ? "text-muted-foreground" : ""}>{item}</span>
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
