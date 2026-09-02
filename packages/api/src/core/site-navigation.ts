import type { Page } from "playwright"

import type { ScriptCandidate } from "./site.js"
import { candidateEvaluationUrl } from "./site-url.js"

const evaluationPagePattern =
  /\/(?:ExamOnlineWrittenQuestionDisplay|ExamSaqQuestionDisplay)(?:\?|$)/i

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

function isCandidateEvaluation(
  urlValue: string,
  candidate: ScriptCandidate
): boolean {
  const url = new URL(urlValue)
  if (!evaluationPagePattern.test(url.toString())) return false
  return Object.entries({
    examId: candidate.examId,
    courseId: candidate.courseId,
    subjectId: candidate.subjectId,
    uniqueSet: candidate.uniqueSet,
    uniqueSetQuestionSerial: candidate.uniqueSetQuestionSerial,
    questionVersion: candidate.questionVersion,
    pendingQuestion: candidate.pendingQuestion,
  }).every(([key, value]) => url.searchParams.get(key) === value)
}

async function waitForCandidateCanvas(page: Page): Promise<void> {
  await page.locator("canvas:visible").first().waitFor({
    state: "visible",
    timeout: 30_000,
  })
}

async function exitEvaluation(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL((url) => !evaluationPagePattern.test(url.toString()), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    }),
    page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        "#ExamSaqQuestionDisplayForm, #ExamOnlineWrittenQuestionDisplayForm"
      )
      const submitText =
        document.querySelector<HTMLInputElement>("#FormSubmitText")
      if (!form || !submitText)
        throw new Error("The evaluation exit form was not found.")
      submitText.value = "Exit"
      HTMLFormElement.prototype.submit.call(form)
    }),
  ])
}

async function resetToDetails(
  page: Page,
  candidate: ScriptCandidate,
  clearCapturedResponses: () => void
): Promise<void> {
  await exitEvaluation(page)
  clearCapturedResponses()
  await page.goto(candidate.detailsUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  })
}

export async function startCandidate(
  page: Page,
  candidate: ScriptCandidate,
  clearCapturedResponses: () => void
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const button = page.locator(candidateButtonSelector(candidate))
    if ((await button.count()) === 0) {
      if (!evaluationPagePattern.test(page.url())) {
        await page.goto(candidateEvaluationUrl(candidate), {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        })
      }
      if (isCandidateEvaluation(page.url(), candidate)) {
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        })
        await waitForCandidateCanvas(page)
        return
      }
      if (!evaluationPagePattern.test(page.url())) {
        throw new Error(
          "The selected script is no longer available. Reload the script list and choose another entry."
        )
      }
      if (attempt === 1) {
        throw new Error(
          `The website kept redirecting to ${page.url()} instead of the requested script.`
        )
      }
      await resetToDetails(page, candidate, clearCapturedResponses)
      continue
    }

    await button.click()
    try {
      const dialog = page
        .locator(".bootbox:visible, .modal:visible, [role=dialog]:visible")
        .last()
      const outcome = await Promise.race([
        page
          .waitForURL(evaluationPagePattern, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          })
          .then(() => "evaluation" as const),
        dialog
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(() => "dialog" as const),
      ])

      if (outcome === "dialog") {
        const dialogText = text(await dialog.innerText())
        const yes = dialog.getByRole("button", { name: "Yes", exact: true })
        if (
          !/switch|running|existing/i.test(dialogText) ||
          (await yes.count()) === 0
        ) {
          throw new Error(
            `The website did not start the script because it reported: ${dialogText}. Resolve it on the site and retry.`
          )
        }
        await Promise.all([
          page.waitForURL(evaluationPagePattern, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          }),
          yes.click(),
        ])
      }

      if (!isCandidateEvaluation(page.url(), candidate)) {
        if (attempt === 1) {
          throw new Error(
            `The website kept redirecting to ${page.url()} instead of the requested script.`
          )
        }
        await resetToDetails(page, candidate, clearCapturedResponses)
        continue
      }

      await waitForCandidateCanvas(page)
      return
    } catch (error) {
      if (
        error instanceof Error &&
        /instead of the requested script/.test(error.message)
      ) {
        throw error
      }
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
        `Start Evaluation did not navigate to the requested evaluation page. Current URL: ${page.url()}`
      )
    }
  }
}
