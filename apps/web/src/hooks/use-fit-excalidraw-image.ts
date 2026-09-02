import { useEffect } from "react"
import type {
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types"

export function useFitExcalidrawImage(
  api: ExcalidrawImperativeAPI | undefined,
  imageWidth: number,
  imageHeight: number,
  layoutWidth: number | string,
  layoutHeight: number | string
) {
  useEffect(() => {
    if (!api) return
    const frame = requestAnimationFrame(() => {
      const { width, height } = api.getAppState()
      if (!width || !height) return
      const zoom = Math.min(width / imageWidth, height / imageHeight)
      const normalizedZoom = Math.max(
        0.1,
        Math.min(30, Number(zoom.toFixed(6)))
      ) as NormalizedZoomValue
      api.updateScene({
        appState: {
          zoom: { value: normalizedZoom },
          scrollX: 0,
          scrollY: 0,
        },
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [api, imageHeight, imageWidth, layoutHeight, layoutWidth])
}
