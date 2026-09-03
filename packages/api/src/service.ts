import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { CategoryEvaluator } from "./core/evaluator.js"
import {
  type ScriptCandidate,
  type ScriptCategory,
  TeacherSite,
} from "./core/site.js"
import type { GeneratedEvaluation } from "./core/types.js"
import type { TeacherCredentials } from "./core/auth.js"
import {
  publicCapture,
  timestamp,
  type PublicCapture,
} from "./service-capture.js"

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

type CaptureRun = {
  candidate: ScriptCandidate
  capture: Awaited<ReturnType<TeacherSite["finishCapture"]>>
  publicCapture: PublicCapture
}

export class TeacherBrowserService {
  private readonly site = new TeacherSite()
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
      return categories
    })
  }

  async listCandidates(examId: string): Promise<ScriptCandidate[]> {
    return this.enqueue(async (site) => {
      const category = (await site.listCategories()).find(
        (value) => value.examId === examId
      )
      if (!category) {
        throw new ApiError(
          "This script category is no longer available. Reload the category list.",
          404,
          "CATEGORY_NOT_FOUND"
        )
      }
      return site.listCandidates(category)
    })
  }

  private async resolveCandidate(
    site: TeacherSite,
    id: string
  ): Promise<ScriptCandidate> {
    const parts = id.split("~")
    const examId = parts[0]
    if (!examId || (parts.length !== 6 && parts.length !== 7)) {
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

    const candidate = (await site.listCandidates(category)).find((value) =>
      [
        value.examId,
        value.courseId,
        value.subjectId,
        value.uniqueSet,
        value.uniqueSetQuestionSerial,
        value.questionVersion,
      ].every((field, index) => field === parts[index])
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
  ): Promise<CaptureRun> {
    const candidate = await this.resolveCandidate(site, id)
    const outputDirectory = join(
      runsDirectory,
      `${timestamp()}-exam-${candidate.examId}-script-${candidate.pendingQuestion}`
    )
    const script = await site.captureScript(candidate, outputDirectory)
    const capture = await site.finishCapture(candidate, script)
    return {
      candidate,
      capture,
      publicCapture: await publicCapture(candidate, capture),
    }
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
      const run = await this.captureOnSite(site, id)
      const key = categoryKey(run.candidate)
      const evaluator = this.evaluators.get(key) ?? new CategoryEvaluator(key)
      this.evaluators.set(key, evaluator)

      const evaluation = this.sessionsStarted.has(key)
        ? await evaluator.evaluateNext({
            studentScriptPath: run.capture.studentScriptPath,
            maxScore: run.capture.maxScore,
            scriptId: id,
            retryNote,
          })
        : await evaluator.evaluateFirst({
            referencePath: run.capture.referencePath,
            studentScriptPath: run.capture.studentScriptPath,
            maxScore: run.capture.maxScore,
          })
      this.sessionsStarted.add(key)

      return {
        candidate: run.candidate,
        capture: run.publicCapture,
        evaluation,
      }
    })
  }

  async close(): Promise<void> {
    await this.queue
    await this.site.close()
  }
}
