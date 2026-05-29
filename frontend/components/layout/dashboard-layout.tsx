"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Navbar } from "./navbar"

type View = "board" | "map"

interface DashboardLayoutProps {
  children: (view: View) => React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user } = useAuth()
  const [currentView, setCurrentView] = useState<View>("board")

  useEffect(() => {
    if (!user || user.role !== "teacher") return
    const savedView = localStorage.getItem(`teacher_dashboard_view_${user.id}`)
    if (savedView === "board" || savedView === "map") {
      setCurrentView(savedView)
    }
  }, [user])

  useEffect(() => {
    if (!user || user.role !== "teacher") return
    localStorage.setItem(`teacher_dashboard_view_${user.id}`, currentView)
  }, [currentView, user])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-hidden">
        {children(currentView)}
      </main>
    </div>
  )
}
