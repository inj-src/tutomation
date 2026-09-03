import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Skeleton } from "@workspace/ui/components/skeleton"

import type { Capture } from "../lib/api"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

export function ReferencePanel({ capture }: { capture?: Capture }) {
  return (
    <aside className="h-full min-w-0 bg-card p-3 sm:p-5">
      <ScrollArea className="h-full">
        <div className="mb-4">
          <p className="text-sm font-semibold">Reference</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Question and sample answer
          </p>
        </div>
        {capture?.status === "ready" && capture.referenceImage ? (
          <div className="flex flex-col gap-4">
            <Dialog>
              <DialogTrigger className="flex flex-col gap-3">
                <img
                  className="h-auto max-h-[70vh] w-full rounded border object-contain"
                  src={capture.referenceImage}
                  alt="Question and sample answer"
                />
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-full max-w-5xl overflow-auto sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Question and sample answer</DialogTitle>
                </DialogHeader>
                <img
                  className="h-auto max-h-[70vh] w-full rounded border object-contain"
                  src={capture.referenceImage}
                  alt="Question and sample answer"
                />
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </ScrollArea>
    </aside>
  )
}
