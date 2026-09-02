import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useEffect, useMemo, useState } from "react"
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react"

import { useContainedCanvasSize } from "../hooks/use-contained-canvas-size"
import { useFitExcalidrawImage } from "../hooks/use-fit-excalidraw-image"
import { sceneFor } from "./evaluation-scene"
import type { Capture, EvaluationResult } from "../lib/api"
import "./evaluation-canvas.css"

export function EvaluationCanvas({
  capture,
  evaluation,
  extraBottomSpace,
  revision,
  onApi,
}: {
  capture: Capture
  evaluation?: EvaluationResult["evaluation"]
  extraBottomSpace: number
  revision: number
  onApi?: (api: ExcalidrawImperativeAPI) => void
}) {
  const scene = useMemo(() => sceneFor(evaluation), [evaluation])
  const canvasHeight = capture.canvas.pixelHeight + extraBottomSpace
  const ratio = capture.canvas.pixelWidth / canvasHeight
  const { ref, style } = useContainedCanvasSize(ratio)
  const [api, setApi] = useState<ExcalidrawImperativeAPI>()

  useFitExcalidrawImage(
    api,
    capture.canvas.pixelWidth,
    canvasHeight,
    style.width,
    style.height
  )
  useEffect(() => {
    if (!api || !evaluation) return
    api.updateScene({ elements: scene.elements })
  }, [api, evaluation, scene.elements])
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
        src={capture.studentScriptImage}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          height: `${(capture.canvas.pixelHeight / canvasHeight) * 100}%`,
        }}
      />
      <Excalidraw
        key={`${capture.candidate.pendingQuestion}-${revision}`}
        initialData={{
          elements: scene.elements,
          scrollToContent: false,
          appState: {
            currentItemStrokeColor: "#d62f2f",
            viewBackgroundColor: "transparent",
          },
        }}
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
          tools: {
            image: false,
          },
        }}
      />
    </div>
  )
}
