import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { candidateEvaluationUrl } from "@repo/shared/site-url"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@workspace/ui/components/resizable"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { EvaluationCanvas } from "../components/evaluation-canvas"
import { EvaluationControls } from "../components/evaluation-controls"
import { EvaluationHeader } from "../components/evaluation-header"
import { ReferencePanel } from "../components/reference-panel"
import { ScriptList } from "../components/script-list"
import { UnavailableScriptCard } from "../components/unavailable-script-card"
import {
  evaluateCandidate,
  getCapture,
  getEntries,
  submitCandidate,
  type Entry,
  type EvaluationResult,
} from "../lib/api"

export const Route = createFileRoute("/category/$examId")({
  validateSearch: (search: Record<string, unknown>) => ({
    entry: typeof search.entry === "string" ? search.entry : undefined,
  }),
  component: CategoryWorkspace,
})

function CategoryWorkspace() {
  const { examId } = Route.useParams()
  const { entry: entryParam } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
  const entries = useQuery({
    queryKey: ["entries", examId],
    queryFn: () => getEntries(examId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const [evaluations, setEvaluations] = useState<
    Record<string, EvaluationResult["evaluation"]>
  >({})
  const [revision, setRevision] = useState(0)
  const [extraBottomSpace, setExtraBottomSpace] = useState(0)
  const [scriptListOpen, setScriptListOpen] = useState(true)
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI>()

  const entryList: Entry[] = entries.data ?? []
  const selectedId = entryParam ?? entryList[0]?.id
  const selected = entryList.find((entry) => entry.id === selectedId)
  const selectedIsMissing = Boolean(entryParam && !selected)
  const categoryIsGone =
    entries.isError && /404|category|not found/i.test(entries.error.message)

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
    } else if (selectedIsMissing) {
      void queryClient.invalidateQueries({
        queryKey: ["capture", examId, entryParam],
        exact: true,
      })
    }
  }, [
    entries.dataUpdatedAt,
    categoryIsGone,
    entries.error,
    entries.isSuccess,
    entryList,
    entryParam,
    examId,
    navigate,
    queryClient,
    selectedIsMissing,
  ])

  useEffect(() => setExtraBottomSpace(0), [selectedId])

  const capture = useQuery({
    queryKey: ["capture", examId, selectedId],
    queryFn: () => getCapture(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: (query) =>
      query.state.data?.status === "capturing" ? 500 : false,
  })
  const questionUrl =
    capture.data?.evaluationUrl ??
    (selected ? candidateEvaluationUrl(selected) : undefined)
  const evaluation = selectedId ? evaluations[selectedId] : undefined
  const evaluate = useMutation({
    mutationFn: () => evaluateCandidate(selectedId!),
    onSuccess: (result) => {
      setEvaluations((current) => ({
        ...current,
        [selectedId!]: result.evaluation,
      }))
      setRevision((current) => current + 1)
      toast.success("AI review is ready", {
        description: "Check every mark before submitting.",
      })
    },
    onError: (error) =>
      toast.error("AI review failed", { description: error.message }),
  })
  const submit = useMutation({
    mutationFn: () => submitCandidate(selectedId!),
    onSuccess: (result) =>
      toast.success("Review saved", { description: result.message }),
    onError: (error) =>
      toast.error("Could not save review", { description: error.message }),
  })
  const busy =
    entries.isLoading || capture.isLoading || capture.data?.status !== "ready"

  const reload = async (): Promise<void> => {
    await entries.refetch()
    if (selectedId) {
      await queryClient.invalidateQueries({
        queryKey: ["capture", examId, selectedId],
        exact: true,
      })
    }
    await queryClient.invalidateQueries({ queryKey: ["categories"] })
  }

  return (
    <main className="flex min-h-svh min-w-0 flex-col">
      <SidebarProvider
        open={scriptListOpen}
        onOpenChange={setScriptListOpen}
        className="min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <ScriptList
            entries={entryList}
            selectedId={selectedId}
            isLoading={entries.isLoading}
            error={entries.isError ? entries.error : null}
            onSelect={(id) => void navigate({ search: { entry: id } })}
          />
          <SidebarInset className="min-h-0 min-w-0">
            <div className="flex min-h-0 flex-1">
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 min-w-0 flex-1"
              >
                <ResizablePanel
                  defaultSize="74%"
                  minSize="42%"
                  className="min-w-0"
                >
                  <section className="flex h-full min-h-140 min-w-0 flex-col bg-muted/10 p-3 sm:p-5">
                    <EvaluationHeader
                      examId={examId}
                      examSubject={selected?.examSubject}
                      questionUrl={questionUrl}
                      reloadPending={entries.isFetching}
                      evaluatePending={evaluate.isPending}
                      evaluateDisabled={
                        !selectedId || busy || evaluate.isPending
                      }
                      submitPending={submit.isPending}
                      submitDisabled={
                        !selectedId || !evaluation || submit.isPending
                      }
                      onBack={() => void navigate({ to: "/" })}
                      onReload={() => void reload()}
                      onEvaluate={() => evaluate.mutate()}
                      onSubmit={() => submit.mutate()}
                    />
                    {selectedIsMissing ||
                    capture.isError ||
                    capture.data?.status === "failed" ? (
                      <UnavailableScriptCard
                        message={
                          selectedIsMissing
                            ? "This script is no longer available."
                            : (capture.data?.error ??
                              capture.error?.message ??
                              "The script could not be loaded.")
                        }
                        onOpenTop={
                          entryList[0]
                            ? () =>
                                void navigate({
                                  search: { entry: entryList[0].id },
                                })
                            : undefined
                        }
                        onRetry={() => void capture.refetch()}
                      />
                    ) : capture.data ? (
                      <div className="flex flex-1 flex-col items-center gap-4">
                        <EvaluationControls
                          api={editorApi}
                          hasExtraSpace={extraBottomSpace > 0}
                          onAddSpace={() =>
                            setExtraBottomSpace((space) => space + 100)
                          }
                          onClearSpace={() => setExtraBottomSpace(0)}
                        />
                        <EvaluationCanvas
                          capture={capture.data}
                          evaluation={evaluation}
                          extraBottomSpace={extraBottomSpace}
                          revision={revision}
                          onApi={setEditorApi}
                        />
                      </div>
                    ) : (
                      <div className="m-auto text-center text-sm text-muted-foreground">
                        Select a script to load its canvas.
                      </div>
                    )}
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                  defaultSize="26%"
                  minSize="15%"
                  maxSize="50%"
                  className="min-w-0"
                >
                  <ReferencePanel
                    key={selectedId ?? "no-entry"}
                    capture={capture.data}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </main>
  )
}
