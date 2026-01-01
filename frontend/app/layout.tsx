// app/layout.tsx
import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import { ReactQueryProvider } from "@/providers/react-query-provider";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CodeSentinel - AI-Powered Security Audits for Your Repositories",
  description:
    "Find vulnerabilities instantly with AI-powered security scans. Get fix suggestions in plain English for your GitHub and GitLab repositories.",
  generator: "v0.app",
  keywords: [
    "security audit",
    "vulnerability scanner",
    "AI security",
    "GitHub security",
    "GitLab security",
    "code analysis",
  ],
  authors: [{ name: "CodeSentinel" }],
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "CodeSentinel - AI-Powered Security Audits",
    description:
      "Find vulnerabilities instantly with AI-powered security scans.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3b4f8f" },
    { media: "(prefers-color-scheme: dark)", color: "#1e2533" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* CRITICAL: AuthProvider must wrap ReactQueryProvider */}
          <AuthProvider>
            {/* React Query for data fetching */}
            <ReactQueryProvider>
              {children}
              
              {/* Toast notifications */}
              <Toaster 
                position="top-right" 
                richColors 
                closeButton
              />
            </ReactQueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}