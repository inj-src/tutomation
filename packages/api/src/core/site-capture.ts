import { mkdir, writeFile } from "node:fs/promises"

import sharp from "sharp"
import type { Page } from "playwright"

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
      const slide = slides[imageIndex]
      const studentScriptPath = `${outputDirectory}/student-script-${imageIndex + 1}.png`
      await sharp(image.bytes).png().toFile(studentScriptPath)
      return {
        imageIndex,
        imageOrder: slide.imageOrder,
        studentScriptPath,
        canvas: {
          cssWidth: image.width,
          cssHeight: image.height,
          pixelWidth: image.width,
          pixelHeight: image.height,
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
        evaluationUrl: script.evaluationUrl,
        maxScore: script.maxScore,
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
