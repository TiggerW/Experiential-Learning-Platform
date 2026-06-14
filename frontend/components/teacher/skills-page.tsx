"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { useAppData } from "@/contexts/app-data-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Sparkles, Plus, Pencil, Trash2, RefreshCw, Check, X } from "lucide-react"

interface Skill {
  id: string
  name: string
  description: string
}

interface StudentSkillRecord {
  id: string
  skillId: string
  skillName: string
  skillDescription: string
  level: string
  evidence: string
  cardId: string
  cardTitle: string
  status: "suggested" | "confirmed" | "rejected"
  source: "manual" | "inferred"
  inferenceReason: string
}

const LEVELS = [
  { value: "emerging", label: "Emerging" },
  { value: "developing", label: "Developing" },
  { value: "proficient", label: "Proficient" },
  { value: "advanced", label: "Advanced" },
]

export function SkillsPage() {
  const { students, currentStudentId, setCurrentStudentId, getStudentData } = useAppData()
  const [skills, setSkills] = useState<Skill[]>([])
  const [records, setRecords] = useState<StudentSkillRecord[]>([])
  const [message, setMessage] = useState("")
  const [inferring, setInferring] = useState(false)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [skillForm, setSkillForm] = useState({ name: "", description: "" })
  const [recordForm, setRecordForm] = useState({
    skillId: "",
    level: "developing",
    evidence: "",
    cardId: "",
  })

  const studentCards = useMemo(() => {
    const student = getStudentData(currentStudentId)
    if (!student) return []
    return student.columns.flatMap((column) =>
      column.cards.map((card) => ({
        id: card.id,
        title: card.title,
        columnTitle: column.title,
      }))
    )
  }, [currentStudentId, getStudentData])

  const suggestedRecords = useMemo(
    () => records.filter((record) => record.status === "suggested"),
    [records]
  )

  const confirmedRecords = useMemo(
    () => records.filter((record) => record.status === "confirmed"),
    [records]
  )

  const loadSkills = useCallback(async () => {
    const res = await apiFetch("/api/skills")
    const data = await res.json()
    setSkills(data.skills || [])
  }, [])

  const loadRecords = useCallback(async () => {
    if (!currentStudentId) return
    const res = await apiFetch(`/api/students/${currentStudentId}/skills`)
    const data = await res.json()
    setRecords(data.records || [])
  }, [currentStudentId])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  const refreshInference = async () => {
    if (!currentStudentId) return
    setInferring(true)
    try {
      await apiFetch(`/api/students/${currentStudentId}/skills/infer`, { method: "POST" })
      setMessage("已根據學生活動重新推斷技能建議。")
      await loadRecords()
    } finally {
      setInferring(false)
    }
  }

  const confirmRecord = async (record: StudentSkillRecord) => {
    if (!currentStudentId) return
    await apiFetch(`/api/students/${currentStudentId}/skills/${record.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({
        level: record.level,
        evidence: record.evidence,
        cardId: record.cardId || null,
      }),
    })
    setMessage(`已確認「${record.skillName}」技能紀錄。`)
    await loadRecords()
  }

  const rejectRecord = async (recordId: string) => {
    if (!currentStudentId || !confirm("確定要拒絕這項技能建議？")) return
    await apiFetch(`/api/students/${currentStudentId}/skills/${recordId}/reject`, {
      method: "POST",
    })
    setMessage("已拒絕該技能建議。")
    await loadRecords()
  }

  const openCreateSkill = () => {
    setEditingSkillId(null)
    setSkillForm({ name: "", description: "" })
    setSkillDialogOpen(true)
  }

  const openEditSkill = (skill: Skill) => {
    setEditingSkillId(skill.id)
    setSkillForm({ name: skill.name, description: skill.description })
    setSkillDialogOpen(true)
  }

  const saveSkill = async () => {
    if (!skillForm.name.trim()) return
    if (editingSkillId) {
      await apiFetch(`/api/skills/${editingSkillId}`, {
        method: "PATCH",
        body: JSON.stringify(skillForm),
      })
    } else {
      await apiFetch("/api/skills", {
        method: "POST",
        body: JSON.stringify(skillForm),
      })
    }
    setSkillDialogOpen(false)
    await loadSkills()
  }

  const deleteSkill = async (skillId: string) => {
    if (!confirm("Delete this skill?")) return
    await apiFetch(`/api/skills/${skillId}`, { method: "DELETE" })
    await loadSkills()
    await loadRecords()
  }

  const openCreateRecord = () => {
    setEditingRecordId(null)
    setRecordForm({
      skillId: skills[0]?.id || "",
      level: "developing",
      evidence: "",
      cardId: "",
    })
    setRecordDialogOpen(true)
  }

  const openEditRecord = (record: StudentSkillRecord) => {
    setEditingRecordId(record.id)
    setRecordForm({
      skillId: record.skillId,
      level: record.level,
      evidence: record.evidence,
      cardId: record.cardId,
    })
    setRecordDialogOpen(true)
  }

  const saveRecord = async () => {
    if (!currentStudentId || !recordForm.skillId) return
    const payload = {
      skillId: recordForm.skillId,
      level: recordForm.level,
      evidence: recordForm.evidence,
      cardId: recordForm.cardId || null,
    }
    if (editingRecordId) {
      await apiFetch(`/api/students/${currentStudentId}/skills/${editingRecordId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
    } else {
      await apiFetch(`/api/students/${currentStudentId}/skills`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    }
    setRecordDialogOpen(false)
    setMessage("技能紀錄已儲存並確認。")
    await loadRecords()
  }

  const deleteRecord = async (recordId: string) => {
    if (!currentStudentId || !confirm("Remove this skill development record?")) return
    await apiFetch(`/api/students/${currentStudentId}/skills/${recordId}`, { method: "DELETE" })
    await loadRecords()
  }

  const renderRecordCard = (record: StudentSkillRecord, isSuggested = false) => (
    <div
      key={record.id}
      className={`p-4 rounded-lg border space-y-2 ${
        isSuggested
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border/50 bg-muted/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground">{record.skillName}</p>
            {isSuggested ? (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                {record.cardTitle ? `${record.cardTitle} · 系統建議` : "系統建議"}
              </Badge>
            ) : (
              <Badge variant="secondary">
                {record.source === "manual" ? "手動指派" : "已確認"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-primary mt-1 capitalize">Level: {record.level}</p>
        </div>
        <div className="flex gap-1">
          {isSuggested ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                title="確認建議"
                onClick={() => void confirmRecord(record)}
              >
                <Check className="w-4 h-4 text-green-600" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="拒絕建議"
                onClick={() => void rejectRecord(record.id)}
              >
                <X className="w-4 h-4 text-destructive" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => openEditRecord(record)}>
                <Pencil className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" onClick={() => openEditRecord(record)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => void deleteRecord(record.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {record.inferenceReason && isSuggested && (
        <p className="text-xs text-muted-foreground">
          推斷依據：{record.inferenceReason}
        </p>
      )}
      {record.evidence && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.evidence}</p>
      )}
      {record.cardTitle && (
        <p className="text-xs text-accent">Evidence card: {record.cardTitle}</p>
      )}
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Skill Development
        </h2>
        <p className="text-muted-foreground mt-1">
          系統會根據學生活動自動推斷技能，老師確認後才會寫入知識圖譜。
        </p>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Skill Library</CardTitle>
          <Button size="sm" onClick={openCreateSkill}>
            <Plus className="w-4 h-4 mr-2" />
            Add Skill
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-start justify-between gap-3 p-4 rounded-lg border border-border/50"
            >
              <div>
                <p className="font-medium text-foreground">{skill.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEditSkill(skill)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void deleteSkill(skill.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>學生技能紀錄</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Select value={currentStudentId} onValueChange={setCurrentStudentId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshInference()}
              disabled={!currentStudentId || inferring}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${inferring ? "animate-spin" : ""}`} />
              重新推斷
            </Button>
            <Button size="sm" onClick={openCreateRecord} disabled={!skills.length}>
              <Plus className="w-4 h-4 mr-2" />
              手動指派
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              待確認建議 ({suggestedRecords.length})
            </h3>
            {suggestedRecords.map((record) => renderRecordCard(record, true))}
            {!suggestedRecords.length && (
              <p className="text-sm text-muted-foreground">
                目前沒有待確認的技能建議。可按「重新推斷」根據最新活動更新。
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              已確認紀錄 ({confirmedRecords.length})
            </h3>
            {confirmedRecords.map((record) => renderRecordCard(record))}
            {!confirmedRecords.length && (
              <p className="text-sm text-muted-foreground">尚未有已確認的技能紀錄。</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSkillId ? "Edit Skill" : "Add Skill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={skillForm.name}
                onChange={(e) => setSkillForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={skillForm.description}
                onChange={(e) => setSkillForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkillDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveSkill()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRecordId ? "編輯技能紀錄" : "手動指派技能"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Skill</Label>
              <Select
                value={recordForm.skillId}
                onValueChange={(value) => setRecordForm((prev) => ({ ...prev, skillId: value }))}
                disabled={Boolean(editingRecordId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select skill" />
                </SelectTrigger>
                <SelectContent>
                  {skills.map((skill) => (
                    <SelectItem key={skill.id} value={skill.id}>
                      {skill.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select
                value={recordForm.level}
                onValueChange={(value) => setRecordForm((prev) => ({ ...prev, level: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Evidence</Label>
              <Textarea
                value={recordForm.evidence}
                onChange={(e) => setRecordForm((prev) => ({ ...prev, evidence: e.target.value }))}
                placeholder="Describe how the student demonstrated this skill..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Linked Activity Card (optional)</Label>
              <Select
                value={recordForm.cardId || "none"}
                onValueChange={(value) =>
                  setRecordForm((prev) => ({ ...prev, cardId: value === "none" ? "" : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select card" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {studentCards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.title} ({card.columnTitle})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveRecord()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
