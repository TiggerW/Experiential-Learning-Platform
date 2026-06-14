"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { apiFetch } from "@/lib/api-client"
import { useAuth } from "./auth-context"

export interface LearningObjective {
  id: string
  objectiveCode: string
  content: string
  topicCode?: string
  topic?: string
  lessonCode?: string
  lesson?: string
  contentCode?: string
  description?: string
  category?: string
}

export interface ActivityCard {
  id: string
  title: string
  description: string
  location: string
  activityDate?: string
  images: string[]
  feedback?: string
  createdAt: Date
  checkpointId?: string
  lat?: number
  lng?: number
  recordType?: string
  source?: string
  learningObjectives?: LearningObjective[]
}

export interface Column {
  id: string
  title: string
  cards: ActivityCard[]
  sortOrder?: number
  isFixedStage?: boolean
  stageKey?: string
}

export interface StudentData {
  id: string
  name: string
  columns: Column[]
}

interface AppDataContextType {
  students: StudentData[]
  currentStudentId: string
  setCurrentStudentId: (id: string) => void
  getStudentData: (studentId: string) => StudentData | undefined
  addColumn: (studentId: string, title: string) => Promise<void>
  deleteColumn: (studentId: string, columnId: string) => Promise<void>
  renameColumn: (studentId: string, columnId: string, newTitle: string) => Promise<void>
  reorderColumns: (studentId: string, columns: Column[]) => Promise<void>
  addCard: (studentId: string, columnId: string, card: Omit<ActivityCard, "id" | "createdAt">) => Promise<void>
  updateCard: (studentId: string, columnId: string, cardId: string, updates: Partial<ActivityCard>) => Promise<void>
  deleteCard: (studentId: string, columnId: string, cardId: string) => Promise<void>
  moveCard: (
    studentId: string,
    sourceColumnId: string,
    destColumnId: string,
    sourceIndex: number,
    destIndex: number
  ) => Promise<void>
  addFeedback: (studentId: string, columnId: string, cardId: string, feedback: string) => Promise<void>
  assignCardObjectives: (cardId: string, objectiveIds: string[]) => Promise<void>
  refreshStudentBoard: (studentId: string) => Promise<void>
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined)

