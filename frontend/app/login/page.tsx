// import { LoginForm } from "@/components/auth/login-form"
import { Shield } from "lucide-react"
import Link from "next/link"
import { BlockIfAuthenticated } from "@/components/guards/block-if-authenticated"

export default function LoginPage() {
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
          <h1 className="text-4xl font-bold mb-4">Secure Your Code with AI</h1>
          <p className="text-lg text-white/90 leading-relaxed">
            Join thousands of developers protecting their repositories with intelligent security scanning.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-8 lg:hidden">
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">CodeSentinel</span>
            </Link>
            <h2 className="text-3xl font-bold mt-8">Welcome back</h2>
            <p className="text-muted-foreground mt-2">Sign in to your account to continue</p>
          </div>

          {/* <LoginForm /> */}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">{"Don't have an account? "}</span>
            <Link href="/register" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
    </BlockIfAuthenticated>
  )
}
