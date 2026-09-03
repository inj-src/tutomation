import { mkdir } from "node:fs/promises"

import type { Locator, Page } from "playwright"

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready
  })
}

async function waitForRenderedContent(
  page: Page,
  content: Locator,
  timeout = 30_000
): Promise<void> {
  await content.waitFor({ state: "visible", timeout })
  const handle = await content.elementHandle()
  if (!handle) throw new Error("The reference content could not be located.")
  await page.waitForFunction(
    (element) => {
      if (!(element instanceof HTMLElement) || !element.innerText.trim()) {
        return false
      }
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      return (
        [...element.querySelectorAll("img")].every(
          (image) => image.complete && image.naturalWidth > 0
        ) &&
        [...element.querySelectorAll("mjx-container")].every((math) => {
          const mathRect = math.getBoundingClientRect()
          return mathRect.width > 0 && mathRect.height > 0
        })
      )
    },
    handle,
    { timeout }
  )
  await waitForFonts(page)
}

async function locateQuestionHeader(page: Page): Promise<{
  header: Locator
  trigger: Locator
}> {
  const trigger = page.locator("#SampleAns").first()
  await trigger.waitFor({ state: "visible", timeout: 30_000 })
  const header = trigger.locator("xpath=ancestor::thead[1]")
  await header.waitFor({ state: "visible", timeout: 30_000 })
  const question = header
    .locator(".questionResize:visible, .question-ans-text:visible")
    .filter({ hasText: /\S/ })
    .first()
  await waitForRenderedContent(page, question)
  return { header, trigger }
}

export async function captureReferences(
  page: Page,
  outputDirectory: string
): Promise<{ referencePath: string }> {
  await mkdir(outputDirectory, { recursive: true })
  const { header, trigger } = await locateQuestionHeader(page)
  const answer = page.locator("#toggleCE").first()

  try {
    await trigger.click()
    await waitForRenderedContent(page, answer, 10_000)
    const referencePath = `${outputDirectory}/reference.png`
    await header.screenshot({ path: referencePath, animations: "disabled" })
    return { referencePath }
  } finally {
    await page.keyboard.press("Escape").catch(() => undefined)
  }
}
