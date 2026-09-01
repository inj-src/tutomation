import type {
  ExcalidrawImperativeAPI,
  ToolType,
} from "@excalidraw/excalidraw/types"
import {
  ArrowRight,
  Circle,
  Eraser,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Type,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"

type ToolIcon = typeof MousePointer2
const tools: { type: ToolType; label: string; icon: ToolIcon }[] = [
  { type: "selection", label: "Select", icon: MousePointer2 },
  { type: "rectangle", label: "Rectangle", icon: Square },
  { type: "ellipse", label: "Oval", icon: Circle },
  { type: "arrow", label: "Arrow", icon: ArrowRight },
  { type: "line", label: "Line", icon: Minus },
  { type: "freedraw", label: "Draw", icon: Pencil },
  { type: "text", label: "Text", icon: Type },
  { type: "eraser", label: "Eraser", icon: Eraser },
]

export function EvaluationControls({ api }: { api?: ExcalidrawImperativeAPI }) {
  const [activeTool, setActiveTool] = useState<ToolType>("selection")

  useEffect(() => {
    if (!api) return
    const sync = () => {
      const next = api.getAppState().activeTool.type
      setActiveTool(next === "custom" ? "selection" : next)
    }
    sync()
    return api.onChange(sync)
  }, [api])

  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-md border bg-card p-1 shadow-sm"
      role="toolbar"
      aria-label="Drawing tools"
    >
      {tools.map(({ type, label, icon: Icon }) => (
        <Button
          key={type}
          variant={activeTool === type ? "secondary" : "ghost"}
          size="icon"
          type="button"
          aria-label={label}
          aria-pressed={activeTool === type}
          title={label}
          onClick={() => {
            setActiveTool(type)
            api?.setActiveTool({ type })
          }}
        >
          <Icon />
        </Button>
      ))}
    </div>
  )
}
