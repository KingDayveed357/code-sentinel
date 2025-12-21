"use client"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Github, Menu, Shield } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
// import { GithubButton } from "../auth/github-button"
import { NavbarGithubButton } from "../auth/navbar-github-button"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 sm:h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Shield className="h-5 sm:h-6 w-5 sm:w-6 text-primary" />
          <span className="text-lg sm:text-xl font-bold text-foreground">CodeSentinel</span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="#features"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="#roadmap"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Roadmap
          </Link>
          <Link
            href="#pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/docs"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </Link>
        </nav>

        {/* Theme Toggle and Auth Buttons */}
        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeToggle />
          <div className="hidden md:flex items-center gap-2">
            {/* <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log In</Link>
            </Button> */}
           <NavbarGithubButton />
            
          </div>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <nav className="flex flex-col gap-4 mt-8">
                <Link
                  href="#features"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Features
                </Link>
                <Link
                  href="#roadmap"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Roadmap
                </Link>
                <Link
                  href="#pricing"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="/docs"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Docs
                </Link>
                <div className="flex flex-col gap-2 pt-4 border-t">
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link href="/login">Log In</Link>
                  </Button>
                  <Button asChild className="w-full justify-start">
                    <Link href="/register">Get Started</Link>
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
