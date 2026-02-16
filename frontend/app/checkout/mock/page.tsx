"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"

export default function MockCheckoutPage() {
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get("workspaceId")
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle')

  const handlePayment = async (success: boolean) => {
    setStatus('processing')
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    if (success) {
      // Call backend to verify payment and activate workspace
       try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
        const res = await fetch(`${apiUrl}/billing/mock-success`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId })
        })
        
        if (!res.ok) throw new Error('Payment verification failed')
        
        setStatus('success')
        // Redirect to dashboard after short delay
        setTimeout(() => {
          window.location.href = `/dashboard?workspace=${workspaceId}`
        }, 1500)
      } catch (err) {
        setStatus('failed')
      }
    } else {
      setStatus('idle') // Reset to allow retry or cancel
      // In real scenario, user would see error or cancel page
      alert("Payment cancelled")
    }
  }

  if (!workspaceId) {
    return <div className="flex items-center justify-center min-h-screen">Invalid Checkout Session</div>
  }

  return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Complete Your Purchase</CardTitle>
          <CardDescription>Mock Payment Gateway (Dev Mode)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border p-4 bg-card">
            <div className="flex justify-between mb-2">
              <span className="font-medium">Team Plan Subscription</span>
              <span className="font-bold">$29.00 / month</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Includes unlimited members, advanced security scanning, and priority support.
            </div>
          </div>

          {status === 'processing' && (
            <div className="py-8 flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processing payment...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-8 flex flex-col items-center gap-2 text-green-600">
              <CheckCircle2 className="h-12 w-12" />
              <p className="font-medium">Payment Successful!</p>
              <p className="text-sm text-muted-foreground">Redirecting to workspace...</p>
            </div>
          )}

          {status === 'failed' && (
            <div className="py-8 flex flex-col items-center gap-2 text-destructive">
              <XCircle className="h-12 w-12" />
              <p className="font-medium">Payment Failed</p>
              <p className="text-sm text-muted-foreground">Please try again.</p>
            </div>
          )}
        </CardContent>
        {status === 'idle' && (
          <CardFooter className="flex flex-col gap-3">
            <Button 
              className="w-full bg-green-600 hover:bg-green-700 text-white" 
              size="lg"
              onClick={() => handlePayment(true)}
            >
              Simulate Successful Payment ($29.00)
            </Button>
            <Button 
              variant="outline" 
              className="w-full hover:bg-destructive/10 hover:text-destructive"
              onClick={() => handlePayment(false)}
            >
              Cancel Payment
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
