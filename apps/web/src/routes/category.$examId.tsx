import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Bot,
  Check,
  FileText,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Excalidraw,
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw"
import type { BinaryFiles, DataURL } from "@excalidraw/excalidraw/types"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  evaluateCandidate,
  getCapture,
  getEntries,
  submitCandidate,
  type Capture,
  type Entry,
  type EvaluationResult,
} from "../lib/api"

export const Route = createFileRoute("/category/$examId")({
  component: CategoryWorkspace,
})

type FileId = string & { readonly _brand: "FileId" }
type ExcalidrawElementSkeleton = NonNullable<
  Parameters<typeof convertToExcalidrawElements>[0]
>[number]

function scoreText(value: number): string {
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return text.length < 2 ? `0${text}` : text
}

function imageFile(id: FileId, dataURL: string): BinaryFiles {
  return {
    [id]: {
      id,
      dataURL: dataURL as DataURL,
      mimeType: "image/png",
      created: Date.now(),
    },
  }
}

function sceneFor(
  capture: Capture,
  evaluation?: EvaluationResult["evaluation"]
): {
  elements: ReturnType<typeof convertToExcalidrawElements>
  files: BinaryFiles
} {
  const imageId = "student-script" as FileId
  const imageWidth = capture.canvas.pixelWidth
  const imageHeight = capture.canvas.pixelHeight
  const skeletons: ExcalidrawElementSkeleton[] = [
    {
      type: "image",
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
      fileId: imageId,
      status: "saved",
    },
  ]

  if (evaluation) {
    for (const questionScore of evaluation.questionScores) {
      const label = scoreText(questionScore.score)
      const fontSize = 30
      const scoreWidth = label.length * fontSize * 0.62
      const scoreX = Math.max(4, questionScore.x - scoreWidth - 10)
      const scoreY = Math.max(4, questionScore.y - fontSize / 2)
      const angle = -(35 + Math.random() * 20) * (Math.PI / 180)
      const scoreStyle = {
        strokeColor: "#d62f2f",
        fontFamily: FONT_FAMILY.Excalifont,
        roughness: 1.5,
      }
      skeletons.push(
        {
          type: "text",
          x: scoreX,
          y: scoreY,
          text: label,
          fontSize,
          ...scoreStyle,
          angle,
        },
        {
          type: "line",
          x: scoreX - 5,
          y: scoreY + fontSize + 4,
          points: [
            [0, 0],
            [scoreWidth * 0.5, 3],
            [scoreWidth + 10, 0],
          ],
          strokeColor: "#d62f2f",
          strokeWidth: 2,
          roughness: 1.2,
          angle,
        }
      )
    }

    for (const annotation of evaluation.annotations) {
      const common = {
        strokeColor: "#d62f2f",
        roughness: 1.5,
        strokeWidth: 2.5,
      }
      if (
        (annotation.kind === "circle" || annotation.kind === "oval") &&
        annotation.center
      ) {
        const radiusX =
          annotation.kind === "oval"
            ? (annotation.radiusX ?? 12)
            : (annotation.radius ?? 12)
        const radiusY =
          annotation.kind === "oval" ? (annotation.radiusY ?? radiusX) : radiusX
        skeletons.push({
          type: "ellipse",
          x: annotation.center[0] - radiusX,
          y: annotation.center[1] - radiusY,
          width: radiusX * 2,
          height: radiusY * 2,
          ...common,
        })
      } else if (
        annotation.kind === "underline" &&
        annotation.start &&
        annotation.end
      ) {
        skeletons.push({
          type: "line",
          x: annotation.start[0],
          y: annotation.start[1],
          points: [
            [0, 0],
            [
              annotation.end[0] - annotation.start[0],
              annotation.end[1] - annotation.start[1],
            ],
          ],
          ...common,
        })
      } else if (
        annotation.kind === "tick" &&
        annotation.points &&
        annotation.points.length > 1
      ) {
        const origin = annotation.points[0]
        skeletons.push({
          type: "line",
          x: origin[0],
          y: origin[1],
          points: annotation.points
            .slice(1)
            .map((point) => [point[0] - origin[0], point[1] - origin[1]]),
          ...common,
        })
      } else if (
        annotation.kind === "box" &&
        annotation.x !== null &&
        annotation.y !== null
      ) {
        skeletons.push({
          type: "rectangle",
          x: annotation.x,
          y: annotation.y,
          width: annotation.width ?? 1,
          height: annotation.height ?? 1,
          ...common,
        })
      }

      if (
        annotation.text &&
        annotation.kind !== "text" &&
        annotation.commentAt
      ) {
        skeletons.push({
          type: "text",
          x: annotation.commentAt[0],
          y: annotation.commentAt[1],
          text: annotation.text,
          fontSize: 24,
          fontFamily: FONT_FAMILY.Excalifont,
          strokeColor: "#d62f2f",
          roughness: 1.5,
        })
      }
      if (
        annotation.kind === "text" &&
        annotation.text &&
        annotation.x !== null &&
        annotation.y !== null
      ) {
        skeletons.push({
          type: "text",
          x: annotation.x,
          y: annotation.y,
          text: annotation.text,
          fontSize: 24,
          fontFamily: FONT_FAMILY.Excalifont,
          strokeColor: "#d62f2f",
          roughness: 1.5,
        })
      }
    }
  }

  return {
    elements: convertToExcalidrawElements(skeletons, { regenerateIds: true }),
    files: imageFile(imageId, capture.studentScriptImage),
  }
}

