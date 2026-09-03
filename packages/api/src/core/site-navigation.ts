import type { Page } from "playwright"

import type { ScriptCandidate } from "./site.js"
import { candidateEvaluationUrl } from "./site-url.js"

export const evaluationPagePattern =
  /\/(?:ExamOnlineWrittenQuestionDisplay|ExamSaqQuestionDisplay)(?:\?|$)/i

type RecordValue = Record<string, unknown>
type RunningResponse = {
  isSuccess?: boolean
  messasge?: string
  message?: string
  runningDto?: RecordValue | null
}

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined
}

function runningValue(running: RecordValue, key: string): string {
  const nested = Object.values(running)
    .map(record)
    .find((value) => {
      return Boolean(
        value && (key in value || "UniqueSetQuestionSerial" in value)
      )
    })
  return String(nested?.[key] ?? running[key] ?? "")
}

function isRequestedRunning(
  running: RecordValue,
  candidate: ScriptCandidate
): boolean {
  return (
    runningValue(running, "ExamId") === candidate.examId &&
    runningValue(running, "CourseId") === candidate.courseId &&
    runningValue(running, "SubjectId") === candidate.subjectId &&
    runningValue(running, "UniqueSet") === candidate.uniqueSet &&
    runningValue(running, "UniqueSetQuestionSerial") ===
      candidate.uniqueSetQuestionSerial &&
    (runningValue(running, "QuestionVersion") === candidate.questionVersion ||
      runningValue(running, "Version") === candidate.questionVersion)
  )
}

async function checkRunning(page: Page): Promise<RecordValue | null> {
  const response = await page.evaluate(async () => {
    const result = await fetch(
      "/Teacher/SaqEvaluation/CheckForRunningSaqOnlineWrittenExamEvaluation",
      {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }
    )
    return {
      ok: result.ok,
      status: result.status,
      payload: (await result.json()) as RunningResponse,
    }
  })
  if (!response.ok || !response.payload.isSuccess) {
    throw new Error(
      response.payload.messasge ??
        response.payload.message ??
        `Running-session check failed with status ${response.status}.`
    )
  }
  return response.payload.runningDto ?? null
}

async function removeCurrentRunning(page: Page): Promise<void> {
  const response = await page.evaluate(async () => {
    const result = await fetch(
      "/Teacher/SaqEvaluation/RemoveCurrentRunningOnlineWrittenExamEvaluation",
      {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      }
    )
    return {
      ok: result.ok,
      status: result.status,
      payload: (await result.json()) as RunningResponse,
    }
  })
  if (!response.ok || !response.payload.isSuccess) {
    throw new Error(
      response.payload.messasge ??
        response.payload.message ??
        `Running-session removal failed with status ${response.status}.`
    )
  }
}

async function exitEvaluation(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const form = document.querySelector<HTMLFormElement>(
      "#ExamSaqQuestionDisplayForm, #ExamOnlineWrittenQuestionDisplayForm"
    )
    if (!form)
      return { ok: false, status: 0, error: "Evaluation form not found." }

    const submitText = form.querySelector<HTMLInputElement>("#FormSubmitText")
    if (submitText) submitText.value = "Exit"
    const body = new URLSearchParams()
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string") body.append(key, value)
    }
    const response = await fetch(form.action, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })
    return { ok: response.ok, status: response.status, error: "" }
  })
  if (!result.ok) {
    throw new Error(
      result.error || `Evaluation exit failed with status ${result.status}.`
    )
  }
}

async function releaseRunning(page: Page): Promise<void> {
  if (evaluationPagePattern.test(page.url())) {
    await exitEvaluation(page)
    return
  }
  await removeCurrentRunning(page)
}

async function isCandidateEvaluation(
  page: Page,
  candidate: ScriptCandidate
): Promise<boolean> {
  if (!evaluationPagePattern.test(page.url())) return false

  return page.evaluate(
    (expected) =>
      Object.entries(expected).every(
        ([id, value]) =>
          document.querySelector<HTMLInputElement>(`#${id}`)?.value === value
      ),
    {
      ExamsId: candidate.examId,
      CourseId: candidate.courseId,
      SubjectId: candidate.subjectId,
      UniqueSet: candidate.uniqueSet,
      QuestionSerial: candidate.uniqueSetQuestionSerial,
      QuestionVersion: candidate.questionVersion,
    }
  )
}

async function waitForCandidateCanvas(page: Page): Promise<void> {
  await page.locator("canvas:visible").first().waitFor({
    state: "visible",
    timeout: 30_000,
  })
}

export async function startCandidate(
  page: Page,
  candidate: ScriptCandidate,
  clearCapturedResponses: () => void
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const running = await checkRunning(page)
    if (running && !isRequestedRunning(running, candidate)) {
      await releaseRunning(page)
      clearCapturedResponses()
    }

    await page.goto(candidateEvaluationUrl(candidate), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    })

    if (await isCandidateEvaluation(page, candidate)) {
      await waitForCandidateCanvas(page)
      return
    }

    if (attempt === 1) {
      throw new Error(
        `The website kept loading a different evaluation instead of the requested script: ${page.url()}`
      )
    }
    await releaseRunning(page)
    clearCapturedResponses()
  }
}
