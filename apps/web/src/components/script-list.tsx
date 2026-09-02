import { FileText } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar";

import type { Entry } from "../lib/api";

export function ScriptList({
  entries,
  selectedId,
  isLoading,
  error,
  onSelect,
}: {
  entries: Entry[];
  selectedId?: string;
  isLoading: boolean;
  error?: Error | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Sidebar collapsible="icon" className="h-svh">
      <SidebarHeader className="bg-white border-b">
        <div className="flex justify-center items-center px-2 py-1">
          <div className="group-data-[collapsible=icon]:hidden flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">Pending scripts</p>
              <p className="text-muted-foreground text-xs">{entries.length} available</p>
            </div>
          </div>
          <SidebarTrigger className="ml-auto" />
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-white">
        <SidebarGroup>
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
              <p className="px-2 py-3 text-muted-foreground text-xs">{error.message}</p>
            ) : entries.length === 0 ? (
              <p className="px-2 py-3 text-muted-foreground text-xs">No pending scripts remain.</p>
            ) : (
              <SidebarMenu className="space-y-1">
                {entries.map((entry) => {
                  const label = entry.question || `Question ${entry.index}`;
                  return (
                    <SidebarMenuItem key={entry.id}>
                      <SidebarMenuButton
                        size="lg"
                        isActive={selectedId === entry.id}
                        tooltip={`${label} · ${entry.version} · ${entry.pending} pending`}
                        aria-current={selectedId === entry.id ? "page" : undefined}
                        onClick={() => onSelect(entry.id)}
                      >
                        <span className="flex justify-center items-center bg-sidebar-accent rounded-md size-8 font-semibold tabular-nums text-[10px] shrink-0">
                          {entry.index}
                        </span>
                        <span className="group-data-[collapsible=icon]:hidden">
                          <span className="block font-medium text-sm truncate">{label}</span>
                          <span className="block mt-1 text-muted-foreground text-xs truncate">
                            {entry.version} · {entry.pending} pending
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
