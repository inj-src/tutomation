import type { Page } from "playwright"

import { candidateId, type ScriptCandidate } from "./site.js"
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

export type RunningEvaluation = {
  id: string
  examId: string
  courseId: string
  subjectId: string
  uniqueSet: string
  uniqueSetQuestionSerial: string
  questionVersion: string
  evaluationUrl: string
}

export class RunningEvaluationConflict extends Error {
  constructor(readonly running: RunningEvaluation) {
    super("Another script evaluation is already running.")
    this.name = "RunningEvaluationConflict"
  }
}

export class ScriptUnavailableError extends Error {
  constructor() {
    super("The selected student script is no longer available.")
    this.name = "ScriptUnavailableError"
  }
}

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined
}

function fieldValue(source: RecordValue, key: string): string {
  return String(source[key] ?? "")
}

export function parseRunningEvaluation(
  input: unknown
): RunningEvaluation | null {
  const running = record(input)
  if (!running) return null

  const details = Object.values(running)
    .map(record)
    .find((item) =>
      [
        "ExamId",
        "CourseId",
        "SubjectId",
        "UniqueSet",
        "UniqueSetQuestionSerial",
      ].every((key) => item && key in item)
    )
  if (!details) throw new Error("The running evaluation response is invalid.")

  const examId = fieldValue(details, "ExamId")
  const courseId = fieldValue(details, "CourseId")
  const subjectId = fieldValue(details, "SubjectId")
  const uniqueSet = fieldValue(details, "UniqueSet")
  const uniqueSetQuestionSerial = fieldValue(details, "UniqueSetQuestionSerial")
  const questionVersion =
    fieldValue(details, "QuestionVersion") || fieldValue(details, "Version")
  const id = [
    examId,
    courseId,
    subjectId,
    uniqueSet,
    uniqueSetQuestionSerial,
    questionVersion,
  ].join("~")
  if (id.split("~").some((part) => !part)) {
    throw new Error("The running evaluation identity is incomplete.")
  }

  const path =
    Number(running.StudentScriptType) === 10
      ? "/Teacher/OnlineWrittenEvaluation/ExamOnlineWrittenQuestionDisplay"
      : "/Teacher/SaqEvaluation/ExamSaqQuestionDisplay"
  const evaluationUrl = new URL(path, "https://teacher.udvash-unmesh.com")
  for (const [key, field] of Object.entries({
    examId,
    courseId,
    subjectId,
    uniqueSet,
    uniqueSetQuestionSerial,
    questionVersion,
  })) {
    evaluationUrl.searchParams.set(key, field)
  }

  return {
    id,
    examId,
    courseId,
    subjectId,
    uniqueSet,
    uniqueSetQuestionSerial,
    questionVersion,
    evaluationUrl: evaluationUrl.toString(),
  }
}

export async function checkRunning(
  page: Page
): Promise<RunningEvaluation | null> {
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
  return parseRunningEvaluation(response.payload.runningDto)
}

async function exitEvaluation(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const form = document.querySelector<HTMLFormElement>(
      "#ExamSaqQuestionDisplayForm, #ExamOnlineWrittenQuestionDisplayForm"
    )
    if (!form)
      return { ok: false, status: 0, error: "Evaluation form not found." }

    const body = new URLSearchParams()
    for (const [key, formValue] of new FormData(form).entries()) {
      if (typeof formValue === "string") body.append(key, formValue)
    }
    body.set("FormSubmitText", "Exit")
    const response = await fetch(form.action, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

export async function exitRunningEvaluation(page: Page): Promise<boolean> {
  const running = await checkRunning(page)
  if (!running) return false

  await page.goto(running.evaluationUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  })
  if (!evaluationPagePattern.test(page.url())) {
    throw new Error("The running evaluation page could not be opened.")
  }
  await exitEvaluation(page)
  if (await checkRunning(page)) {
    throw new Error("The running evaluation was not released.")
  }
  return true
}

async function isCandidateEvaluation(
  page: Page,
  candidate: ScriptCandidate
): Promise<boolean> {
  if (!evaluationPagePattern.test(page.url())) return false

  return page.evaluate(
    (expected) =>
      Object.entries(expected).every(
        ([id, expectedValue]) =>
          document.querySelector<HTMLInputElement>(`#${id}`)?.value ===
          expectedValue
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

export async function startCandidate(
  page: Page,
  candidate: ScriptCandidate
): Promise<void> {
  const running = await checkRunning(page)
  if (running && running.id !== candidateId(candidate)) {
    throw new RunningEvaluationConflict(running)
  }

  await page.goto(candidateEvaluationUrl(candidate), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  })
  if (!(await isCandidateEvaluation(page, candidate))) {
    const redirected = await checkRunning(page)
    if (redirected && redirected.id !== candidateId(candidate)) {
      throw new RunningEvaluationConflict(redirected)
    }
    throw new ScriptUnavailableError()
  }

  await page.locator("canvas:visible").first().waitFor({
    state: "visible",
    timeout: 30_000,
  })
}
