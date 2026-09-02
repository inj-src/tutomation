import { useLayoutEffect, useRef, useState } from "react"

export function useContainedCanvasSize(ratio: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>()

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return

    const update = () => {
      const { width, height } = parent.getBoundingClientRect()
      const containedWidth = Math.min(width, height * ratio)
      setSize({ width: containedWidth, height: containedWidth / ratio })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [ratio])

  return { ref, style: size ?? { width: "100%", height: "100%" } }
}
