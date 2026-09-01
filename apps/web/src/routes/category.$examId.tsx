import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Bot,
  FileCheck2,
  Loader2,
  RefreshCw,
  Send,
  Stars,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
import { Separator } from "@workspace/ui/components/separator"

import { EvaluationCanvas } from "../components/evaluation-canvas"
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
  })
  const [selectedId, setSelectedId] = useState<string>()
  const [evaluations, setEvaluations] = useState<
    Record<string, EvaluationResult["evaluation"]>
  >({})
  const [revision, setRevision] = useState(0)
  const [scriptListOpen, setScriptListOpen] = useState(true)

  useEffect(() => {
    if (!selectedId && entries.data?.[0]) {
      setSelectedId(entries.data[0].id)
    }
  }, [entries.data, selectedId])

  const entryList: Entry[] = entries.data ?? []
  const selected = entryList.find((entry) => entry.id === selectedId)
  const capture = useQuery({
    queryKey: ["capture", selectedId],
    queryFn: () => getCapture(selectedId!),
    enabled: Boolean(selectedId),
  })
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
  const busy = entries.isLoading || capture.isLoading

  return (
    <main className="flex min-h-svh min-w-0 flex-col">
      <WorkspaceHeader
        examId={examId}
        isFetching={entries.isFetching}
        isEvaluating={evaluate.isPending}
        isSubmitting={submit.isPending}
        canEvaluate={Boolean(selectedId) && !busy}
        canSubmit={Boolean(selectedId && evaluation)}
        onBack={() => void navigate({ to: "/" })}
        onReload={() => {
          void entries.refetch()
          void queryClient.invalidateQueries({ queryKey: ["categories"] })
        }}
        onEvaluate={() => evaluate.mutate()}
        onSubmit={() => submit.mutate()}
      />

      <div className="flex min-h-0 flex-1">
        <ScriptList
          entries={entryList}
          selectedId={selectedId}
          isLoading={entries.isLoading}
          error={entries.isError ? entries.error : null}
          open={scriptListOpen}
          onOpenChange={setScriptListOpen}
          onSelect={setSelectedId}
        />
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 min-w-0 flex-1"
        >
          <ResizablePanel defaultSize="74%" minSize="42%" className="min-w-0">
            <section className="flex h-full min-h-[560px] min-w-0 flex-col bg-muted/10 p-3 sm:p-5">
              {capture.isError ? (
                <Card className="m-auto max-w-md">
                  <CardHeader>
                    <CardTitle>Script unavailable</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {capture.error.message}
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
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {selected?.examSubject}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selected?.question || "Selected script"}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {evaluation ? (
                        <>
                          <FileCheck2 className="size-3" /> AI review ready
                        </>
                      ) : (
                        <>
                          <Bot className="size-3" /> Awaiting review
                        </>
                      )}
                    </Badge>
                  </div>
                  <div className="min-h-0 flex-1">
                    <EvaluationCanvas
                      capture={capture.data}
                      evaluation={evaluation}
                      revision={revision}
                    />
                  </div>
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
    </main>
  )
}

function WorkspaceHeader({
  examId,
  isFetching,
  isEvaluating,
  isSubmitting,
  canEvaluate,
  canSubmit,
  onBack,
  onReload,
  onEvaluate,
  onSubmit,
}: {
  examId: string
  isFetching: boolean
  isEvaluating: boolean
  isSubmitting: boolean
  canEvaluate: boolean
  canSubmit: boolean
  onBack: () => void
  onReload: () => void
  onEvaluate: () => void
  onSubmit: () => void
}) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to categories"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Evaluation workspace</p>
          <p className="truncate text-xs text-muted-foreground">
            Exam {examId}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReload}
          disabled={isFetching}
        >
          <RefreshCw
            className={isFetching ? "size-4 animate-spin" : "size-4"}
          />
          <span className="hidden sm:inline">Reload entries</span>
        </Button>
        <Button
          size="sm"
          onClick={onEvaluate}
          disabled={!canEvaluate || isEvaluating}
        >
          {isEvaluating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Stars className="size-4" />
          )}
          {isEvaluating ? "Evaluating…" : "AI evaluate"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {isSubmitting ? "Saving…" : "Submit"}
        </Button>
      </div>
    </header>
  )
}
