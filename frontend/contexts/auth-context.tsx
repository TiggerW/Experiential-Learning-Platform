"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { apiFetch } from "@/lib/api-client"

export type UserRole = "student" | "teacher" | "admin"

interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar: string
  school?: string
  className?: string
  advisorTeacherId?: string
  advisorTeacherName?: string
  bio?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (nextUser: User) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const rawUser = localStorage.getItem("auth_user")
    const rawToken = localStorage.getItem("auth_token")
    if (rawUser && rawToken) {
      setUser(JSON.parse(rawUser))
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    localStorage.setItem("auth_token", data.token)
    localStorage.setItem("auth_user", JSON.stringify(data.user))
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("auth_user")
    setUser(null)
  }, [])

  const updateUser = useCallback((nextUser: User) => {
    localStorage.setItem("auth_user", JSON.stringify(nextUser))
    setUser(nextUser)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
