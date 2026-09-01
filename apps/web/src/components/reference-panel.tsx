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
        {capture ? (
          <div className="flex flex-col gap-4">
            <ReferenceCard
              label="Question"
              image={capture.questionImage}
              alt="Question"
            />
            <ReferenceCard
              label="Sample answer"
              image={capture.sampleAnswerImage}
              alt="Sample answer"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}

function ReferenceCard({
  image,
  alt,
  label,
}: {
  label: string
  image: string
  alt: string
}) {
  return (
    <Dialog>
      <DialogTrigger>
        <img
          className="h-auto max-h-[70vh] w-full rounded border object-contain"
          src={image}
          alt={alt}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-full max-w-4xl overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <img
          className="h-auto w-full max-w-full object-contain"
          src={image}
          alt={alt}
        />
      </DialogContent>
    </Dialog>
  )
}
