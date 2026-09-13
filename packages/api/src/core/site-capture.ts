import { mkdir, writeFile } from "node:fs/promises"
import { basename } from "node:path"

import sharp from "sharp"
import type { Page } from "playwright"

import {
  correctionRotation,
  type OrientationClassifier,
} from "./orientation.js"
import type { EvaluationCapture, ScriptCandidate } from "./site.js"
import { downloadStudentImages } from "./site-network-image.js"
import type { captureReferences } from "./site-references.js"
import { startCandidate } from "./site-navigation.js"

type ScriptSlide = {
  imageOrder: number
  url: string
}

async function orderedScriptSlides(page: Page): Promise<ScriptSlide[]> {
  const slides = await page
    .locator("[id^='questionImage_'][data-url]")
    .evaluateAll((elements) =>
      elements.map((element, index) => {
        const idIndex = Number(element.id.match(/_(\d+)$/)?.[1] ?? index)
        const orderInput = [
          ...document.querySelectorAll<HTMLInputElement>("input"),
        ].find(
          (input) => input.name === `AnswerImagePaths[${idIndex}].ImageOrder`
        )
        return {
          imageOrder: Number(orderInput?.value) || index + 1,
          url: element.getAttribute("data-url") ?? "",
        }
      })
    )

  return slides
    .filter((slide) => slide.url)
    .sort((left, right) => left.imageOrder - right.imageOrder)
}

export type ScriptCapture = Omit<EvaluationCapture, "referencePath"> & {
  outputDirectory: string
}

export async function captureScript(
  page: Page,
  candidate: ScriptCandidate,
  outputDirectory: string
): Promise<ScriptCapture> {
  await startCandidate(page, candidate)
  const slides = await orderedScriptSlides(page)
  const networkImages = await downloadStudentImages(
    page.request,
    slides.map((slide) => slide.url)
  )
  await mkdir(outputDirectory, { recursive: true })

  const bodyText = await page.locator("body").innerText()
  const maxScore = Number(
    bodyText.match(/Full\s*Marks\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? 0
  )
  if (!maxScore)
    throw new Error("Could not read Full Marks from the evaluation page.")

  const pages = await Promise.all(
    networkImages.map(async (image, imageIndex) => {
      const capturedScriptPath = `${outputDirectory}/student-script-captured-${imageIndex + 1}.bin`
      const studentScriptPath = `${outputDirectory}/student-script-${imageIndex + 1}.png`
      await writeFile(capturedScriptPath, image.bytes)
      const metadata = await sharp(image.bytes).metadata()
      if (!metadata.width || !metadata.height) {
        throw new Error(
          `Could not read captured image dimensions: ${capturedScriptPath}`
        )
      }
      return {
        imageIndex,
        imageOrder: slides[imageIndex].imageOrder,
        capturedScriptPath,
        studentScriptPath,
        orientation: {
          angle: 0 as const,
          confidence: null,
          source: "fallback" as const,
        },
        canvas: {
          cssWidth: metadata.width,
          cssHeight: metadata.height,
          pixelWidth: metadata.width,
          pixelHeight: metadata.height,
        },
      }
    })
  )

  return {
    outputDirectory,
    pages,
    metadataPath: `${outputDirectory}/metadata.json`,
    evaluationUrl: page.url(),
    maxScore,
  }
}

export async function transformCapturedScript(
  script: ScriptCapture,
  orientation: OrientationClassifier
): Promise<ScriptCapture> {
  const normalizedPaths = await Promise.all(
    script.pages.map(async (page) => {
      const path = `${script.outputDirectory}/student-script-normalized-${page.imageIndex + 1}.png`
      await sharp(page.capturedScriptPath).autoOrient().png().toFile(path)
      return path
    })
  )
  const orientations = await orientation.classify(normalizedPaths)
  const pages = await Promise.all(
    script.pages.map(async (page, pagePosition) => {
      const detected = orientations[pagePosition] ?? page.orientation
      const rotation = correctionRotation(detected.angle)
      await sharp(normalizedPaths[pagePosition])
        .rotate(rotation)
        .png()
        .toFile(page.studentScriptPath)
      const metadata = await sharp(page.studentScriptPath).metadata()
      if (!metadata.width || !metadata.height) {
        throw new Error(
          `Could not read corrected image dimensions: ${page.studentScriptPath}`
        )
      }
      return {
        ...page,
        orientation: { ...detected, rotation },
        canvas: {
          cssWidth: metadata.width,
          cssHeight: metadata.height,
          pixelWidth: metadata.width,
          pixelHeight: metadata.height,
        },
      }
    })
  )
  return { ...script, pages }
}

export async function finalizeCapture(
  page: Page,
  candidate: ScriptCandidate,
  script: ScriptCapture,
  references: Awaited<ReturnType<typeof captureReferences>>
): Promise<EvaluationCapture> {
  const capture: EvaluationCapture = {
    ...script,
    referencePath: references.referencePath,
  }
  await writeFile(
    script.metadataPath,
    JSON.stringify(
      {
        candidate,
        captureId: basename(script.outputDirectory),
        evaluationUrl: script.evaluationUrl,
        maxScore: script.maxScore,
        referencePath: references.referencePath,
        viewport: page.viewportSize(),
        deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
        pages: script.pages,
      },
      null,
      2
    )
  )

  return capture
}
