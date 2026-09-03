import { Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { ApiFailure } from "../lib/api"

export function RunningEvaluationCard({
  failure,
  opening,
  onShowRunning,
  onOpenRequested,
}: {
  failure: ApiFailure
  opening: boolean
  onShowRunning: () => void
  onOpenRequested: () => void
}) {
  return (
    <Card className="m-auto w-sm">
      <CardHeader>
        <CardTitle>Another evaluation is running</CardTitle>
        <CardDescription>
          Open that script, or exit it before opening the script you selected.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={onShowRunning}
          disabled={!failure.running || opening}
        >
          Show running
        </Button>
        <Button onClick={onOpenRequested} disabled={opening}>
          {opening ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : null}
          Open this
        </Button>
      </CardFooter>
    </Card>
  )
}
