import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { CategoryEvaluator } from "./core/evaluator.js"
import {
  candidateId,
  type EvaluationCapture,
  type ScriptCandidate,
  type ScriptCategory,
  TeacherSite,
} from "./core/site.js"
import type { GeneratedEvaluation } from "./core/types.js"
import type { TeacherCredentials } from "./core/auth.js"

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url))
const runsDirectory = process.env.RUNS_DIR ?? join(repositoryRoot, "runs")

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 404 | 409 | 500 = 500,
    readonly code = "INTERNAL_ERROR"
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export type PublicCapture = {
  candidate: ScriptCandidate
  evaluationUrl: string
  maxScore: number
  canvas: EvaluationCapture["canvas"]
  runDirectory: string
  questionImage: string
  sampleAnswerImage: string
  studentScriptImage: string
}

type StoredCapture = {
  candidate: ScriptCandidate
  capture: EvaluationCapture
  publicCapture: PublicCapture
}

function timestamp(): string {
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

async function publicCapture(
  candidate: ScriptCandidate,
  capture: EvaluationCapture
): Promise<PublicCapture> {
  const [questionImage, sampleAnswerImage, studentScriptImage] =
    await Promise.all([
      readFile(capture.questionPath).then(dataUrl),
      readFile(capture.sampleAnswerPath).then(dataUrl),
      readFile(capture.studentScriptPath).then(dataUrl),
    ])

  return {
    candidate,
    evaluationUrl: capture.evaluationUrl,
    maxScore: capture.maxScore,
    canvas: capture.canvas,
    runDirectory: dirname(capture.studentScriptPath),
    questionImage,
    sampleAnswerImage,
    studentScriptImage,
  }
}

function categoryKey(candidate: ScriptCandidate): string {
  return [
    candidate.examId,
    candidate.courseId,
    candidate.subjectId,
    candidate.uniqueSet,
    candidate.uniqueSetQuestionSerial,
    candidate.questionVersion,
  ].join("-")
}

export class TeacherBrowserService {
  private readonly site = new TeacherSite()
  private readonly categories = new Map<string, ScriptCategory>()
  private readonly captures = new Map<string, StoredCapture>()
  private readonly candidates = new Map<string, ScriptCandidate>()
  private readonly evaluators = new Map<string, CategoryEvaluator>()
  private readonly sessionsStarted = new Set<string>()
  private queue: Promise<void> = Promise.resolve()

  private enqueue<T>(work: (site: TeacherSite) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      await this.site.open()
      return work(this.site)
    })
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  async login(credentials: TeacherCredentials): Promise<void> {
    return this.enqueue((site) => site.login(credentials))
  }

  async listCategories(): Promise<ScriptCategory[]> {
    return this.enqueue(async (site) => {
      const categories = await site.listCategories()
      for (const category of categories) {
        this.categories.set(category.examId, category)
      }
      return categories
    })
  }

  async listCandidates(examId: string): Promise<ScriptCandidate[]> {
    return this.enqueue(async (site) => {
      const category =
        this.categories.get(examId) ??
        (await site.listCategories()).find((value) => value.examId === examId)
      if (!category) {
        throw new ApiError(
          "This script category is no longer available. Reload the category list.",
          404,
          "CATEGORY_NOT_FOUND"
        )
      }
      const candidates = await site.listCandidates(category)
      for (const candidate of candidates) {
        this.candidates.set(candidateId(candidate), candidate)
      }
      return candidates
    })
  }

  private async resolveCandidate(
    site: TeacherSite,
    id: string
  ): Promise<ScriptCandidate> {
    const known = this.candidates.get(id)
    if (known) return known

    const [examId] = id.split("~")
    if (!examId || id.split("~").length !== 7) {
      throw new ApiError(
        "The selected script identifier is invalid.",
        400,
        "INVALID_ENTRY"
      )
    }

    const categories = await site.listCategories()
    const category = categories.find((value) => value.examId === examId)
    if (!category) {
      throw new ApiError(
        "This script category is no longer available. Reload the category list.",
        404,
        "CATEGORY_NOT_FOUND"
      )
    }

    const candidate = (await site.listCandidates(category)).find(
      (value) => candidateId(value) === id
    )
    if (!candidate) {
      throw new ApiError(
        "This script was already evaluated or disappeared. Reload the entries and choose another script.",
        409,
        "ENTRY_STALE"
      )
    }
    return candidate
  }

  private async captureOnSite(
    site: TeacherSite,
    id: string
  ): Promise<StoredCapture> {
    const existing = this.captures.get(id)
    if (existing) {
      return existing
    }

    const candidate = await this.resolveCandidate(site, id)
    const outputDirectory = join(
      runsDirectory,
      `${timestamp()}-exam-${candidate.examId}-script-${candidate.pendingQuestion}`
    )
    const capture = await site.capture(candidate, outputDirectory)
    const stored: StoredCapture = {
      candidate,
      capture,
      publicCapture: await publicCapture(candidate, capture),
    }
    this.captures.set(id, stored)
    return stored
  }

  async capture(id: string): Promise<PublicCapture> {
    return this.enqueue(
      async (site) => (await this.captureOnSite(site, id)).publicCapture
    )
  }

  async evaluate(
    id: string,
    retryNote?: string
  ): Promise<{
    candidate: ScriptCandidate
    capture: PublicCapture
    evaluation: GeneratedEvaluation
  }> {
    return this.enqueue(async (site) => {
      const stored = await this.captureOnSite(site, id)
      const key = categoryKey(stored.candidate)
      const evaluator = this.evaluators.get(key) ?? new CategoryEvaluator(key)
      this.evaluators.set(key, evaluator)

      const evaluation = this.sessionsStarted.has(key)
        ? await evaluator.evaluateNext({
            studentScriptPath: stored.capture.studentScriptPath,
            maxScore: stored.capture.maxScore,
            scriptId: id,
            retryNote,
          })
        : await evaluator.evaluateFirst({
            questionPath: stored.capture.questionPath,
            sampleAnswerPath: stored.capture.sampleAnswerPath,
            studentScriptPath: stored.capture.studentScriptPath,
            maxScore: stored.capture.maxScore,
          })
      this.sessionsStarted.add(key)

      return {
        candidate: stored.candidate,
        capture: stored.publicCapture,
        evaluation,
      }
    })
  }

  async close(): Promise<void> {
    await this.queue
    await this.site.close()
  }
}
