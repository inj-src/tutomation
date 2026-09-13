import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useRef, useState } from "react"

import type { Capture, EvaluationResult } from "../lib/api"
import { EvaluationCanvas } from "./evaluation-canvas"
import { EvaluationControls } from "./evaluation-controls"

export function EvaluationWorkspace({
  capture,
  evaluation,
}: {
  capture: Capture
  evaluation?: EvaluationResult["evaluation"]
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI>()
  const [extraSpace, setExtraSpace] = useState<Record<number, number>>({})
  const pageElements = useRef(
    new Map<number, readonly NonDeletedExcalidrawElement[]>()
  )
  const page = capture.pages[pageIndex] ?? capture.pages[0]
  if (!page) return null

  const bottomSpace = extraSpace[pageIndex] ?? 0
  const pageEvaluation = evaluation?.pages.find(
    (result) => result.imageIndex === page.imageIndex
  )

  return (
    <div className="flex flex-1 flex-col items-center gap-4">
      <EvaluationControls
        api={editorApi}
        hasExtraSpace={bottomSpace > 0}
        onAddSpace={() =>
          setExtraSpace((current) => ({
            ...current,
            [pageIndex]: bottomSpace + 100,
          }))
        }
        onClearSpace={() =>
          setExtraSpace((current) => ({ ...current, [pageIndex]: 0 }))
        }
        pageIndex={pageIndex}
        pageCount={capture.pages.length}
        onPreviousPage={() =>
          setPageIndex((current) => Math.max(0, current - 1))
        }
        onNextPage={() =>
          setPageIndex((current) =>
            Math.min(capture.pages.length - 1, current + 1)
          )
        }
      />
      <EvaluationCanvas
        key={page.imageIndex}
        page={page}
        evaluation={pageEvaluation}
        extraBottomSpace={bottomSpace}
        initialElements={pageElements.current.get(page.imageIndex)}
        onApi={setEditorApi}
        onElementsChange={(elements) =>
          pageElements.current.set(page.imageIndex, elements)
        }
      />
    </div>
  )
}
