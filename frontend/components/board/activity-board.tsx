"use client"

import { useState, useCallback } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import { useAppData, type Column, type ActivityCard } from "@/contexts/app-data-context"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, GripVertical, MapPin, Pencil, X, Check, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"
import { CardDetailModal } from "./card-detail-modal"

interface StudentBoardProps {
  readOnly?: boolean
  studentId: string
  onCardSelect?: (card: ActivityCard, columnId: string) => void
}

function StudentBoard({ readOnly = false, studentId, onCardSelect }: StudentBoardProps) {
  const {
    getStudentData,
    addColumn,
    deleteColumn,
    renameColumn,
    reorderColumns,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    addFeedback,
  } = useAppData()
  const { user } = useAuth()

  const [isAddingColumn, setIsAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState("")
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editingColumnTitle, setEditingColumnTitle] = useState("")
  const [selectedCard, setSelectedCard] = useState<{
    card: ActivityCard
    columnId: string
  } | null>(null)

  const studentData = getStudentData(studentId)

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (readOnly || !studentData) return

      const { destination, source, type } = result

      if (!destination) return
      if (destination.droppableId === source.droppableId && destination.index === source.index) {
        return
      }

      if (type === "column") {
        const newColumns = Array.from(studentData.columns)
        const [removed] = newColumns.splice(source.index, 1)
        newColumns.splice(destination.index, 0, removed)
        void reorderColumns(studentId, newColumns)
        return
      }

      // Moving cards
      void moveCard(studentId, source.droppableId, destination.droppableId, source.index, destination.index)
    },
    [readOnly, studentData, studentId, reorderColumns, moveCard]
  )

  const handleAddColumn = () => {
    if (newColumnTitle.trim()) {
      void addColumn(studentId, newColumnTitle.trim())
      setNewColumnTitle("")
      setIsAddingColumn(false)
    }
  }

  const handleStartEditColumn = (column: Column) => {
    setEditingColumnId(column.id)
    setEditingColumnTitle(column.title)
  }

  const handleSaveColumnTitle = () => {
    if (editingColumnId && editingColumnTitle.trim()) {
      void renameColumn(studentId, editingColumnId, editingColumnTitle.trim())
    }
    setEditingColumnId(null)
    setEditingColumnTitle("")
  }

  const handleAddCard = (columnId: string) => {
    void addCard(studentId, columnId, {
      title: "New Activity",
      description: "",
      location: "",
      activityDate: new Date().toISOString().slice(0, 10),
      images: [],
    })
  }

  const handleCardClick = (card: ActivityCard, columnId: string) => {
    setSelectedCard({ card, columnId })
    onCardSelect?.(card, columnId)
  }

  const handleUpdateCard = (updates: Partial<ActivityCard>) => {
    if (selectedCard) {
      void updateCard(studentId, selectedCard.columnId, selectedCard.card.id, updates)
      setSelectedCard({
        ...selectedCard,
        card: { ...selectedCard.card, ...updates },
      })
    }
  }

  const handleSaveFeedback = async (feedback: string) => {
    if (!selectedCard) return
    await addFeedback(studentId, selectedCard.columnId, selectedCard.card.id, feedback)
    setSelectedCard((prev) =>
      prev
        ? {
            ...prev,
            card: { ...prev.card, feedback },
          }
        : prev
    )
  }

  if (!studentData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No student data found
      </div>
    )
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="board" type="column" direction="horizontal" isDropDisabled={readOnly}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex gap-4 p-4 overflow-x-auto h-full items-start"
            >
              {studentData.columns.map((column, index) => (
                <Draggable
                  key={column.id}
                  draggableId={column.id}
                  index={index}
                  isDragDisabled={readOnly}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={cn(
                        "flex-shrink-0 w-80 bg-muted/50 rounded-xl border border-border/50 flex flex-col max-h-[calc(100vh-12rem)]",
                        snapshot.isDragging && "shadow-lg ring-2 ring-primary/30"
                      )}
                    >
                      {/* Column Header */}
                      <div className="p-3 border-b border-border/30 flex items-center gap-2">
                        {!readOnly && (
                          <div {...provided.dragHandleProps} className="cursor-grab">
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        
                        {editingColumnId === column.id && !readOnly ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Input
                              value={editingColumnTitle}
                              onChange={(e) => setEditingColumnTitle(e.target.value)}
                              className="h-8 text-sm font-semibold"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveColumnTitle()
                                if (e.key === "Escape") setEditingColumnId(null)
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={handleSaveColumnTitle}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditingColumnId(null)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-semibold text-foreground flex-1">{column.title}</h3>
                            <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                              {column.cards.length}
                            </span>
                            {!readOnly && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleStartEditColumn(column)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => void deleteColumn(studentId, column.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {/* Cards */}
                      <Droppable droppableId={column.id} type="card" isDropDisabled={readOnly}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={cn(
                              "flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]",
                              snapshot.isDraggingOver && "bg-primary/5"
                            )}
                          >
                            {column.cards.map((card, cardIndex) => (
                              <Draggable
                                key={card.id}
                                draggableId={card.id}
                                index={cardIndex}
                                isDragDisabled={readOnly}
                              >
                                {(provided, snapshot) => (
                                  <Card
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={cn(
                                      "cursor-pointer hover:shadow-md transition-all border-border/50 py-2 gap-2",
                                      snapshot.isDragging && "shadow-lg ring-2 ring-primary/30",
                                      readOnly && "cursor-default"
                                    )}
                                    onClick={() => handleCardClick(card, column.id)}
                                  >
                                    <CardContent className="px-3 py-1.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-medium text-sm text-foreground line-clamp-2">
                                          {card.title}
                                        </h4>
                                        {!readOnly && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 -mt-1 -mr-1 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              void deleteCard(studentId, column.id, card.id)
                                            }}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                      {card.images.length > 0 && (
                                        <div className="mt-2 mb-2 overflow-hidden rounded-md border border-border/40 bg-muted/30">
                                          <img
                                            src={card.images[0]}
                                            alt={card.title}
                                            className="h-28 w-full object-cover"
                                          />
                                        </div>
                                      )}
                                      {card.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                          {card.description}
                                        </p>
                                      )}
                                      {card.location && (
                                        <div className="flex items-center gap-1 mt-2 text-xs text-accent">
                                          <MapPin className="w-3 h-3" />
                                          <span className="truncate">{card.location}</span>
                                        </div>
                                      )}
                                      {card.feedback && (
                                        <div className="mt-2 p-2 bg-success/10 rounded-md text-xs text-success">
                                          Feedback received
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>

                      {/* Add Card Button */}
                      {!readOnly && (
                        <div className="p-2 border-t border-border/30">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                            onClick={() => handleAddCard(column.id)}
                          >
                            <Plus className="w-4 h-4" />
                            Add Card
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}

              {/* Add Column */}
              {!readOnly && (
                <div className="flex-shrink-0 w-80">
                  {isAddingColumn ? (
                    <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
                      <CardContent className="p-3 space-y-2">
                        <Input
                          placeholder="Column title..."
                          value={newColumnTitle}
                          onChange={(e) => setNewColumnTitle(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddColumn()
                            if (e.key === "Escape") setIsAddingColumn(false)
                          }}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleAddColumn}
                            className="flex-1"
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsAddingColumn(false)
                              setNewColumnTitle("")
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full h-12 border-dashed border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary"
                      onClick={() => setIsAddingColumn(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Column
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Card Detail Modal */}
      <CardDetailModal
        card={selectedCard?.card ?? null}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdate={readOnly && user?.role !== "teacher" ? undefined : handleUpdateCard}
        onSaveFeedback={user?.role === "teacher" ? handleSaveFeedback : undefined}
        readOnly={readOnly && user?.role !== "teacher"}
        showFeedback={user?.role === "teacher"}
      />
    </>
  )
}

// Student View Component
function StudentView() {
  const { user } = useAuth()
  
  return (
    <div className="h-full">
      <div className="px-4 py-3 border-b border-border/30 bg-card/50">
        <h2 className="text-lg font-semibold text-foreground">My Activity Board</h2>
        <p className="text-sm text-muted-foreground">
          Drag and drop to organize your activities
        </p>
      </div>
      <StudentBoard studentId={user?.id ?? "1"} />
    </div>
  )
}

// Teacher View Component
function TeacherView() {
  const { students, currentStudentId, setCurrentStudentId } = useAppData()
  const [profileOpen, setProfileOpen] = useState(false)
  const [studentName, setStudentName] = useState("")
  const [studentSchool, setStudentSchool] = useState("")
  const [studentClassName, setStudentClassName] = useState("")
  const [studentBio, setStudentBio] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState("")

  const loadStudentProfile = useCallback(async () => {
    if (!currentStudentId) return
    try {
      setProfileMessage("")
      const res = await apiFetch(`/api/students/${currentStudentId}/profile`)
      const data = await res.json()
      setStudentName(data.name || "")
      setStudentSchool(data.school || "")
      setStudentClassName(data.className || "")
      setStudentBio(data.bio || "")
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Failed to load student profile")
    }
  }, [currentStudentId])

  const handleOpenProfile = useCallback(async () => {
    setProfileOpen(true)
    await loadStudentProfile()
  }, [loadStudentProfile])

  const handleSaveStudentProfile = useCallback(async () => {
    if (!currentStudentId) return
    try {
      setSavingProfile(true)
      setProfileMessage("")
      await apiFetch(`/api/students/${currentStudentId}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: studentName,
          school: studentSchool,
          className: studentClassName,
          bio: studentBio,
        }),
      })
      setProfileMessage("Saved successfully.")
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Failed to save student profile")
    } finally {
      setSavingProfile(false)
    }
  }, [currentStudentId, studentName, studentSchool, studentClassName, studentBio])

  return (
    <div className="h-full">
      <div className="px-4 py-3 border-b border-border/30 bg-card/50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Student Review</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Eye className="w-4 h-4" />
            Read-only mode - Click cards to add feedback
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Select Student:</span>
          <Select value={currentStudentId} onValueChange={setCurrentStudentId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select a student" />
            </SelectTrigger>
            <SelectContent>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void handleOpenProfile()} disabled={!currentStudentId}>
            Edit Student Profile
          </Button>
        </div>
      </div>
      <StudentBoard studentId={currentStudentId} readOnly />

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>School / Organization</Label>
              <Input value={studentSchool} onChange={(e) => setStudentSchool(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Input value={studentClassName} onChange={(e) => setStudentClassName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea value={studentBio} onChange={(e) => setStudentBio(e.target.value)} className="min-h-[88px]" />
            </div>
            {profileMessage && (
              <p className={cn("text-sm", profileMessage === "Saved successfully." ? "text-success" : "text-destructive")}>
                {profileMessage}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)} disabled={savingProfile}>
              Close
            </Button>
            <Button onClick={() => void handleSaveStudentProfile()} disabled={savingProfile || !studentName.trim()}>
              {savingProfile ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Admin View Component
function AdminView() {
  const { students } = useAppData()

  const totalStudents = students.length
  const totalActivities = students.reduce(
    (acc, student) => acc + student.columns.reduce((a, col) => a + col.cards.length, 0),
    0
  )
  const totalLocations = new Set(
    students.flatMap((s) =>
      s.columns.flatMap((c) => c.cards.filter((card) => card.location).map((card) => card.location))
    )
  ).size

  const stats = [
    {
      title: "Total Students",
      value: totalStudents,
      color: "bg-primary/10 text-primary border-primary/20",
    },
    {
      title: "Active Activities",
      value: totalActivities,
      color: "bg-accent/10 text-accent border-accent/20",
    },
    {
      title: "Location Tags",
      value: totalLocations,
      color: "bg-success/10 text-success border-success/20",
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Admin Dashboard</h2>
        <p className="text-muted-foreground">Overview of platform activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className={cn("border-2", stat.color)}>
            <CardHeader className="pb-2">
              <span className="text-sm font-medium">{stat.title}</span>
            </CardHeader>
            <CardContent>
              <span className="text-4xl font-bold">{stat.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Student Activity Summary</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {students.map((student) => {
              const cardCount = student.columns.reduce((a, c) => a + c.cards.length, 0)
              return (
                <div
                  key={student.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <span className="font-medium">{student.name}</span>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{student.columns.length} columns</span>
                    <span>{cardCount} activities</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Main Activity Board Component
export function ActivityBoard() {
  const { user } = useAuth()

  if (!user) return null

  switch (user.role) {
    case "student":
      return <StudentView />
    case "teacher":
      return <TeacherView />
    case "admin":
      return <AdminView />
    default:
      return null
  }
}
