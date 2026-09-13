import { readFile } from "node:fs/promises"
import { basename, dirname } from "node:path"

import type { EvaluationCapture, ScriptCandidate } from "./core/site.js"

export type PublicCapture = {
  status: "capturing" | "ready" | "failed"
  error?: string
  candidate: ScriptCandidate
  evaluationUrl: string
  maxScore: number
  captureId: string
  runDirectory: string
  referenceImage?: string
  pages: PublicScriptPage[]
}

export type PublicScriptPage = {
  imageIndex: number
  imageOrder: number
  orientation: EvaluationCapture["pages"][number]["orientation"]
  canvas: EvaluationCapture["pages"][number]["canvas"]
  studentScriptImage: string
}

export function timestamp(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join("_")
}

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`
}

export async function publicCapture(
  candidate: ScriptCandidate,
  capture: EvaluationCapture
): Promise<PublicCapture> {
  const runDirectory = dirname(
    capture.pages[0]?.studentScriptPath ?? capture.metadataPath
  )
  const [referenceImage, pages] = await Promise.all([
    readFile(capture.referencePath).then(dataUrl),
    Promise.all(
      capture.pages.map(async (page) => ({
        imageIndex: page.imageIndex,
        imageOrder: page.imageOrder,
        orientation: page.orientation,
        canvas: page.canvas,
        studentScriptImage: dataUrl(await readFile(page.studentScriptPath)),
      }))
    ),
  ])

  return {
    status: "ready",
    candidate,
    evaluationUrl: capture.evaluationUrl,
    maxScore: capture.maxScore,
    captureId: basename(runDirectory),
    runDirectory,
    referenceImage,
    pages,
  }
}
