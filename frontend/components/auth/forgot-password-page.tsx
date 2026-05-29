"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GraduationCap, ArrowLeft, Mail, CheckCircle2 } from "lucide-react"

interface ForgotPasswordPageProps {
  onBackToLogin: () => void
}

export function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary/20 p-4">
      <Card className="w-full max-w-md shadow-2xl border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            {isSubmitted ? (
              <CheckCircle2 className="w-10 h-10 text-primary-foreground" />
            ) : (
              <GraduationCap className="w-10 h-10 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            {isSubmitted ? "Check Your Email" : "Reset Password"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isSubmitted
              ? "We've sent a password reset link to your email"
              : "Enter your email to receive a reset link"}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-10 border-border/50 focus:border-primary"
                    required
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
              >
                Send Reset Link
              </Button>
            </form>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                {"Didn't receive the email? Check your spam folder or try again."}
              </p>
              <Button
                variant="outline"
                onClick={() => setIsSubmitted(false)}
                className="border-primary/30 hover:bg-primary/10"
              >
                Try Again
              </Button>
            </div>
          )}
          
          <button
            type="button"
            onClick={onBackToLogin}
            className="flex items-center justify-center gap-2 w-full text-sm text-accent hover:text-accent/80 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
