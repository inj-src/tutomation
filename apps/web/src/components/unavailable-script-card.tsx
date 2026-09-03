import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function UnavailableScriptCard({
  message,
  onOpenTop,
  onRetry,
}: {
  message: string
  onOpenTop?: () => void
  onRetry: () => void
}) {
  return (
    <Card className="m-auto w-sm">
      <CardHeader>
        <CardTitle>Script unavailable</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {onOpenTop ? (
            <Button variant="outline" onClick={onOpenTop}>
              Open top pending script
            </Button>
          ) : null}
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
