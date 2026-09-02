import { mkdir, writeFile } from "node:fs/promises"

import sharp from "sharp"
import type { Page, Response as PlaywrightResponse } from "playwright"

import type { EvaluationCapture, ScriptCandidate } from "./site.js"
import {
  downloadedStudentImage,
  isStudentScriptImage,
} from "./site-network-image.js"
import type { captureReferences } from "./site-references.js"
import { startCandidate } from "./site-navigation.js"

async function largestCanvas(page: Page): Promise<{
  cssWidth: number
  cssHeight: number
  pixelWidth: number
  pixelHeight: number
}> {
  const canvases = page.locator("canvas:visible")
  const count = await canvases.count()
  if (count === 0)
    throw new Error("No visible student-script canvas was found.")

  let selected = canvases.first()
  let largestArea = -1
  for (let index = 0; index < count; index += 1) {
    const candidate = canvases.nth(index)
    const box = await candidate.boundingBox()
    const area = box ? box.width * box.height : 0
    if (area > largestArea) {
      largestArea = area
      selected = candidate
    }
  }

  return selected.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Selected student-script element is not a canvas.")
    }
    const rect = element.getBoundingClientRect()
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelWidth: element.width,
      pixelHeight: element.height,
    }
  })
}

export type ScriptCapture = Omit<
  EvaluationCapture,
  "questionPath" | "sampleAnswerPath"
> & {
  outputDirectory: string
}

export async function captureScript(
  page: Page,
  candidate: ScriptCandidate,
  outputDirectory: string
): Promise<ScriptCapture> {
  const responses: PlaywrightResponse[] = []
  let resolveResponse = (): void => undefined
  let responseReady = Promise.resolve()
  const resetResponses = (): void => {
    responses.splice(0)
    responseReady = new Promise<void>((resolve) => {
      resolveResponse = resolve
    })
  }
  const collectResponse = (response: PlaywrightResponse) => {
    if (isStudentScriptImage(response)) {
      responses.push(response)
      resolveResponse()
    }
  }
  resetResponses()
  page.on("response", collectResponse)

  try {
    await startCandidate(page, candidate, resetResponses)
    if (responses.length === 0) {
      await Promise.race([responseReady, page.waitForTimeout(30_000)])
    }
  } finally {
    page.off("response", collectResponse)
  }

  const networkImage = await downloadedStudentImage(responses)
  const canvas = await largestCanvas(page)
  await mkdir(outputDirectory, { recursive: true })

  const bodyText = await page.locator("body").innerText()
  const maxScore = Number(
    bodyText.match(/Full\s*Marks\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? 0
  )
  if (!maxScore)
    throw new Error("Could not read Full Marks from the evaluation page.")

  const studentScriptPath = `${outputDirectory}/student-script.png`
  await sharp(networkImage.bytes).png().toFile(studentScriptPath)

  return {
    outputDirectory,
    studentScriptPath,
    metadataPath: `${outputDirectory}/metadata.json`,
    evaluationUrl: page.url(),
    maxScore,
    canvas: {
      cssWidth: canvas.cssWidth,
      cssHeight: canvas.cssHeight,
      pixelWidth: networkImage.width,
      pixelHeight: networkImage.height,
    },
  }
}

export async function finalizeCapture(
  page: Page,
  candidate: ScriptCandidate,
  script: ScriptCapture,
  references: Awaited<ReturnType<typeof captureReferences>>
): Promise<EvaluationCapture> {
  const capture: EvaluationCapture = {
    ...script,
    questionPath: references.questionPath,
    sampleAnswerPath: references.sampleAnswerPath,
  }
  await writeFile(
    script.metadataPath,
    JSON.stringify(
      {
        candidate,
        evaluationUrl: script.evaluationUrl,
        maxScore: script.maxScore,
        viewport: page.viewportSize(),
        deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
        canvas: script.canvas,
      },
      null,
      2
    )
  )

  return {
    ...capture,
    canvas: script.canvas,
  }
}
