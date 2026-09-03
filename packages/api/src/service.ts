import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { CategoryEvaluator } from "./core/evaluator.js"
import {
  candidateId,
  type ScriptCandidate,
  type ScriptCategory,
  TeacherSite,
} from "./core/site.js"
import type { GeneratedEvaluation } from "./core/types.js"
import type { TeacherCredentials } from "./core/auth.js"
import {
  publicCapture,
  scriptPublicCapture,
  timestamp,
  type PublicCapture,
  type StoredCapture,
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

export class TeacherBrowserService {
  private readonly site = new TeacherSite()
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
      const candidates = await site.listCandidates(category)
      const activeIds = new Set(candidates.map(candidateId))
      for (const [id, candidate] of this.candidates) {
        if (candidate.examId === examId && !activeIds.has(id)) {
          this.candidates.delete(id)
          this.captures.delete(id)
        }
      }
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
    const script = await site.captureScript(candidate, outputDirectory)
    const stored = {
      candidate,
      script,
      publicCapture: await scriptPublicCapture(candidate, script),
    } satisfies StoredCapture
    this.captures.set(id, stored)

    return stored
  }

  private scheduleReferences(stored: StoredCapture): void {
    if (stored.referencesReady) return
    stored.referencesReady = this.enqueue(async (referenceSite) => {
      try {
        const capture = await referenceSite.finishCapture(
          stored.candidate,
          stored.script
        )
        stored.capture = capture
        stored.publicCapture = await publicCapture(stored.candidate, capture)
      } catch (error) {
        stored.publicCapture = {
          ...stored.publicCapture,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
  }

  async capture(id: string): Promise<PublicCapture> {
    const existing = this.captures.get(id)
    if (existing?.publicCapture.status === "failed") this.captures.delete(id)
    else if (existing) return existing.publicCapture

    return this.enqueue(async (site) => {
      const current = this.captures.get(id)
      if (current?.publicCapture.status === "failed") {
        this.captures.delete(id)
      }
      const stored = await this.captureOnSite(site, id)
      this.scheduleReferences(stored)
      return stored.publicCapture
    })
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
      if (stored.referencesReady) await stored.referencesReady
      else if (!stored.capture) {
        try {
          stored.capture = await site.finishCapture(
            stored.candidate,
            stored.script
          )
          stored.publicCapture = await publicCapture(
            stored.candidate,
            stored.capture
          )
        } catch (error) {
          throw new ApiError(
            error instanceof Error ? error.message : String(error),
            500,
            "REFERENCE_CAPTURE_FAILED"
          )
        }
      }
      if (!stored.capture) {
        throw new ApiError(
          stored.publicCapture.error ??
            "The question and sample answer could not be captured.",
          500,
          "REFERENCE_CAPTURE_FAILED"
        )
      }
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
            referencePath: stored.capture.referencePath,
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
