"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { useAppData } from "@/contexts/app-data-context"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sparkles, Wand2, ClipboardCopy, CheckCircle2 } from "lucide-react"

type GenerationType = "reflection" | "followup" | "assessment"

interface GeneratedItem {
  id: string
  title: string
  content: string
  kind: string
  options?: string[]
  answerHint?: string
  selected: boolean
}

interface StudioContext {
  card: {
    id: string
    title: string
    description: string
    location: string
    stageKey: string
    columnTitle: string
    recordType: string
  }
  student: {
    name: string
    className: string
  }
  objectives: Array<{
    id: string
    objectiveCode: string
    content: string
    category: string
  }>
  skills: Array<{
    name: string
    level: string
  }>
}

const GENERATION_OPTIONS: Array<{ value: GenerationType; label: string; description: string }> = [
  {
    value: "reflection",
    label: "反思引導題",
    description: "為 Post Trip 活動生成引導反思問題",
  },
  {
    value: "followup",
    label: "延伸活動建議",
    description: "根據參觀紀錄建議延伸學習任務",
  },
  {
    value: "assessment",
    label: "小測驗 / 評估題",
    description: "對齊學習重點生成選擇題與短答題",
  },
]

export function ContentStudioPage() {
  const { students, currentStudentId, setCurrentStudentId, getStudentData, refreshStudentBoard } =
    useAppData()
  const [selectedCardId, setSelectedCardId] = useState("")
  const [generationType, setGenerationType] = useState<GenerationType>("reflection")
  const [difficulty, setDifficulty] = useState("p4")
  const [count, setCount] = useState("5")
  const [studioContext, setStudioContext] = useState<StudioContext | null>(null)
  const [summary, setSummary] = useState("")
  const [items, setItems] = useState<GeneratedItem[]>([])
  const [message, setMessage] = useState("")
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)

  const studentCards = useMemo(() => {
    const student = getStudentData(currentStudentId)
    if (!student) return []
    return student.columns.flatMap((column) =>
      column.cards.map((card) => ({
        id: card.id,
        title: card.title,
        columnTitle: column.title,
        stageKey: column.stageKey || "",
        description: card.description,
        learningObjectives: card.learningObjectives || [],
      }))
    )
  }, [currentStudentId, getStudentData])

  const selectedCard = useMemo(
    () => studentCards.find((card) => card.id === selectedCardId),
    [studentCards, selectedCardId]
  )

  const loadContext = useCallback(async () => {
    if (!currentStudentId || !selectedCardId) {
      setStudioContext(null)
      return
    }
    setLoadingContext(true)
    try {
      const res = await apiFetch(
        `/api/content-studio/context?studentId=${currentStudentId}&cardId=${selectedCardId}`
      )
      const data = await res.json()
      setStudioContext(data)
    } catch (error) {
      setStudioContext(null)
      setMessage(error instanceof Error ? error.message : "Failed to load card context")
    } finally {
      setLoadingContext(false)
    }
  }, [currentStudentId, selectedCardId])

  useEffect(() => {
    if (!selectedCardId && studentCards.length) {
      setSelectedCardId(studentCards[0].id)
    }
  }, [studentCards, selectedCardId])

  useEffect(() => {
    loadContext()
  }, [loadContext])

  const handleGenerate = async () => {
    if (!currentStudentId || !selectedCardId) return
    setGenerating(true)
    setMessage("")
    try {
      const res = await apiFetch("/api/ai/generate-content", {
        method: "POST",
        body: JSON.stringify({
          studentId: Number(currentStudentId),
          cardId: Number(selectedCardId),
          type: generationType,
          options: {
            count: Number(count),
            difficulty,
          },
        }),
      })
      const data = await res.json()
      setSummary(data.summary || "")
      setItems((data.items || []).map((item: GeneratedItem) => ({ ...item, selected: true })))
      setMessage("內容已生成，請預覽並勾選要套用的項目。")
    } catch (error) {
      setItems([])
      setSummary("")
      setMessage(error instanceof Error ? error.message : "Failed to generate content")
    } finally {
      setGenerating(false)
    }
  }

  const handleApply = async () => {
    if (!currentStudentId || !selectedCardId || !items.some((item) => item.selected)) return
    setApplying(true)
    setMessage("")
    try {
      const res = await apiFetch("/api/ai/apply-generated-content", {
        method: "POST",
        body: JSON.stringify({
          studentId: Number(currentStudentId),
          cardId: Number(selectedCardId),
          type: generationType,
          items,
          applyMode: generationType === "reflection" ? "append_to_card" : "create_card",
        }),
      })
      const data = await res.json()
      await refreshStudentBoard(currentStudentId)
      await loadContext()
      setMessage(data.message || "已成功套用到 Activity Board。")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to apply content")
    } finally {
      setApplying(false)
    }
  }

  const handleCopy = async () => {
    const selected = items.filter((item) => item.selected)
    if (!selected.length) return
    const text = selected
      .map((item, index) => {
        const lines = [`${index + 1}. ${item.title}`, item.content]
        if (item.options?.length) {
          lines.push(item.options.map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`).join("\n"))
        }
        if (item.answerHint) lines.push(`答案要點：${item.answerHint}`)
        return lines.join("\n")
      })
      .join("\n\n")
    await navigator.clipboard.writeText(text)
    setMessage("已複製選取內容到剪貼簿。")
  }

  const toggleItem = (id: string, checked: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, selected: checked } : item)))
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/20 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Content Studio</h1>
            <p className="text-sm text-muted-foreground">
              半自動生成學習內容與評估題，結合 Neo4j Graph RAG、學習重點與學生活動紀錄。
            </p>
          </div>
          <Badge variant="secondary" className="w-fit gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Graph RAG Powered
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">① 選擇來源</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>學生</Label>
                <Select value={currentStudentId} onValueChange={setCurrentStudentId}>
                  <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>活動 Card</Label>
                <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select activity card" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        [{card.columnTitle}] {card.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingContext ? (
                <p className="text-sm text-muted-foreground">載入圖譜脈絡中...</p>
              ) : studioContext ? (
                <div className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">地點</p>
                    <p className="text-sm font-medium">{studioContext.card.location || studioContext.card.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">欄位</p>
                    <p className="text-sm">{studioContext.card.columnTitle}</p>
                  </div>
                  {studioContext.objectives.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">學習重點</p>
                      <div className="flex flex-wrap gap-1">
                        {studioContext.objectives.slice(0, 4).map((objective) => (
                          <Badge key={objective.id} variant="outline" className="text-[10px]">
                            {objective.objectiveCode}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {studioContext.skills.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">已確認技能</p>
                      <div className="flex flex-wrap gap-1">
                        {studioContext.skills.map((skill) => (
                          <Badge key={skill.name} variant="secondary" className="text-[10px]">
                            {skill.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedCard?.description && (
                    <div>
                      <p className="text-xs text-muted-foreground">現有描述（節錄）</p>
                      <p className="line-clamp-4 text-xs text-muted-foreground whitespace-pre-wrap">
                        {selectedCard.description}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">請選擇學生與活動 card。</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">② 生成設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>生成類型</Label>
                <div className="space-y-2">
                  {GENERATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGenerationType(option.value)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        generationType === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>難度</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">基礎</SelectItem>
                      <SelectItem value="p4">小四程度</SelectItem>
                      <SelectItem value="advanced">進階</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>數量</Label>
                  <Select value={count} onValueChange={setCount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 項</SelectItem>
                      <SelectItem value="5">5 項</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={generating || !selectedCardId}
              >
                <Wand2 className="h-4 w-4" />
                {generating ? "生成中..." : "生成內容"}
              </Button>

              <p className="text-xs text-muted-foreground">
                {generationType === "reflection"
                  ? "套用方式：將選取內容附加到現有 card 描述。"
                  : "套用方式：建立新 card 至 Pretrip 或 Post Trip（評估題）。"}
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">③ 預覽與套用</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary && (
                <div className="rounded-lg border border-border/60 bg-background p-3">
                  <p className="text-xs text-muted-foreground mb-1">摘要</p>
                  <p className="text-sm whitespace-pre-wrap">{summary}</p>
                </div>
              )}

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚未生成內容。請先選擇 card 並按「生成內容」。</p>
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/60 bg-background p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{item.content}</p>
                          {item.options?.length ? (
                            <div className="mt-2 space-y-1">
                              {item.options.map((option, index) => (
                                <p key={option} className="text-xs text-muted-foreground">
                                  {String.fromCharCode(65 + index)}. {option}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          {item.answerHint ? (
                            <p className="text-xs text-primary mt-2">答案要點：{item.answerHint}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  className="gap-2"
                  onClick={handleApply}
                  disabled={applying || !items.some((item) => item.selected)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {applying ? "套用中..." : "套用到 Activity Board"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleCopy}
                  disabled={!items.some((item) => item.selected)}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  複製選取內容
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {message && (
          <div className="rounded-lg border border-border/60 bg-card px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
