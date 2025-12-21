import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star } from "lucide-react"

const testimonials = [
  {
    quote:
      "CodeSentinel found 25 critical vulnerabilities in our first scan that we completely missed. The AI fix suggestions saved us weeks of research.",
    author: "Sarah Chen",
    role: "CTO",
    company: "TechFlow Inc",
    avatar: "/professional-woman-diverse.png",
    initials: "SC",
  },
  {
    quote:
      "We reduced our security review time from 2 weeks to 2 hours. The plain-English explanations make it easy for our entire team to understand and fix issues.",
    author: "Marcus Rodriguez",
    role: "Lead Security Engineer",
    company: "DataSecure Labs",
    avatar: "/professional-man.jpg",
    initials: "MR",
  },
  {
    quote:
      "The GitHub integration is seamless. We catch vulnerabilities before they reach production, and the team collaboration features are outstanding.",
    author: "Emily Thompson",
    role: "VP of Engineering",
    company: "CloudNative Solutions",
    avatar: "/professional-woman-2.png",
    initials: "ET",
  },
  {
    quote:
      "Best ROI we've had on any security tool. CodeSentinel pays for itself by preventing just one security incident.",
    author: "James Park",
    role: "Engineering Manager",
    company: "FinTech Innovations",
    avatar: "/professional-man-2.png",
    initials: "JP",
  },
]

const companies = [
  { name: "TechFlow", logo: "TF" },
  { name: "DataSecure", logo: "DS" },
  { name: "CloudNative", logo: "CN" },
  { name: "FinTech", logo: "FI" },
  { name: "DevOps Co", logo: "DO" },
  { name: "SecureApp", logo: "SA" },
]

export function Testimonials() {
  return (
    <section className="py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Trusted by Engineering Teams
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Join hundreds of teams using CodeSentinel to secure their code and ship with confidence.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <blockquote className="text-sm mb-6 leading-relaxed">"{testimonial.quote}"</blockquote>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={testimonial.avatar || "/placeholder.svg"} alt={testimonial.author} />
                      <AvatarFallback>{testimonial.initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-sm">{testimonial.author}</div>
                      <div className="text-xs text-muted-foreground">
                        {testimonial.role} at {testimonial.company}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Company Logos */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-6">Trusted by developers at</p>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {companies.map((company, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center h-12 w-24 rounded-lg bg-muted/50 text-muted-foreground font-bold text-sm"
                >
                  {company.logo}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