const emptyState: StudentData[] = []

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [students, setStudents] = useState<StudentData[]>(emptyState)
  const [currentStudentId, setCurrentStudentId] = useState<string>("1")
  const setCurrentStudentIdWithPersistence = useCallback(
    (id: string) => {
      setCurrentStudentId(id)
      if (user?.role === "teacher") {
        localStorage.setItem(`teacher_current_student_${user.id}`, id)
      }
    },
    [user]
  )

  const fetchBoard = useCallback(async (studentId: string) => {
    const res = await apiFetch(`/api/board/${studentId}`)
    const data = await res.json()
    return (data.columns || []).map((column: any) => ({
      id: column.id,
      title: column.title,
      sortOrder: column.sortOrder,
      isFixedStage: Boolean(column.isFixedStage),
      stageKey: column.stageKey,
      cards: (column.cards || []).map((card: any) => ({
        ...card,
        activityDate: card.activityDate || "",
        createdAt: new Date(card.createdAt),
        learningObjectives: card.learningObjectives || [],
      })),
    }))
  }, [])

  const refreshStudentBoard = useCallback(
    async (studentId: string) => {
      const columns = await fetchBoard(studentId)
      setStudents((prev) =>
        prev.map((student) =>
          student.id === studentId
            ? {
                ...student,
                columns,
              }
            : student
        )
      )
    },
    [fetchBoard]
  )

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setStudents([])
      return
    }

    const bootstrap = async () => {
      const studentsRes = await apiFetch("/api/students")
      const studentList = await studentsRes.json()
      const hydrated = await Promise.all(
        studentList.map(async (student: any) => ({
          id: student.id,
          name: student.name,
          columns: await fetchBoard(student.id),
        }))
      )
      setStudents(hydrated)
      if (user.role === "teacher") {
        const savedStudentId = localStorage.getItem(`teacher_current_student_${user.id}`) || ""
        const hasSavedStudent = hydrated.some((student) => student.id === savedStudentId)
        setCurrentStudentId(hasSavedStudent ? savedStudentId : hydrated[0]?.id || user.id)
      } else {
        setCurrentStudentId(hydrated[0]?.id || user.id)
      }
    }

    bootstrap().catch((error) => {
      console.error("Failed to bootstrap board data", error)
      setStudents([])
    })
  }, [fetchBoard, isAuthenticated, user])

  const getStudentData = useCallback(
    (studentId: string) => {
      return students.find((s) => s.id === studentId)
    },
    [students]
  )

  const addColumn = useCallback(
    async (studentId: string, title: string) => {
      await apiFetch("/api/columns", {
        method: "POST",
        body: JSON.stringify({ studentId, title }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const deleteColumn = useCallback(
    async (studentId: string, columnId: string) => {
      await apiFetch(`/api/columns/${columnId}`, { method: "DELETE" })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const renameColumn = useCallback(
    async (studentId: string, columnId: string, newTitle: string) => {
      await apiFetch(`/api/columns/${columnId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const reorderColumns = useCallback(
    async (studentId: string, columns: Column[]) => {
      await apiFetch("/api/columns/reorder", {
        method: "PATCH",
        body: JSON.stringify({ columnIds: columns.map((c) => c.id), studentId }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const addCard = useCallback(
    async (studentId: string, columnId: string, card: Omit<ActivityCard, "id" | "createdAt">) => {
      await apiFetch("/api/cards", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          columnId,
          title: card.title,
          description: card.description,
          location: card.location,
          activityDate: card.activityDate || "",
          images: card.images,
        }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const updateCard = useCallback(
    async (studentId: string, _columnId: string, cardId: string, updates: Partial<ActivityCard>) => {
      await apiFetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: updates.title ?? "",
          description: updates.description ?? "",
          location: updates.location ?? "",
          activityDate: updates.activityDate ?? "",
          images: updates.images ?? [],
        }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const deleteCard = useCallback(
    async (studentId: string, _columnId: string, cardId: string) => {
      await apiFetch(`/api/cards/${cardId}`, { method: "DELETE" })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const moveCard = useCallback(
    async (
      studentId: string,
      sourceColumnId: string,
      destColumnId: string,
      sourceIndex: number,
      destIndex: number
    ) => {
      const student = students.find((s) => s.id === studentId)
      if (!student) return
      const sourceColumn = student.columns.find((col) => col.id === sourceColumnId)
      const movingCard = sourceColumn?.cards[sourceIndex]
      if (!movingCard) return

      await apiFetch(`/api/cards/${movingCard.id}/move`, {
        method: "PATCH",
        body: JSON.stringify({
          toColumnId: destColumnId,
          toIndex: destIndex,
        }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard, students]
  )

  const addFeedback = useCallback(
    async (studentId: string, _columnId: string, cardId: string, feedback: string) => {
      await apiFetch(`/api/cards/${cardId}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ feedback }),
      })
      await refreshStudentBoard(studentId)
    },
    [refreshStudentBoard]
  )

  const assignCardObjectives = useCallback(
    async (cardId: string, objectiveIds: string[]) => {
      await apiFetch(`/api/cards/${cardId}/objectives`, {
        method: "PATCH",
        body: JSON.stringify({ objectiveIds }),
      })
    },
    []
  )

  return (
    <AppDataContext.Provider
      value={{
        students,
        currentStudentId,
        setCurrentStudentId: setCurrentStudentIdWithPersistence,
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
        assignCardObjectives,
        refreshStudentBoard,
      }}
    >
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (context === undefined) {
    throw new Error("useAppData must be used within an AppDataProvider")
  }
  return context
}
