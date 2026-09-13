import { Excalidraw } from "@excalidraw/excalidraw"
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useMemo, useState } from "react"
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react"

import { useContainedCanvasSize } from "../hooks/use-contained-canvas-size"
import { useFitExcalidrawImage } from "../hooks/use-fit-excalidraw-image"
import type { Capture, EvaluationResult } from "../lib/api"
import { sceneFor } from "./evaluation-scene"
import "./evaluation-canvas.css"

type ScriptPage = Capture["pages"][number]
type PageEvaluation = EvaluationResult["evaluation"]["pages"][number]

export function EvaluationCanvas({
  page,
  evaluation,
  extraBottomSpace,
  initialElements,
  onApi,
  onElementsChange,
}: {
  page: ScriptPage
  evaluation?: PageEvaluation
  extraBottomSpace: number
  initialElements?: readonly NonDeletedExcalidrawElement[]
  onApi?: (api: ExcalidrawImperativeAPI) => void
  onElementsChange?: (elements: readonly NonDeletedExcalidrawElement[]) => void
}) {
  const generated = useMemo(
    () => sceneFor(evaluation, page.canvas.pixelWidth, page.canvas.pixelHeight),
    [evaluation, page.canvas.pixelHeight, page.canvas.pixelWidth]
  )
  const elements = initialElements ?? generated.elements
  const canvasHeight = page.canvas.pixelHeight + extraBottomSpace
  const ratio = page.canvas.pixelWidth / canvasHeight
  const { ref, style } = useContainedCanvasSize(ratio)
  const [api, setApi] = useState<ExcalidrawImperativeAPI>()

  useFitExcalidrawImage(
    api,
    page.canvas.pixelWidth,
    canvasHeight,
    style.width,
    style.height
  )
  const blockNavigation = (event: PointerEvent | KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      ref={ref}
      className="evaluation-canvas flex max-h-full min-h-0 max-w-full min-w-0 items-center justify-center overflow-hidden rounded-lg border-5 bg-white"
      style={style}
      onWheelCapture={(event: WheelEvent) => event.stopPropagation()}
      onPointerDownCapture={(event) =>
        event.button === 1 && blockNavigation(event)
      }
      onKeyDownCapture={(event) => {
        if (
          !(event.target instanceof HTMLInputElement) &&
          !(event.target instanceof HTMLTextAreaElement) &&
          (event.code === "Space" ||
            event.key === "h" ||
            event.key === "H" ||
            event.key === "+" ||
            event.key === "-" ||
            event.key === "=" ||
            event.key === "0")
        ) {
          blockNavigation(event)
        }
      }}
      onKeyUpCapture={(event) =>
        event.code === "Space" && blockNavigation(event)
      }
    >
      <img
        src={page.studentScriptImage}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          height: `${(page.canvas.pixelHeight / canvasHeight) * 100}%`,
        }}
      />
      <Excalidraw
        initialData={{
          elements,
          scrollToContent: false,
          appState: {
            currentItemStrokeColor: "#d62f2f",
            viewBackgroundColor: "transparent",
          },
        }}
        onChange={(nextElements) => onElementsChange?.(nextElements)}
        viewModeEnabled={false}
        zenModeEnabled={false}
        gridModeEnabled={false}
        excalidrawAPI={(nextApi) => {
          setApi(nextApi)
          onApi?.(nextApi)
        }}
        UIOptions={{
          canvasActions: {
            clearCanvas: false,
            export: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
          tools: { image: false },
        }}
      />
    </div>
  )
}
