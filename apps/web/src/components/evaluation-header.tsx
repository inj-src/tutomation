import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Stars,
} from "lucide-react"

import { Button, buttonVariants } from "@workspace/ui/components/button"

export function EvaluationHeader({
  examId,
  examSubject,
  questionUrl,
  reloadPending,
  evaluatePending,
  evaluateDisabled,
  submitPending,
  submitDisabled,
  onBack,
  onReload,
  onEvaluate,
  onSubmit,
}: {
  examId: string
  examSubject?: string
  questionUrl?: string
  reloadPending: boolean
  evaluatePending: boolean
  evaluateDisabled: boolean
  submitPending: boolean
  submitDisabled: boolean
  onBack: () => void
  onReload: () => void
  onEvaluate: () => void
  onSubmit: () => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 pb-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to categories"
          title="Back to categories"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <p className="truncate text-sm font-semibold">
          {examSubject || `Exam ${examId}`}
        </p>
        {questionUrl ? (
          <a
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
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
          onClick={onReload}
          disabled={reloadPending}
        >
          <RefreshCw
            className={reloadPending ? "size-4 animate-spin" : "size-4"}
          />
          <span className="hidden xl:inline">Reload</span>
        </Button>
        <Button
          size="sm"
          onClick={onEvaluate}
          disabled={evaluateDisabled}
          title="AI evaluate"
        >
          {evaluatePending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Stars className="size-4" />
          )}
          <span className="hidden xl:inline">
            {evaluatePending ? "Evaluating…" : "AI evaluate"}
          </span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onSubmit}
          disabled={submitDisabled}
          title="Submit"
        >
          {submitPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          <span className="hidden xl:inline">
            {submitPending ? "Saving…" : "Submit"}
          </span>
        </Button>
      </div>
    </div>
  )
}
