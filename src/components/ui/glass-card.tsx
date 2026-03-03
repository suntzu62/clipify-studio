import * as React from "react"
import { cn } from "@/lib/utils"

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-lg",
      className
    )}
    {...props}
  />
))
GlassCard.displayName = "GlassCard"

export { GlassCard }
