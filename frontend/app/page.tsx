import { Hero } from "@/components/landing/hero"
import { ProblemSolutionDemo } from "@/components/landing/problem-solution-demo"
import { Features } from "@/components/landing/features"
import { Roadmap } from "@/components/landing/roadmap"
import { SecurityCompliance } from "@/components/landing/security-compliance"
import { Pricing } from "@/components/landing/pricing"
import { Testimonials } from "@/components/landing/testimonials"
import { Footer } from "@/components/landing/footer"
import { Header } from "@/components/landing/header"
import { CtaSection } from "@/components/landing/cta-section"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <ProblemSolutionDemo />
        <Features />
        <Roadmap />
        <SecurityCompliance />
        <Pricing />
        <Testimonials />
        <CtaSection />
      </main>
      <Footer />
    </div>
  )
}
