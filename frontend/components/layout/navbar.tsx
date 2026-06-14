"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GraduationCap, LogOut, User, LayoutDashboard, MapPin, BookOpen, Sparkles, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

type View = "board" | "map" | "objectives" | "skills" | "content-studio"

interface NavbarProps {
  currentView: View
  onViewChange: (view: View) => void
}

export function Navbar({ currentView, onViewChange }: NavbarProps) {
  const { user, logout, updateUser } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [name, setName] = useState("")
  const [school, setSchool] = useState("")
  const [className, setClassName] = useState("")
  const [advisorTeacherName, setAdvisorTeacherName] = useState("")
  const [bio, setBio] = useState("")
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState("")
  const [error, setError] = useState("")
  const isStudent = user?.role === "student"

  useEffect(() => {
    if (!profileOpen) return
    const loadProfile = async () => {
      try {
        setError("")
        const res = await apiFetch("/api/profile")
        const data = await res.json()
        setName(data.name || "")
        setSchool(data.school || "")
        setClassName(data.className || "")
        setAdvisorTeacherName(data.advisorTeacherName || "")
        setBio(data.bio || "")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile")
      }
    }
    loadProfile()
  }, [profileOpen])

  const handleSaveProfile = async () => {
    try {
      setSaving(true)
      setError("")
      const res = await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, school, className, bio }),
      })
      const updated = await res.json()
      updateUser(updated)
      setPasswordMessage("")
      setProfileOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    try {
      setChangingPassword(true)
      setPasswordMessage("")
      await apiFetch("/api/profile/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword("")
      setNewPassword("")
      setPasswordMessage("Password updated successfully.")
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setChangingPassword(false)
    }
  }

  if (!user) return null

  const roleColors = {
    student: "bg-accent/20 text-accent",
    teacher: "bg-info/20 text-info",
    admin: "bg-success/20 text-success",
  }

  return (
    <header className="sticky top-0 z-[1100] w-full border-b border-border/40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="w-full px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-md">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground hidden sm:block">
              EduLearn
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewChange("board")}
              className={cn(
                "gap-2 rounded-md px-4 transition-all",
                currentView === "board"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Activity Board</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewChange("map")}
              className={cn(
                "gap-2 rounded-md px-4 transition-all",
                currentView === "map"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Activity Map</span>
            </Button>
            {user.role === "teacher" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewChange("objectives")}
                  className={cn(
                    "gap-2 rounded-md px-4 transition-all",
                    currentView === "objectives"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="hidden sm:inline">Objectives</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewChange("skills")}
                  className={cn(
                    "gap-2 rounded-md px-4 transition-all",
                    currentView === "skills"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Skills</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewChange("content-studio")}
                  className={cn(
                    "gap-2 rounded-md px-4 transition-all",
                    currentView === "content-studio"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Wand2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Content Studio</span>
                </Button>
              </>
            )}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "hidden sm:inline-flex px-3 py-1 text-xs font-semibold rounded-full capitalize",
                roleColors[user.role]
              )}
            >
              {user.role}
            </span>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full ring-2 ring-primary/20 hover:ring-primary/40 transition-all"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 z-[1200]" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={(e) => {
                    e.preventDefault()
                    setProfileOpen(true)
                  }}
                >
                  <User className="w-4 h-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="z-[1300] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user.email} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isStudent} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-school">School / Organization</Label>
              <Input id="profile-school" value={school} onChange={(e) => setSchool(e.target.value)} disabled={isStudent} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-class">Class</Label>
              <Input id="profile-class" value={className} onChange={(e) => setClassName(e.target.value)} disabled={isStudent} />
            </div>

            {isStudent && (
              <div className="space-y-2">
                <Label htmlFor="profile-advisor">Responsible Teacher</Label>
                <Input id="profile-advisor" value={advisorTeacherName || "Not assigned"} disabled />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="profile-bio">Bio</Label>
              <Textarea id="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-24" />
            </div>

            <div className="space-y-2 border-t border-border/60 pt-3">
              <Label className="text-sm font-semibold">Change Password</Label>
              <Input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                variant="secondary"
                type="button"
                onClick={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword}
              >
                {changingPassword ? "Updating..." : "Update Password"}
              </Button>
              {passwordMessage && <p className="text-xs text-muted-foreground">{passwordMessage}</p>}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