function EvaluationCanvas({
  capture,
  evaluation,
  revision,
}: {
  capture: Capture
  evaluation?: EvaluationResult["evaluation"]
  revision: number
}) {
  const scene = useMemo(
    () => sceneFor(capture, evaluation),
    [capture, evaluation, revision]
  )
  return (
    <div className="h-full min-h-[480px] overflow-hidden rounded-lg border bg-white">
      <Excalidraw
        key={`${capture.candidate.pendingQuestion}-${revision}`}
        initialData={{
          elements: scene.elements,
          files: scene.files,
          appState: {
            viewModeEnabled: false,
            zenModeEnabled: false,
            gridModeEnabled: false,
            scrollX: 0,
            scrollY: 0,
          },
        }}
        viewModeEnabled={false}
        zenModeEnabled={false}
        gridModeEnabled={false}
        UIOptions={{
          canvasActions: {
            clearCanvas: false,
            export: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  )
}

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

  useEffect(() => {
    if (!selectedId && entries.data?.[0]) {
      setSelectedId(entries.data[0].id)
    }
  }, [entries.data, selectedId])

  const selected = entries.data?.find((entry) => entry.id === selectedId)
  const capture = useQuery({
    queryKey: ["capture", selectedId],
    queryFn: () => getCapture(selectedId!),
    enabled: Boolean(selectedId),
  })
  const evaluation = selectedId ? evaluations[selectedId] : undefined
  const entryList = entries.data ?? []

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
      <header className="flex min-h-16 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to categories"
            onClick={() => void navigate({ to: "/" })}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Evaluation workspace
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Exam {examId}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void entries.refetch()
              void queryClient.invalidateQueries({ queryKey: ["categories"] })
            }}
            disabled={entries.isFetching}
          >
            <RefreshCw
              className={entries.isFetching ? "size-4 animate-spin" : "size-4"}
            />
            <span className="hidden sm:inline">Reload entries</span>
          </Button>
          <Button
            size="sm"
            onClick={() => evaluate.mutate()}
            disabled={!selectedId || busy || evaluate.isPending}
          >
            <Sparkles className="size-4" />
            {evaluate.isPending ? "Evaluating…" : "AI evaluate"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => submit.mutate()}
            disabled={!selectedId || !evaluation || submit.isPending}
          >
            <Send className="size-4" />
            {submit.isPending ? "Saving…" : "Submit"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        <aside className="border-b bg-muted/20 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Pending scripts</p>
              <p className="text-xs text-muted-foreground">
                {entryList.length} available
              </p>
            </div>
            <FileText className="size-4 text-muted-foreground" />
          </div>
          <Separator />
          <ScrollArea className="h-64 lg:h-[calc(100vh-8rem)]">
            {entries.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : entries.isError ? (
              <div className="p-4 text-sm text-muted-foreground">
                {entries.error.message}
              </div>
            ) : entryList.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No pending scripts remain.
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {entryList.map((entry: Entry) => (
                  <button
                    key={entry.id}
                    className={
                      selectedId === entry.id
                        ? "w-full rounded-md border bg-card px-3 py-3 text-left shadow-sm"
                        : "w-full rounded-md px-3 py-3 text-left hover:bg-muted/50"
                    }
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <span className="block text-sm font-medium">
                      {entry.question || `Question ${entry.index}`}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {entry.version} · {entry.pending} pending
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        <section className="flex min-h-[560px] min-w-0 flex-col bg-muted/10 p-3 sm:p-5">
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
                {evaluation ? (
                  <Badge className="shrink-0 bg-red-700 text-white hover:bg-red-700">
                    <Check className="size-3" /> {scoreText(evaluation.score)} /{" "}
                    {scoreText(capture.data.maxScore)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    <Bot className="size-3" /> Awaiting review
                  </Badge>
                )}
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

        <aside className="border-t bg-card p-3 sm:p-5 lg:border-t-0 lg:border-l">
          <div className="mb-4">
            <p className="text-sm font-semibold">Reference</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Question and sample answer
            </p>
          </div>
          {capture.data ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="p-3">
                  <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
                    Question
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <img
                    className="max-h-64 w-full rounded border object-contain"
                    src={capture.data.questionImage}
                    alt="Question"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-3">
                  <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
                    Sample answer
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <img
                    className="max-h-72 w-full rounded border object-contain"
                    src={capture.data.sampleAnswerImage}
                    alt="Sample answer"
                  />
                </CardContent>
              </Card>
              <p className="text-xs leading-relaxed text-muted-foreground">
                AI marks are proposals. Edit them in the canvas before using
                Submit.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
