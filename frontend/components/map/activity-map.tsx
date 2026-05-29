"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { useAppData, type ActivityCard } from "@/contexts/app-data-context"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { MapPin, ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

// Dynamic import for Leaflet to avoid SSR issues
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
)

const HONG_KONG_CENTER: [number, number] = [22.3193, 114.1694]

interface MapMarker {
  id: string
  card: ActivityCard
  columnId: string
  position: [number, number]
  studentId: string
  studentName: string
}

interface ActivityDetailPanelProps {
  marker: MapMarker | null
  onClose?: () => void
  className?: string
}

function ActivityDetailPanel({ marker, onClose, className }: ActivityDetailPanelProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useEffect(() => {
    setCurrentImageIndex(0)
  }, [marker?.id])

  if (!marker) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground p-8", className)}>
        <div className="text-center">
          <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Select a marker</p>
          <p className="text-sm">Click on a map pin to view activity details</p>
        </div>
      </div>
    )
  }

  const { card } = marker
  const images = card.images || []

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {onClose && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 z-10 md:hidden"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      )}

      <div className="p-4 border-b border-border/30">
        <span className="text-xs text-muted-foreground">Student: {marker.studentName}</span>
        <h3 className="text-lg font-bold text-foreground mt-1">{card.title}</h3>
        <div className="flex items-center gap-1 mt-1 text-sm text-accent">
          <MapPin className="w-4 h-4" />
          <span>{card.location}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Image Carousel */}
        {images.length > 0 ? (
          <div className="relative bg-muted rounded-lg overflow-hidden">
            <div className="aspect-video relative">
              <img
                src={images[currentImageIndex]}
                alt={`Activity image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <>
                <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="pointer-events-auto h-8 w-8"
                    onClick={prevImage}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="pointer-events-auto h-8 w-8"
                    onClick={nextImage}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
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
              </>
            )}
          </div>
        ) : null}

        {/* Description */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-1">Description</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {card.description || "No description provided"}
          </p>
        </div>

        {/* Feedback */}
        {card.feedback && (
          <Card className="bg-success/10 border-success/30">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm text-success">Teacher Feedback</CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-3">
              <p className="text-sm text-foreground whitespace-pre-wrap">{card.feedback}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// Leaflet CSS needs to be imported client-side
function LeafletStyles() {
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
    link.crossOrigin = ""
    document.head.appendChild(link)

    return () => {
      document.head.removeChild(link)
    }
  }, [])

  return null
}

export function ActivityMap() {
  const { user } = useAuth()
  const { students, currentStudentId, setCurrentStudentId } = useAppData()
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [locationCoordinates, setLocationCoordinates] = useState<Record<string, [number, number]>>({})

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Get markers based on role
  const locationCards = useMemo(() => {
    const result: MapMarker[] = []

    const studentsToShow =
      user?.role === "student"
        ? students.filter((s) => s.id === user.id)
        : user?.role === "teacher"
          ? students.filter((s) => s.id === currentStudentId)
          : students

    studentsToShow.forEach((student) => {
      student.columns.forEach((column) => {
        column.cards.forEach((card) => {
          if (card.location) {
            result.push({
              id: card.id,
              card,
              columnId: column.id,
              position: HONG_KONG_CENTER,
              studentId: student.id,
              studentName: student.name,
            })
          }
        })
      })
    })

    return result.filter((x) => x.card.location)
  }, [students, user, currentStudentId])

  useEffect(() => {
    const uniqueLocations = [...new Set(locationCards.map((item) => item.card.location).filter(Boolean))]
    if (uniqueLocations.length === 0) {
      setLocationCoordinates({})
      return
    }

    const fetchCoordinates = async () => {
      try {
        const res = await apiFetch("/api/locations/geocode", {
          method: "POST",
          body: JSON.stringify({ locations: uniqueLocations }),
        })
        const data = await res.json()
        setLocationCoordinates(data.coordinates || {})
      } catch (_error) {
        setLocationCoordinates({})
      }
    }

    fetchCoordinates()
  }, [locationCards])

  const markers = useMemo(
    () =>
      locationCards
        .map((item) => {
          const position = locationCoordinates[item.card.location]
          if (!position) return null
          return { ...item, position }
        })
        .filter((x): x is MapMarker => x !== null),
    [locationCards, locationCoordinates]
  )

  const handleMarkerClick = (marker: MapMarker) => {
    setSelectedMarker(marker)
    // On mobile, open the sheet
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSheetOpen(true)
    }
  }

  // Calculate center based on markers or default
  const bounds = useMemo(() => {
    if (markers.length === 0) return null
    const lats = markers.map((m) => m.position[0])
    const lngs = markers.map((m) => m.position[1])
    const south = Math.min(...lats)
    const north = Math.max(...lats)
    const west = Math.min(...lngs)
    const east = Math.max(...lngs)
    return [
      [south, west],
      [north, east],
    ] as [[number, number], [number, number]]
  }, [markers])

  if (!isMounted) {
    return (
      <div className="h-full flex items-center justify-center bg-muted">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">Loading map...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <LeafletStyles />
      
      {/* Header */}
      <div className="relative z-[1001] px-4 py-3 border-b border-border/30 bg-card/50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Activity Map</h2>
          <p className="text-sm text-muted-foreground">
            {markers.length} location{markers.length !== 1 ? "s" : ""} on map
          </p>
        </div>
        {user?.role === "teacher" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Select Student:</span>
            <Select value={currentStudentId} onValueChange={setCurrentStudentId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent className="z-[1200]">
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Main Content - Dual Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Desktop Only */}
        <div className="hidden md:block w-1/3 border-r border-border/30 bg-card overflow-hidden">
          <ActivityDetailPanel marker={selectedMarker} />
        </div>

        {/* Map */}
        <div className="relative z-0 flex-1">
          <MapContainer
            center={HONG_KONG_CENTER}
            zoom={11}
            bounds={bounds || undefined}
            boundsOptions={{ padding: [40, 40] }}
            className="h-full w-full"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            {markers.map((marker) => (
              <Marker
                key={marker.id}
                position={marker.position}
                eventHandlers={{
                  click: () => handleMarkerClick(marker),
                }}
              >
                <Popup>
                  <div className="min-w-[150px]">
                    <p className="font-semibold text-foreground">{marker.card.title}</p>
                    <p className="text-xs text-muted-foreground">{marker.card.location}</p>
                    <p className="text-xs text-accent mt-1">
                      Student: {marker.studentName}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Mobile Hint */}
          {!selectedMarker && (
            <div className="md:hidden absolute bottom-4 left-4 right-4">
              <Card className="bg-card/95 backdrop-blur">
                <CardContent className="p-3 text-center text-sm text-muted-foreground">
                  Tap a marker to view activity details
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Activity Details</SheetTitle>
          </SheetHeader>
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mt-2 mb-2" />
          <ActivityDetailPanel
            marker={selectedMarker}
            onClose={() => setIsSheetOpen(false)}
            className="h-[calc(70vh-1rem)]"
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
