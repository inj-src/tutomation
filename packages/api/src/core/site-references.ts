import { mkdir } from "node:fs/promises"

import type { Locator, Page } from "playwright"

const sampleContentSelector =
  "#toggleCE:visible, .modal-content:visible, .bootbox-body:visible, .modal:visible, [role=dialog]:visible"

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready
  })
}

async function locateQuestion(page: Page): Promise<Locator> {
  const content = page
    .locator(".questionResize:visible, .question-ans-text:visible")
    .first()
  await content.waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForFunction(
    () => {
      const element = document.querySelector(
        ".questionResize, .question-ans-text"
      )
      if (!element || !(element.textContent?.trim().length ?? 0)) return false
      return [...element.querySelectorAll("img")].every(
        (image) => image.complete
      )
    },
    undefined,
    { timeout: 30_000 }
  )
  await waitForFonts(page)
  const marker = page.locator("strong, b", { hasText: "Question" }).first()
  if ((await marker.count()) === 0) return content
  const block = marker.locator("xpath=ancestor::th[1]")
  return (await block.isVisible()) ? block : content
}

async function locateSampleTrigger(page: Page): Promise<Locator> {
  const trigger = page.locator("#SampleAns").first()
  await trigger.waitFor({ state: "visible", timeout: 30_000 })
  return trigger
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

export async function captureReferences(
  page: Page,
  outputDirectory: string
): Promise<{ questionPath: string; sampleAnswerPath: string }> {
  await mkdir(outputDirectory, { recursive: true })
  const questionPath = `${outputDirectory}/question.png`
  const question = await locateQuestion(page)
  await question.screenshot({ path: questionPath, animations: "disabled" })

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
  return { questionPath, sampleAnswerPath }
}
