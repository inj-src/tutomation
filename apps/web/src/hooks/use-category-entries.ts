import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { toast } from "sonner"

import { apiFailure, getEntries, type Entry } from "../lib/api"

function stableEntryId(id: string): string {
  return id.split("~").slice(0, 6).join("~")
}

export function useCategoryEntries(examId: string, entryParam?: string) {
  const navigate = useNavigate({ from: "/category/$examId" })
  const entries = useQuery({
    queryKey: ["entries", examId],
    queryFn: () => getEntries(examId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const entryList: Entry[] = entries.data ?? []
  const selected = entryList.find(
    (entry) =>
      entry.id === entryParam ||
      (entryParam !== undefined &&
        stableEntryId(entry.id) === stableEntryId(entryParam))
  )
  const selectedId =
    selected?.id ?? (!entryParam ? entryList[0]?.id : undefined)
  const categoryIsGone =
    entries.isError && apiFailure(entries.error).code === "CATEGORY_NOT_FOUND"

  useEffect(() => {
    if (categoryIsGone) {
      toast.info("Category is no longer available", {
        description: "Returning to the available script queues.",
      })
      void navigate({ to: "/", replace: true })
      return
    }
    if (!entries.isSuccess) return
    if (entryList.length === 0) {
      toast.info("No pending scripts remain", {
        description: "The category is no longer available.",
      })
      void navigate({ to: "/", replace: true })
    } else if (!entryParam) {
      void navigate({ search: { entry: entryList[0].id }, replace: true })
    } else if (selected && entryParam !== selected.id) {
      void navigate({ search: { entry: selected.id }, replace: true })
    } else if (!selected) {
      toast.info("Entry is no longer available", {
        description: "Opening the queue with the most pending scripts.",
      })
      void navigate({ search: { entry: entryList[0].id }, replace: true })
    }
  }, [
    entries.dataUpdatedAt,
    categoryIsGone,
    entries.isSuccess,
    entryList,
    entryParam,
    navigate,
    selected,
  ])

  return { entries, entryList, selected, selectedId }
}
