import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { candidateEvaluationUrl } from "@repo/api/site-url"
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Stars,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@workspace/ui/components/resizable"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { EvaluationCanvas } from "../components/evaluation-canvas"
import { EvaluationControls } from "../components/evaluation-controls"
import { ReferencePanel } from "../components/reference-panel"
import { ScriptList } from "../components/script-list"
import {
  evaluateCandidate,
  getCapture,
  getEntries,
  submitCandidate,
  type Entry,
  type EvaluationResult,
} from "../lib/api"

export const Route = createFileRoute("/category/$examId")({
  component: CategoryWorkspace,
})

function CategoryWorkspace() {
  const { examId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const entries = useQuery({
    queryKey: ["entries", examId],
    queryFn: () => getEntries(examId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  const [selectedId, setSelectedId] = useState<string>()
  const [evaluations, setEvaluations] = useState<
    Record<string, EvaluationResult["evaluation"]>
  >({})
  const [revision, setRevision] = useState(0)
  const [extraBottomSpace, setExtraBottomSpace] = useState(0)
  const [scriptListOpen, setScriptListOpen] = useState(true)
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI>()

  useEffect(() => {
    if (!selectedId && entries.data?.[0]) {
      setSelectedId(entries.data[0].id)
    }
  }, [entries.data, selectedId])

  useEffect(() => setExtraBottomSpace(0), [selectedId])

  const entryList: Entry[] = entries.data ?? []
  const selected = entryList.find((entry) => entry.id === selectedId)
  const capture = useQuery({
    queryKey: ["capture", selectedId],
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
            onSelect={setSelectedId}
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
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 pb-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Back to categories"
                          title="Back to categories"
                          onClick={() => void navigate({ to: "/" })}
                        >
                          <ArrowLeft />
                        </Button>
                        <p className="truncate text-sm font-semibold">
                          {selected?.examSubject || `Exam ${examId}`}
                        </p>
                        {questionUrl ? (
                          <a
                            className={buttonVariants({
                              variant: "ghost",
                              size: "icon-sm",
                            })}
                            href={questionUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open question in Teacher panel"
                            title="Open question in Teacher panel"
                          >
                            <ExternalLink />
                          </a>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void entries.refetch()
                            if (selectedId) {
                              void queryClient.invalidateQueries({
                                queryKey: ["capture", selectedId],
                              })
                            }
                            void queryClient.invalidateQueries({
                              queryKey: ["categories"],
                            })
                          }}
                          disabled={entries.isFetching}
                        >
                          <RefreshCw
                            className={
                              entries.isFetching
                                ? "size-4 animate-spin"
                                : "size-4"
                            }
                          />
                          <span className="hidden xl:inline">Reload</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => evaluate.mutate()}
                          disabled={!selectedId || busy || evaluate.isPending}
                          title="AI evaluate"
                        >
                          {evaluate.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Stars className="size-4" />
                          )}
                          <span className="hidden xl:inline">
                            {evaluate.isPending ? "Evaluating…" : "AI evaluate"}
                          </span>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => submit.mutate()}
                          disabled={
                            !selectedId || !evaluation || submit.isPending
                          }
                          title="Submit"
                        >
                          {submit.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Send className="size-4" />
                          )}
                          <span className="hidden xl:inline">
                            {submit.isPending ? "Saving…" : "Submit"}
                          </span>
                        </Button>
                      </div>
                    </div>
                    {capture.isError || capture.data?.status === "failed" ? (
                      <Card className="m-auto w-sm">
                        <CardHeader>
                          <CardTitle>Script unavailable</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {capture.data?.error ?? capture.error?.message}
                          </p>
                          <Button
                            className="mt-4"
                            variant="outline"
                            onClick={() => void capture.refetch()}
                          >
                            Try again
                          </Button>
                        </CardContent>
                      </Card>
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
                  <ReferencePanel capture={capture.data} />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </main>
  )
}
