"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  LucideIcon,
  GemIcon,
  BotIcon,
  BookOpenIcon,
  MicIcon,
  PaletteIcon,
  PhoneIcon,
  UsersIcon,
} from "lucide-react"

interface Feature {
  icon: LucideIcon
  label: string
  description: string
}

interface PremiumFeatureOverlayProps {
  children: React.ReactNode

  // Copy / config
  title?: string
  description?: string
  requiredLabel?: string // ex: "Growth", "Enterprise", "Add-on"
  ctaLabel?: string

  // Behavior
  onContactSales?: () => void
}

const defaultFeatures: Feature[] = [
  { icon: BotIcon, label: "AI Customer Support", description: "Intelligent automated responses 24/7" },
  { icon: BookOpenIcon, label: "Knowledge Base", description: "Train AI on your documentation" },
  { icon: MicIcon, label: "AI Voice Agent", description: "Natural voice conversations with customers" },
  { icon: PhoneIcon, label: "Phone System", description: "Inbound & outbound calling capabilities" },
  { icon: UsersIcon, label: "Team Access", description: "More operators & routing options" },
  { icon: PaletteIcon, label: "Widget Customization", description: "Branding, themes and advanced promos" },
]

export const PremiumFeatureOverlay = ({
  children,
  title = "Feature Locked",
  description = "This feature is not enabled for your organization.",
  requiredLabel = "Contact Sales",
  ctaLabel = "Contact Sales",
  onContactSales,
}: PremiumFeatureOverlayProps) => {
  const router = useRouter()

  const handleContact = () => {
    if (onContactSales) return onContactSales()
    // fallback: redirect to your demo/contact page
    router.push("/contact")
  }

  return (
    <div className="relative min-h-screen">
      {/* Blurred background content */}
      <div className="pointer-events-none select-none blur-[2px]">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Prompt */}
      <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center">
              <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full border bg-muted">
                <GemIcon className="size-6 text-muted-foreground" />
              </div>
            </div>

            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="mt-1">
              {description}
            </CardDescription>

            <div className="mt-3 text-xs text-muted-foreground">
              Required: <span className="font-medium text-foreground">{requiredLabel}</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-4">
              {defaultFeatures.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg border bg-muted">
                    <f.icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={handleContact} size="lg">
              {ctaLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
