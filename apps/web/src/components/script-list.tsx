import { FileText } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import type { Entry } from "../lib/api"

export function ScriptList({
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
  return (
    <Sidebar collapsible="icon" className="h-svh">
      <SidebarHeader className="border-b">
        <div className="flex min-w-0 items-center gap-2 px-2 py-1">
          <FileText className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">Pending scripts</p>
            <p className="text-xs text-muted-foreground">
              {entries.length} available
            </p>
          </div>
          <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:mx-auto" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Scripts</SidebarGroupLabel>
          <SidebarGroupContent>
            {isLoading ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              </SidebarMenu>
            ) : error ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {error.message}
              </p>
            ) : entries.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No pending scripts remain.
              </p>
            ) : (
              <SidebarMenu>
                {entries.map((entry) => {
                  const label = entry.question || `Question ${entry.index}`
                  return (
                    <SidebarMenuItem key={entry.id}>
                      <SidebarMenuButton
                        type="button"
                        size="lg"
                        isActive={selectedId === entry.id}
                        tooltip={`${label} · ${entry.version} · ${entry.pending} pending`}
                        aria-current={
                          selectedId === entry.id ? "page" : undefined
                        }
                        onClick={() => onSelect(entry.id)}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-[10px] font-semibold tabular-nums group-data-[collapsible=icon]:size-5">
                          {entry.index}
                        </span>
                        <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                          <span className="block truncate text-sm font-medium">
                            {label}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {entry.version} · {entry.pending} pending
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
