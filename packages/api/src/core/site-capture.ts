import { mkdir, writeFile } from "node:fs/promises"

import sharp from "sharp"
import type { Locator, Page, Response as PlaywrightResponse } from "playwright"

import type { EvaluationCapture, ScriptCandidate } from "./site.js"
import {
  isPotentialImage,
  largestDownloadedImage,
} from "./site-network-image.js"

const evaluationPagePattern =
  /\/(?:ExamOnlineWrittenQuestionDisplay|ExamSaqQuestionDisplay)(?:\?|$)/i
const sampleContentSelector =
  "#toggleCE:visible, .modal-content:visible, .bootbox-body:visible, .modal:visible, [role=dialog]:visible"

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function candidateButtonSelector(candidate: ScriptCandidate): string {
  return [
    `.btnStartEvaluation[data-examid="${candidate.examId}"]`,
    `[data-courseid="${candidate.courseId}"]`,
    `[data-subjectid="${candidate.subjectId}"]`,
    `[data-uniqueset="${candidate.uniqueSet}"]`,
    `[data-uniquesetquestionserial="${candidate.uniqueSetQuestionSerial}"]`,
    `[data-questionversion="${candidate.questionVersion}"]`,
    `[data-pendingquestion="${candidate.pendingQuestion}"]`,
  ].join("")
}

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready
  })
}

async function locateQuestion(page: Page): Promise<Locator> {
  const marker = page.getByText(/Question\s*:/i).first()
  await marker.waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForFunction(
    () => {
      const content = document.querySelector(".questionResize")
      if (!content) return false
      const hasContent =
        (content.textContent?.trim().length ?? 0) > 0 ||
        Boolean(content.querySelector("img, svg, math, canvas"))
      const images = [...content.querySelectorAll("img")]
      return hasContent && images.every((image) => image.complete)
    },
    undefined,
    { timeout: 30_000 }
  )
  const block = marker.locator("xpath=ancestor::th[1]")
  return (await block.first().isVisible()) ? block.first() : marker
}

async function locateSampleTrigger(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: /Sample Answer/i }).first()
  if ((await button.count()) > 0) return button

  const link = page.getByRole("link", { name: /Sample Answer/i }).first()
  if ((await link.count()) > 0) return link

  const fallback = page.getByText(/Sample Answer/i).first()
  await fallback.waitFor({ state: "visible", timeout: 30_000 })
  return fallback
}

async function startCandidate(
  page: Page,
  candidate: ScriptCandidate
): Promise<void> {
  const button = page.locator(candidateButtonSelector(candidate))
  if ((await button.count()) === 0) {
    throw new Error(
      "The selected script is no longer available. Reload the script list and choose another entry."
    )
  }

  await button.click()
  try {
    await page.waitForURL(evaluationPagePattern, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    })
    await page.waitForLoadState("load")
    await page.locator("canvas:visible").first().waitFor({
      state: "visible",
      timeout: 30_000,
    })
  } catch {
    const dialog = page.locator(
      ".bootbox:visible, .modal:visible, [role=dialog]:visible"
    )
    const dialogText =
      (await dialog.count()) > 0 ? text(await dialog.last().innerText()) : ""
    if (dialogText) {
      throw new Error(
        `The website did not start the script because it reported: ${dialogText}. Resolve it on the site and retry.`
      )
    }
    throw new Error(
      `Start Evaluation did not navigate to the evaluation page. Current URL: ${page.url()}`
    )
  }
}

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

async function openSampleAnswer(page: Page, trigger: Locator): Promise<Page> {
  const popup = page.waitForEvent("popup", { timeout: 10_000 })
  const samePage = page
    .locator(sampleContentSelector)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => page)

  await trigger.click()
  try {
    return await Promise.any([popup, samePage])
  } catch {
    throw new Error(
      "Sample Answer was opened, but no answer container appeared."
    )
  }
}

export async function captureEvaluation(
  page: Page,
  candidate: ScriptCandidate,
  outputDirectory: string
): Promise<EvaluationCapture> {
  const responses: PlaywrightResponse[] = []
  const collectResponse = (response: PlaywrightResponse) => {
    if (isPotentialImage(response)) responses.push(response)
  }
  page.on("response", collectResponse)

  try {
    await startCandidate(page, candidate)
  } finally {
    page.off("response", collectResponse)
  }

  const networkImage = await largestDownloadedImage(responses)
  const canvas = await largestCanvas(page)
  const question = await locateQuestion(page)
  await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    waitForFonts(page),
  ])

  const bodyText = await page.locator("body").innerText()
  const maxScore = Number(
    bodyText.match(/Full\s*Marks\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? 0
  )
  if (!maxScore)
    throw new Error("Could not read Full Marks from the evaluation page.")

  const questionPath = `${outputDirectory}/question.png`
  const studentScriptPath = `${outputDirectory}/student-script.png`
  await Promise.all([
    question.screenshot({ path: questionPath, animations: "disabled" }),
    sharp(networkImage.bytes).png().toFile(studentScriptPath),
  ])

  const samplePage = await openSampleAnswer(
    page,
    await locateSampleTrigger(page)
  )
  await samplePage.waitForLoadState("domcontentloaded").catch(() => undefined)
  await waitForFonts(samplePage)
  const sampleContent = samplePage.locator(sampleContentSelector).first()
  await sampleContent.waitFor({ state: "visible", timeout: 10_000 })
  const sampleAnswerPath = `${outputDirectory}/sample-answer.png`
  await sampleContent.screenshot({
    path: sampleAnswerPath,
    animations: "disabled",
  })

  if (samplePage !== page) await samplePage.close()
  else await page.keyboard.press("Escape").catch(() => undefined)

  const metadataPath = `${outputDirectory}/metadata.json`
  const imageCanvas = {
    cssWidth: canvas.cssWidth,
    cssHeight: canvas.cssHeight,
    pixelWidth: networkImage.width,
    pixelHeight: networkImage.height,
  }
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        candidate,
        evaluationUrl: page.url(),
        maxScore,
        viewport: page.viewportSize(),
        deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
        canvas: imageCanvas,
      },
      null,
      2
    )
  )

  return {
    questionPath,
    sampleAnswerPath,
    studentScriptPath,
    metadataPath,
    evaluationUrl: page.url(),
    maxScore,
    canvas: imageCanvas,
  }
}
