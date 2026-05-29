"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { type ActivityCard } from "@/contexts/app-data-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { X, MapPin, ImagePlus, Save, MessageSquare, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

interface CardDetailModalProps {
  card: ActivityCard | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: (updates: Partial<ActivityCard>) => void | Promise<void>
  onSaveFeedback?: (feedback: string) => void | Promise<void>
  readOnly?: boolean
  showFeedback?: boolean
}

export function CardDetailModal({
  card,
  isOpen,
  onClose,
  onUpdate,
  onSaveFeedback,
  readOnly = false,
  showFeedback = false,
}: CardDetailModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [activityDate, setActivityDate] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [feedback, setFeedback] = useState("")
  const [initialFeedback, setInitialFeedback] = useState("")
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "success" | "error">("idle")
  const [feedbackMessage, setFeedbackMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const locationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCardIdRef = useRef<string | null>(null)

  // Sync state from selected card before editing
  useEffect(() => {
    if (!card) return
    const isDifferentCard = lastCardIdRef.current !== card.id
    lastCardIdRef.current = card.id

    setTitle(card.title)
    setDescription(card.description)
    setLocation(card.location)
    setActivityDate(card.activityDate || "")
    setImages(card.images)
    const startingFeedback = card.feedback || ""
    setFeedback(startingFeedback)
    setInitialFeedback(startingFeedback)
    setCurrentImageIndex(0)
    setLocationSuggestions([])
    setShowSuggestions(false)
    setSavingFeedback(false)
    if (isDifferentCard) {
      setFeedbackStatus("idle")
      setFeedbackMessage("")
    }
  }, [card])

  useEffect(() => {
    if (readOnly) return
    const q = location.trim()
    if (!q) {
      setLocationSuggestions([])
      setLoadingSuggestions(false)
      return
    }

    if (locationTimerRef.current) clearTimeout(locationTimerRef.current)
    locationTimerRef.current = setTimeout(async () => {
      setLoadingSuggestions(true)
      try {
        const res = await apiFetch(`/api/locations/suggest?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setLocationSuggestions(data.suggestions || [])
      } catch (_error) {
        setLocationSuggestions([])
      } finally {
        setLoadingSuggestions(false)
      }
    }, 280)

    return () => {
      if (locationTimerRef.current) clearTimeout(locationTimerRef.current)
    }
  }, [location, readOnly])

  // Reset state when card changes
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && card) {
        setTitle(card.title)
        setDescription(card.description)
        setLocation(card.location)
        setActivityDate(card.activityDate || "")
        setImages(card.images)
        setFeedback(card.feedback || "")
        setCurrentImageIndex(0)
      }
      if (!open) {
        onClose()
      }
    },
    [card, onClose]
  )

  const handleSave = async () => {
    if (onUpdate && !readOnly) {
      await onUpdate({ title, description, location, activityDate, images })
    }
    onClose()
  }

  const handleSaveFeedback = async () => {
    if (!onSaveFeedback) return
    setSavingFeedback(true)
    setFeedbackStatus("idle")
    setFeedbackMessage("")
    try {
      await onSaveFeedback(feedback)
      setInitialFeedback(feedback)
      setFeedbackStatus("success")
      setFeedbackMessage("Saved successfully.")
    } catch (error) {
      setFeedbackStatus("error")
      setFeedbackMessage(error instanceof Error ? error.message : "Failed to save feedback.")
    } finally {
      setSavingFeedback(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    setUploading(true)
    try {
      const uploadedUrls: string[] = []
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append("image", file)
        const res = await apiFetch("/api/uploads", {
          method: "POST",
          body: formData,
          headers: {},
        })
        const data = await res.json()
        uploadedUrls.push(data.url)
      }
      setImages((prev) => [...prev, ...uploadedUrls])
    } catch (error) {
      console.error("Image upload failed", error)
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ""
    }
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
    if (currentImageIndex >= images.length - 1) {
      setCurrentImageIndex(Math.max(0, images.length - 2))
    }
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  const selectSuggestion = (value: string) => {
    setLocation(value)
    setShowSuggestions(false)
  }

  if (!card) return null
  const isFeedbackDirty = feedback !== initialFeedback

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            Activity Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="card-title" className="text-sm font-medium">
              Title
            </Label>
            {readOnly ? (
              <p className="text-foreground font-medium">{title}</p>
            ) : (
              <Input
                id="card-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Activity title..."
                className="border-border/50"
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="card-description" className="text-sm font-medium">
              Description
            </Label>
            {readOnly ? (
              <p className="text-muted-foreground whitespace-pre-wrap">
                {description || "No description provided"}
              </p>
            ) : (
              <Textarea
                id="card-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this activity..."
                className="min-h-[100px] border-border/50"
              />
            )}
          </div>

          {/* Activity Date */}
          <div className="space-y-2">
            <Label htmlFor="card-date" className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-accent" />
              Activity Date
            </Label>
            {readOnly ? (
              <p className="text-foreground">{activityDate || "No date set"}</p>
            ) : (
              <Input
                id="card-date"
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="border-border/50"
              />
            )}
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="card-location" className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              Location
            </Label>
            {readOnly ? (
              <p className="text-accent">{location || "No location set"}</p>
            ) : (
              <div className="relative">
                <Input
                  id="card-location"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Enter activity location..."
                  className="border-border/50"
                  autoComplete="off"
                />
                {showSuggestions && (loadingSuggestions || locationSuggestions.length > 0) && (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-md">
                    {loadingSuggestions ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Searching locations...</div>
                    ) : (
                      locationSuggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            selectSuggestion(item)
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          {item}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Images */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <ImagePlus className="w-4 h-4" />
              Media
            </Label>

            {images.length > 0 && (
              <div className="relative bg-muted/50 rounded-lg overflow-hidden">
                <div className="aspect-video relative">
                  <img
                    src={images[currentImageIndex]}
                    alt={`Activity image ${currentImageIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {!readOnly && (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => removeImage(currentImageIndex)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="pointer-events-auto"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="pointer-events-auto"
                      onClick={nextImage}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {images.map((_, index) => (
                    <button
                      key={index}
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        index === currentImageIndex ? "bg-primary" : "bg-card/50"
                      )}
                      onClick={() => setCurrentImageIndex(index)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Thumbnail Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-6 gap-2 mt-2">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={cn(
                      "aspect-square rounded-md overflow-hidden border-2 transition-colors",
                      index === currentImageIndex ? "border-primary" : "border-transparent"
                    )}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {!readOnly && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  {uploading ? "Uploading..." : "Click to upload images"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Teacher Feedback */}
          {showFeedback && (
            <div className="space-y-2 p-4 bg-info/10 rounded-lg border border-info/30">
              <Label
                htmlFor="card-feedback"
                className="text-sm font-medium flex items-center gap-2 text-info"
              >
                <MessageSquare className="w-4 h-4" />
                Teacher Feedback
              </Label>
              <Textarea
                id="card-feedback"
                value={feedback}
                onChange={(e) => {
                  setFeedback(e.target.value)
                  if (feedbackStatus !== "idle") {
                    setFeedbackStatus("idle")
                    setFeedbackMessage("")
                  }
                }}
                placeholder="Add your feedback for this activity..."
                className="min-h-[80px] border-info/30 bg-card"
              />
              {isFeedbackDirty && (
                <Button
                  onClick={handleSaveFeedback}
                  disabled={savingFeedback}
                  className="w-full bg-info hover:bg-info/90 text-info-foreground"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {savingFeedback ? "Saving..." : "Save Feedback"}
                </Button>
              )}
              {feedbackStatus !== "idle" && (
                <div
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    feedbackStatus === "success"
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  )}
                >
                  {feedbackMessage}
                </div>
              )}
            </div>
          )}

          {/* Existing Feedback Display (for students) */}
          {!showFeedback && card.feedback && (
            <div className="p-4 bg-success/10 rounded-lg border border-success/30">
              <Label className="text-sm font-medium flex items-center gap-2 text-success mb-2">
                <MessageSquare className="w-4 h-4" />
                Teacher Feedback
              </Label>
              <p className="text-sm text-foreground whitespace-pre-wrap">{card.feedback}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            {!readOnly && onUpdate && (
              <Button onClick={handleSave} className="flex-1 bg-primary hover:bg-primary/90">
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className={cn(!readOnly && onUpdate && "flex-1")}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
