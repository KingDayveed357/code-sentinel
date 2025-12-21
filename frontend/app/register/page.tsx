// import { RegisterForm } from "@/components/auth/register-form"
import { Shield } from "lucide-react"
import Link from "next/link"
import { BlockIfAuthenticated } from "@/components/guards/block-if-authenticated"

export default function RegisterPage() {
  return (
    <BlockIfAuthenticated>
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-accent p-12 items-center justify-center">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <Shield className="h-12 w-12" />
            <span className="text-3xl font-bold">CodeSentinel</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">Start Securing Your Code Today</h1>
          <p className="text-lg text-white/90 leading-relaxed mb-6">
            Get started with a 14-day free trial. No credit card required.
          </p>
          <ul className="space-y-3 text-white/90">
            <li className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">✓</div>
              <span>Unlimited repository scans</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">✓</div>
              <span>AI-powered fix suggestions</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">✓</div>
              <span>Team collaboration tools</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right side - Register Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-8 lg:hidden">
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">CodeSentinel</span>
            </Link>
            <h2 className="text-3xl font-bold mt-8">Create your account</h2>
            <p className="text-muted-foreground mt-2">Start your 14-day free trial</p>
          </div>

          {/* <RegisterForm /> */}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  </BlockIfAuthenticated>
  )
}
