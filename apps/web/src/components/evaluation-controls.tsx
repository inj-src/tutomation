import type {
  ExcalidrawImperativeAPI,
  ToolType,
} from "@excalidraw/excalidraw/types"
import {
  ArrowRight,
  Circle,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Square,
  Type,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

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

export function EvaluationControls({
  api,
  hasExtraSpace,
  onAddSpace,
  onClearSpace,
  pageIndex,
  pageCount,
  onPreviousPage,
  onNextPage,
}: {
  api?: ExcalidrawImperativeAPI
  hasExtraSpace: boolean
  onAddSpace: () => void
  onClearSpace: () => void
  pageIndex: number
  pageCount: number
  onPreviousPage: () => void
  onNextPage: () => void
}) {
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
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Previous script image"
        title="Previous script image"
        disabled={pageIndex === 0}
        onClick={onPreviousPage}
      >
        <ChevronLeft />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5 !self-center" />
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
      <Button
        className="ml-1"
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Add 100 pixels below the script"
        title="Add 100 px below"
        onClick={onAddSpace}
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Remove extra space below the script"
        title="Remove extra space"
        disabled={!hasExtraSpace}
        onClick={onClearSpace}
      >
        <Minus />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5 !self-center" />
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="Next script image"
        title="Next script image"
        disabled={pageIndex === pageCount - 1}
        onClick={onNextPage}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
