import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  LogOut,
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
  exitPending,
  onBack,
  onReload,
  onEvaluate,
  onSubmit,
  onExit,
}: {
  examId: string
  examSubject?: string
  questionUrl?: string
  reloadPending: boolean
  evaluatePending: boolean
  evaluateDisabled: boolean
  submitPending: boolean
  submitDisabled: boolean
  exitPending: boolean
  onBack: () => void
  onReload: () => void
  onEvaluate: () => void
  onSubmit: () => void
  onExit: () => void
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
          <ArrowLeft data-icon="icon-only" />
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
            <ExternalLink data-icon="icon-only" />
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
            data-icon="inline-start"
            className={reloadPending ? "animate-spin" : undefined}
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
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Stars data-icon="inline-start" />
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
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Send data-icon="inline-start" />
          )}
          <span className="hidden xl:inline">
            {submitPending ? "Saving…" : "Submit"}
          </span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onExit}
          disabled={exitPending}
          title="Exit running evaluation"
        >
          {exitPending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <LogOut data-icon="inline-start" />
          )}
          <span className="hidden xl:inline">
            {exitPending ? "Exiting…" : "Exit"}
          </span>
        </Button>
      </div>
    </div>
  )
}
