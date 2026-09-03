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
import { RunningEvaluationCard } from "../components/running-evaluation-card"
import { ScriptList } from "../components/script-list"
import { UnavailableScriptCard } from "../components/unavailable-script-card"
import { useCategoryEntries } from "../hooks/use-category-entries"
import {
  apiFailure,
  evaluateCandidate,
  exitRunningEvaluation,
  getCapture,
  submitCandidate,
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
  const { entries, entryList, selected, selectedId } = useCategoryEntries(
    examId,
    entryParam
  )
  const [evaluations, setEvaluations] = useState<
    Record<string, EvaluationResult["evaluation"]>
  >({})
  const [revision, setRevision] = useState(0)
  const [extraBottomSpace, setExtraBottomSpace] = useState(0)
  const [scriptListOpen, setScriptListOpen] = useState(true)
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI>()

  useEffect(() => setExtraBottomSpace(0), [selectedId])

  const capture = useQuery({
    queryKey: ["capture", examId, selectedId],
    queryFn: () => getCapture(selectedId!),
    enabled: Boolean(selectedId),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "capturing" ? 500 : false,
  })
  const captureFailure = capture.isError ? apiFailure(capture.error) : undefined

  useEffect(() => {
    if (captureFailure?.code === "ENTRY_STALE") void entries.refetch()
  }, [capture.errorUpdatedAt, captureFailure?.code])
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
    onSuccess: (result) => {
      toast.success("Review saved", { description: result.message })
      if (!result.submitted) return
      setEvaluations((current) => {
        const next = { ...current }
        delete next[selectedId!]
        return next
      })
      void entries.refetch()
      void queryClient.invalidateQueries({
        queryKey: ["capture", examId, selectedId],
        exact: true,
      })
    },
    onError: (error) =>
      toast.error("Could not save review", { description: error.message }),
  })
  const exit = useMutation({
    mutationFn: exitRunningEvaluation,
    onError: (error) =>
      toast.error("Could not exit evaluation", {
        description: apiFailure(error).message,
      }),
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

  const clearCapture = (): void => {
    queryClient.removeQueries({ queryKey: ["capture"] })
    void queryClient.invalidateQueries({ queryKey: ["entries"] })
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
                      exitPending={exit.isPending}
                      onBack={() => void navigate({ to: "/" })}
                      onReload={() => void reload()}
                      onEvaluate={() => evaluate.mutate()}
                      onSubmit={() => submit.mutate()}
                      onExit={() =>
                        exit.mutate(undefined, {
                          onSuccess: () => {
                            clearCapture()
                            void navigate({ to: "/" })
                          },
                        })
                      }
                    />
                    {captureFailure?.code === "RUNNING_EVALUATION" ? (
                      <RunningEvaluationCard
                        failure={captureFailure}
                        opening={exit.isPending}
                        onShowRunning={() => {
                          const running = captureFailure.running
                          if (!running) return
                          void navigate({
                            to: "/category/$examId",
                            params: { examId: running.examId },
                            search: { entry: running.id },
                          })
                        }}
                        onOpenRequested={() =>
                          exit.mutate(undefined, {
                            onSuccess: () => void capture.refetch(),
                          })
                        }
                      />
                    ) : capture.isError || capture.data?.status === "failed" ? (
                      <UnavailableScriptCard
                        message={
                          capture.data?.error ??
                          captureFailure?.message ??
                          "The script could not be loaded."
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
