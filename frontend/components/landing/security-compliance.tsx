import { Card, CardContent } from "@/components/ui/card"
import { Shield, Lock, FileCheck, Eye } from "lucide-react"

const securityFeatures = [
  {
    icon: Shield,
    title: "Enterprise-Grade Encryption",
    description:
      "All data encrypted in transit (TLS 1.3) and at rest (AES-256). Your code never leaves your infrastructure.",
  },
  {
    icon: Lock,
    title: "Zero Code Storage",
    description:
      "We analyze your code in real-time without storing source code. Only metadata and scan results are retained.",
  },
  {
    icon: FileCheck,
    title: "Compliance Ready",
    description: "Built with SOC 2 Type II and ISO 27001 compliance in mind. Audit logs and access controls included.",
  },
  {
    icon: Eye,
    title: "Complete Transparency",
    description:
      "Detailed audit trails, full API access, and comprehensive documentation. You control your security posture.",
  },
]

export function SecurityCompliance() {
  return (
    <section className="py-20 md:py-32 border-b border-border/40">
      <div className="container px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">Security You Can Trust</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              We take security seriously. Your code and data are protected with industry-leading security practices.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {securityFeatures.map((feature, index) => (
              <Card key={index} className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Compliance Progress:</strong> Currently working towards SOC 2 Type
                  II certification. Expected completion Q3 2025. ISO 27001 certification planned for Q4 2025.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
