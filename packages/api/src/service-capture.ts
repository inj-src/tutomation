import { readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

import sharp from "sharp"

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

function normalizedScriptPath(
  page: EvaluationCapture["pages"][number]
): string {
  return join(
    dirname(page.studentScriptPath),
    `student-script-normalized-${page.imageIndex + 1}.png`
  )
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
      capture.pages.map(async (page) => {
        const image = await readFile(normalizedScriptPath(page))
        const metadata = await sharp(image).metadata()
        if (!metadata.width || !metadata.height) {
          throw new Error(
            `Could not read normalized image dimensions for page ${page.imageIndex + 1}.`
          )
        }

        return {
          imageIndex: page.imageIndex,
          imageOrder: page.imageOrder,
          orientation: page.orientation,
          canvas: {
            cssWidth: metadata.width,
            cssHeight: metadata.height,
            pixelWidth: metadata.width,
            pixelHeight: metadata.height,
          },
          studentScriptImage: dataUrl(image),
        }
      })
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
