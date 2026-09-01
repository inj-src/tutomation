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
    <aside className="bg-card p-3 sm:p-5 min-w-0 h-full">
      <ScrollArea className="h-full">
        <div className="mb-4">
          <p className="font-semibold text-sm">Reference</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Question and sample answer
          </p>
        </div>
        {capture ? (
          <div className="flex flex-col gap-4">
            <Dialog>
              <DialogTrigger className="flex flex-col gap-3">
                <img
                  className="border rounded w-full h-auto max-h-[70vh] object-contain"
                  src={capture.questionImage}
                />
                <img
                  className="w-full max-w-full h-auto object-contain"
                  src={capture.sampleAnswerImage}
                />
              </DialogTrigger>
              <DialogContent className="w-full max-w-5xl sm:max-w-5xl max-h-[90vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Question and sample answer</DialogTitle>
                </DialogHeader>
                <img
                  className="border rounded w-full h-auto max-h-[70vh] object-contain"
                  src={capture.questionImage}
                />
                <img
                  className="w-full max-w-full h-auto object-contain"
                  src={capture.sampleAnswerImage}
                />
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="w-full h-32" />
            <Skeleton className="w-full h-44" />
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
