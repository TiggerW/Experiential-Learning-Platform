"use client"

import { useState } from "react"
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { AppDataProvider } from "@/contexts/app-data-context"
import { LoginPage } from "@/components/auth/login-page"
import { ForgotPasswordPage } from "@/components/auth/forgot-password-page"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ActivityBoard } from "@/components/board/activity-board"
import { ActivityMap } from "@/components/map/activity-map"
import { LearningObjectivesPage } from "@/components/teacher/learning-objectives-page"
import { SkillsPage } from "@/components/teacher/skills-page"
import { ContentStudioPage } from "@/components/teacher/content-studio-page"
import { AIChatbot } from "@/components/chat/ai-chatbot"

type AuthView = "login" | "forgot-password"

function AppContent() {
  const { isAuthenticated } = useAuth()
  const [authView, setAuthView] = useState<AuthView>("login")

  if (!isAuthenticated) {
    if (authView === "forgot-password") {
      return <ForgotPasswordPage onBackToLogin={() => setAuthView("login")} />
    }
    return <LoginPage onForgotPassword={() => setAuthView("forgot-password")} />
  }

  return (
    <>
      <DashboardLayout>
        {(view) => (
          <div className="h-[calc(100vh-4rem)]">
            {view === "board" && <ActivityBoard />}
            {view === "map" && <ActivityMap />}
            {view === "objectives" && <LearningObjectivesPage />}
            {view === "skills" && <SkillsPage />}
            {view === "content-studio" && <ContentStudioPage />}
          </div>
        )}
      </DashboardLayout>
      <AIChatbot />
    </>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <AppContent />
      </AppDataProvider>
    </AuthProvider>
  )
}
