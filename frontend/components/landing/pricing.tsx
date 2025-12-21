import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check } from "lucide-react"
import Link from "next/link"

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Ideal for individual developers trying CodeSentinel",
    features: [
      "Up to 3 repositories",
      "10 scans per month",
      "Basic AI fix suggestions",
      "Community support",
      "No credit card required",
    ],
    cta: "Get Started",
    popular: false,
    trial: false,
  },
  {
    name: "Dev",
    price: "$10",
    period: "/month",
    description: "For single developers needing more capacity",
    features: [
      "Unlimited repositories",
      "100 scans per month",
      "Advanced AI fix suggestions",
      "Email support",
      "7-day free trial",
      "Cancel anytime",
    ],
    cta: "Start Free Trial",
    popular: false,
    trial: true,
  },
  {
    name: "Team",
    price: "$29",
    period: "/month",
    description: "For small to mid-sized engineering teams",
    features: [
      "Unlimited repositories",
      "Unlimited scans",
      "Team collaboration features",
      "Priority CI/CD integration",
      "Priority support",
      "14-day free trial",
      "Advanced reporting",
      "Team management",
    ],
    cta: "Start Free Trial",
    popular: true,
    trial: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "pricing",
    description: "For large organizations",
    features: [
      "Everything in Team plan",
      "Unlimited team members",
      "Single Sign-On (SSO)",
      "Dedicated support engineer",
      "SLA guarantees",
      "Custom integrations",
      "Advanced security controls",
      "14-day free trial available",
    ],
    cta: "Contact Sales",
    popular: false,
    trial: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-32 border-b border-border/40 bg-muted/20">
      <div className="container px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Pricing Plans for Every Team
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Start with a free plan or 14-day trial. Upgrade anytime. No credit card required for free plan.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {plans.map((plan, index) => (
              <Card
                key={index}
                className={`relative transition-all duration-200 flex flex-col ${plan.popular ? "border-primary border-2 shadow-lg md:col-span-1" : "hover:-translate-y-1 hover:shadow-lg"}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-0 right-0 flex justify-center">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && <span className="text-muted-foreground ml-1">/{plan.period}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{plan.description}</p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <Button className="w-full mb-6" variant={plan.popular ? "default" : "outline"} asChild>
                    <Link href={plan.name === "Enterprise" ? "/contact" : "/register"}>{plan.cta}</Link>
                  </Button>
                  <ul className="space-y-3 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              All plans include everything you need to secure your repositories.{" "}
              <Link href="/docs" className="text-primary hover:underline">
                See documentation
              </Link>{" "}
              for more details.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
