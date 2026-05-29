"use client"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { X, Send, Bot, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
}

const studentInitialMessages: Message[] = [
  {
    id: "1",
    content: "你好！我是 EduBot，可以協助你規劃活動、整理學習進度，或解讀 Activity Board 的功能。你想先問什麼？",
    role: "assistant",
    timestamp: new Date(),
  },
]

const teacherInitialMessages: Message[] = [
  {
    id: "1",
    content:
      "Hello! I'm EduBot. I can help you review your assigned students' activities, summarize field trips, and suggest follow-up learning tasks. What would you like to ask?",
    role: "assistant",
    timestamp: new Date(),
  },
]

const studentFallbackFirstQuickReply = "我而家應該先做邊一張卡？"
const teacherFallbackFirstQuickReply = "Summarize the field trips we completed this week"
const studentBaseQuickReplies = [
  "點樣將大任務拆細做？",
  "老師回饋可以喺邊度睇？",
  "點樣加地點先可以喺地圖見到？",
]
const teacherBaseQuickReplies = [
  "Which student needs follow-up support?",
  "Recommend a follow-up after a museum visit",
  "Who has not completed reflection yet?",
]

function stripMarkdownForDisplay(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
}

export function AIChatbot() {
  const { user } = useAuth()
  const isTeacher = user?.role === "teacher"
  const initialMessages = isTeacher ? teacherInitialMessages : studentInitialMessages
  const fallbackFirstQuickReply = isTeacher ? teacherFallbackFirstQuickReply : studentFallbackFirstQuickReply
  const baseQuickReplies = isTeacher ? teacherBaseQuickReplies : studentBaseQuickReplies
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [quickReplies, setQuickReplies] = useState<string[]>([
    fallbackFirstQuickReply,
    ...baseQuickReplies,
  ])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const loadHistory = async () => {
      setIsLoadingHistory(true)
      try {
        const res = await apiFetch("/api/ai/chat/history")
        const data = await res.json()
        const history = Array.isArray(data?.messages)
          ? data.messages
              .map((msg: { id?: string; role?: string; content?: string; timestamp?: string }) => ({
                id: String(msg.id || `${msg.role || "msg"}-${Date.now()}-${Math.random()}`),
                role: msg.role === "assistant" ? "assistant" : "user",
                content: String(msg.content || ""),
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              }))
              .filter((msg: Message) => msg.content.trim().length > 0)
          : []

        if (cancelled) return
        if (history.length > 0) {
          setMessages(history)
        } else {
          setMessages(initialMessages)
          setQuickReplies([fallbackFirstQuickReply, ...baseQuickReplies])
        }
      } catch (_error) {
        if (!cancelled) {
          setMessages(initialMessages)
          setQuickReplies([fallbackFirstQuickReply, ...baseQuickReplies])
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.role])

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: content.trim(),
      role: "user",
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsTyping(true)

    try {
      const historyForApi = [...messages, userMessage].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
      const res = await apiFetch("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: historyForApi }),
      })
      const data = await res.json()
      const replyText = String(data?.reply || "").trim()
      const nextQuestion = String(data?.nextQuestion || "").trim()
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content: replyText || "抱歉，我暫時無法回覆，請稍後再試一次。",
        role: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
      setQuickReplies([nextQuestion || fallbackFirstQuickReply, ...baseQuickReplies])
    } catch (error) {
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        content: error instanceof Error ? `AI 服務錯誤：${error.message}` : "AI 服務錯誤，請稍後再試。",
        role: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void handleSendMessage(inputValue)
  }

  if (!user) return null

  return (
    <>
      {/* Floating Action Button */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 transition-all",
          isOpen && "scale-0 opacity-0"
        )}
      >
        <Button
          onClick={() => setIsOpen(true)}
          className="relative h-20 w-20 overflow-hidden rounded-full p-0 shadow-lg border-2 border-primary/30 bg-gradient-to-br from-sky-100 to-indigo-100 hover:from-sky-200 hover:to-indigo-200"
          size="icon"
        >
          <span className="sr-only">Open AI Assistant</span>
          <span className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
          <span className="relative block h-full w-full overflow-hidden rounded-full bg-white p-1.5">
            <img
              src="/chatbot-icon.gif"
              alt="Chat bot icon"
              className="block h-full w-full object-cover"
            />
          </span>
        </Button>
      </div>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out",
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        <Card className="w-[92vw] max-w-[420px] h-[70vh] max-h-[680px] md:w-[33vw] md:max-w-none flex flex-col shadow-2xl border-2 border-primary/20 overflow-hidden">
          {/* Header */}
          <CardHeader className="pb-3 pt-4 px-4 bg-primary">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-primary-foreground">
                    EduBot
                  </CardTitle>
                  <p className="text-xs text-primary-foreground/70">Your AI Learning Assistant</p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-5 h-5" />
                <span className="sr-only">Close chat</span>
              </Button>
            </div>
          </CardHeader>

          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
            {isLoadingHistory && (
              <div className="text-xs text-muted-foreground">正在載入之前對話...</div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {message.role === "assistant"
                    ? stripMarkdownForDisplay(message.content)
                    : message.content}
                </div>
                {message.role === "user" && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2 justify-start">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                    <span
                      className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <span
                      className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          {/* Quick Replies */}
          <div className="px-4 py-2 border-t border-border/30 bg-muted/30">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {quickReplies.map((reply) => (
                <Button
                  key={reply}
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 text-xs h-7 rounded-full border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  onClick={() => void handleSendMessage(reply)}
                >
                  {reply}
                </Button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-border/30 bg-card"
          >
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 border-border/50 focus:border-primary"
                disabled={isTyping}
              />
              <Button
                type="submit"
                size="icon"
                className="bg-primary hover:bg-primary/90"
                disabled={!inputValue.trim() || isTyping}
              >
                <Send className="w-4 h-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </form>
        </Card>
      </div>

    </>
  )
}
