"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { type LearningObjective } from "@/contexts/app-data-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BookOpen, Plus, Pencil, Trash2, Upload } from "lucide-react"

const emptyForm = {
  topicCode: "",
  topic: "",
  lessonCode: "",
  lesson: "",
  contentCode: "",
  content: "",
  objectiveCode: "",
  description: "",
  category: "custom",
}

export function LearningObjectivesPage() {
  const [objectives, setObjectives] = useState<LearningObjective[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [filterCategory, setFilterCategory] = useState("all")

  const loadObjectives = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/learning-objectives")
      const data = await res.json()
      setObjectives(data.objectives || [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load objectives")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadObjectives()
  }, [loadObjectives])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (objective: LearningObjective) => {
    setEditingId(objective.id)
    setForm({
      topicCode: objective.topicCode || "",
      topic: objective.topic || "",
      lessonCode: objective.lessonCode || "",
      lesson: objective.lesson || "",
      contentCode: objective.contentCode || "",
      content: objective.content || "",
      objectiveCode: objective.objectiveCode || "",
      description: objective.description || "",
      category: objective.category || "custom",
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.objectiveCode.trim() || !form.content.trim()) {
      setMessage("Objective code and content are required.")
      return
    }
    setSaving(true)
    setMessage("")
    try {
      if (editingId) {
        await apiFetch(`/api/learning-objectives/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        })
      } else {
        await apiFetch("/api/learning-objectives", {
          method: "POST",
          body: JSON.stringify(form),
        })
      }
      setDialogOpen(false)
      await loadObjectives()
      setMessage("Saved successfully.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save objective")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this learning objective?")) return
    try {
      await apiFetch(`/api/learning-objectives/${id}`, { method: "DELETE" })
      await loadObjectives()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete objective")
    }
  }

  const handleImportCurriculum = async () => {
    setImporting(true)
    setMessage("")
    try {
      const res = await apiFetch("/api/learning-objectives/import-curriculum", { method: "POST" })
      const data = await res.json()
      await loadObjectives()
      setMessage(`Imported ${data.inserted || 0} curriculum objectives.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to import curriculum")
    } finally {
      setImporting(false)
    }
  }

  const filteredObjectives =
    filterCategory === "all"
      ? objectives
      : objectives.filter((item) => item.category === filterCategory)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Learning Objectives
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage curriculum learning objectives and assign them to student activity cards.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => void handleImportCurriculum()} disabled={importing}>
            <Upload className="w-4 h-4 mr-2" />
            {importing ? "Importing..." : "Import Curriculum"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Objective
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label>Category</Label>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="humanities">Humanities</SelectItem>
            <SelectItem value="science">Science</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{loading ? "Loading..." : `${filteredObjectives.length} objectives`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredObjectives.map((objective) => (
            <div
              key={objective.id}
              className="flex items-start justify-between gap-3 p-4 rounded-lg border border-border/50 bg-muted/20"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {objective.category || "custom"}
                  </span>
                  <span className="font-medium text-foreground">{objective.objectiveCode}</span>
                </div>
                <p className="text-sm text-foreground mt-2">{objective.content}</p>
                {objective.description && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {objective.description}
                  </p>
                )}
                {(objective.topic || objective.lesson) && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {[objective.topic, objective.lesson].filter(Boolean).join(" / ")}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => openEdit(objective)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void handleDelete(objective.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Objective" : "Add Objective"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Topic Code</Label>
                <Input
                  value={form.topicCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, topicCode: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Topic</Label>
                <Input
                  value={form.topic}
                  onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lesson Code</Label>
                <Input
                  value={form.lessonCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, lessonCode: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Lesson</Label>
                <Input
                  value={form.lesson}
                  onChange={(e) => setForm((prev) => ({ ...prev, lesson: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Objective Code</Label>
              <Input
                value={form.objectiveCode}
                onChange={(e) => setForm((prev) => ({ ...prev, objectiveCode: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Learning Content</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                className="min-h-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="humanities">Humanities</SelectItem>
                  <SelectItem value="science">Science</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
