"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GraduationCap, Sun, Sparkles } from "lucide-react"

interface LoginPageProps {
  onForgotPassword: () => void
}

export function LoginPage({ onForgotPassword }: LoginPageProps) {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary/20 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 text-primary/30">
          <Sun className="w-32 h-32 animate-pulse" />
        </div>
        <div className="absolute bottom-20 right-20 text-accent/30">
          <Sparkles className="w-24 h-24" />
        </div>
        <div className="absolute top-1/4 right-1/4 text-primary/20">
          <GraduationCap className="w-20 h-20" />
        </div>
      </div>
      
      <Card className="w-full max-w-md shadow-2xl border-2 border-primary/20 relative z-10">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            <GraduationCap className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-bold text-foreground">
            <span className="text-balance">Welcome to EduLearn</span>
          </CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            Your journey to knowledge starts here
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-border/50 focus:border-primary"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-border/50 focus:border-primary"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all"
            >
              Sign In
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
          
          <div className="text-center">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-accent hover:text-accent/80 hover:underline transition-colors font-medium"
            >
              Forgot your password?
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
