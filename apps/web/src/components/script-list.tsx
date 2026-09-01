import { FileText, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
} from "@workspace/ui/components/collapsible"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import type { Entry } from "../lib/api"

export function ScriptList({
  entries,
  selectedId,
  isLoading,
  error,
  open,
  onOpenChange,
  onSelect,
}: {
  entries: Entry[]
  selectedId?: string
  isLoading: boolean
  error?: Error | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-r bg-muted/20",
        open ? "w-72" : "w-14"
      )}
    >
      <div
        className={cn(
          "flex min-h-12 items-center border-b",
          open ? "justify-between px-4" : "justify-center"
        )}
      >
        {open ? (
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Pending scripts</p>
              <p className="text-xs text-muted-foreground">
                {entries.length} available
              </p>
            </div>
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-expanded={open}
          aria-label={
            open ? "Collapse pending scripts" : "Expand pending scripts"
          }
          title={open ? "Collapse pending scripts" : "Expand pending scripts"}
          onClick={() => onOpenChange(!open)}
        >
          {open ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </Button>
      </div>
      <Separator />

      {open ? (
        <CollapsibleContent className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <ScriptListContent
              entries={entries}
              selectedId={selectedId}
              isLoading={isLoading}
              error={error}
              onSelect={onSelect}
            />
          </ScrollArea>
        </CollapsibleContent>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col items-center gap-1 p-2">
            {entries.map((entry) => {
              const label = entry.question || String(entry.index)
              return (
                <Button
                  key={entry.id}
                  variant={selectedId === entry.id ? "secondary" : "ghost"}
                  size="icon"
                  className="text-[10px] font-semibold"
                  aria-label={`Open ${label}`}
                  title={label}
                  aria-current={selectedId === entry.id ? "page" : undefined}
                  onClick={() => onSelect(entry.id)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </Collapsible>
  )
}

function ScriptListContent({
  entries,
  selectedId,
  isLoading,
  error,
  onSelect,
}: {
  entries: Entry[]
  selectedId?: string
  isLoading: boolean
  error?: Error | null
  onSelect: (id: string) => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{error.message}</div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No pending scripts remain.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 p-2">
      {entries.map((entry) => (
        <Button
          key={entry.id}
          variant={selectedId === entry.id ? "secondary" : "ghost"}
          className="h-auto w-full justify-start border px-3 py-3 text-left"
          aria-current={selectedId === entry.id ? "page" : undefined}
          onClick={() => onSelect(entry.id)}
        >
          <span className="block min-w-0">
            <span className="block truncate text-sm font-medium">
              {entry.question || `Question ${entry.index}`}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {entry.version} · {entry.pending} pending
            </span>
          </span>
        </Button>
      ))}
    </div>
  )
}
