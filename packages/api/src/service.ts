import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { TeacherCredentials } from "./core/auth.js"
import { loadSavedCapture } from "./core/capture-store.js"
import { CategoryEvaluator } from "./core/evaluator.js"
import { correctionRotation } from "./core/orientation.js"
import { logEvent } from "./core/event-log.js"
import {
  RunningEvaluationConflict,
  ScriptUnavailableError,
} from "./core/site-navigation.js"
import {
  type ScriptCandidate,
  type ScriptCategory,
  TeacherSite,
} from "./core/site.js"
import type { GeneratedEvaluation } from "./core/types.js"
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
    readonly code = "INTERNAL_ERROR",
    readonly details?: unknown
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
  capture: Awaited<ReturnType<TeacherSite["capture"]>>
  publicCapture: PublicCapture
}

function captureExpired(): ApiError {
  return new ApiError(
    "This capture is no longer available. Reload the entry to capture it again.",
    409,
    "CAPTURE_EXPIRED"
  )
}

export class TeacherBrowserService {
  private readonly site = new TeacherSite()
  private readonly evaluators = new Map<string, CategoryEvaluator>()
  private readonly sessionsStarted = new Set<string>()

  async login(credentials: TeacherCredentials): Promise<void> {
    await this.site.login(credentials)
  }

  async start(): Promise<void> {
    await this.site.start()
  }

  async listCategories(): Promise<ScriptCategory[]> {
    return this.site.listCategories()
  }

  async listCandidates(examId: string): Promise<ScriptCandidate[]> {
    const category = (await this.site.listCategories()).find(
      (value) => value.examId === examId
    )
    if (!category) {
      throw new ApiError(
        "This script category is no longer available. Reload the category list.",
        404,
        "CATEGORY_NOT_FOUND"
      )
    }
    return this.site.listCandidates(category)
  }

  private async resolveCandidate(id: string): Promise<ScriptCandidate> {
    const parts = id.split("~")
    const examId = parts[0]
    if (!examId || (parts.length !== 6 && parts.length !== 7)) {
      throw new ApiError(
        "The selected script identifier is invalid.",
        400,
        "INVALID_ENTRY"
      )
    }

    const categories = await this.site.listCategories()
    const category = categories.find((value) => value.examId === examId)
    if (!category) {
      throw new ApiError(
        "This script category is no longer available. Reload the category list.",
        404,
        "CATEGORY_NOT_FOUND"
      )
    }

    const candidate = (await this.site.listCandidates(category)).find((value) =>
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
        "This entry has no pending student scripts.",
        409,
        "ENTRY_STALE"
      )
    }
    return candidate
  }

  private async captureOnce(id: string): Promise<CaptureRun> {
    const candidate = await this.resolveCandidate(id)
    const outputDirectory = join(
      runsDirectory,
      `${timestamp()}-exam-${candidate.examId}-script-${candidate.pendingQuestion}`
    )
    const capture = await this.site.capture(candidate, outputDirectory)
    logEvent("image.orientation.completed", {
      candidateId: id,
      captureId: basename(outputDirectory),
      pages: capture.pages.map((page) => ({
        imageIndex: page.imageIndex,
        imageOrder: page.imageOrder,
        detectedAngle: page.orientation.angle,
        appliedRotation: correctionRotation(page.orientation.angle),
        confidence: page.orientation.confidence,
        source: page.orientation.source,
      })),
    })
    return {
      candidate,
      capture,
      publicCapture: await publicCapture(candidate, capture),
    }
  }

  private async captureOnSite(id: string): Promise<CaptureRun> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.captureOnce(id)
      } catch (error) {
        if (error instanceof ScriptUnavailableError && attempt === 0) continue
        if (error instanceof ScriptUnavailableError) {
          throw new ApiError(error.message, 409, "SCRIPT_UNAVAILABLE")
        }
        if (error instanceof RunningEvaluationConflict) {
          throw new ApiError(error.message, 409, "RUNNING_EVALUATION", {
            running: error.running,
          })
        }
        throw error
      }
    }
    throw new Error("Capture retry ended unexpectedly.")
  }

  async capture(id: string): Promise<PublicCapture> {
    return (await this.captureOnSite(id)).publicCapture
  }

  private async savedCaptureRun(
    id: string,
    captureId: string
  ): Promise<CaptureRun> {
    const saved = await loadSavedCapture(runsDirectory, id, captureId)
    if (!saved) throw captureExpired()
    return {
      candidate: saved.candidate,
      capture: saved.capture,
      publicCapture: await publicCapture(saved.candidate, saved.capture),
    }
  }

  async evaluate(
    id: string,
    retryNote?: string,
    captureId?: string
  ): Promise<{
    candidate: ScriptCandidate
    capture: PublicCapture
    evaluation: GeneratedEvaluation
  }> {
    const run = captureId
      ? await this.savedCaptureRun(id, captureId)
      : await this.captureOnSite(id)
    const key = categoryKey(run.candidate)
    const evaluator = this.evaluators.get(key) ?? new CategoryEvaluator(key)
    this.evaluators.set(key, evaluator)

    const evaluation = this.sessionsStarted.has(key)
      ? await evaluator.evaluateNext({
          pages: run.capture.pages,
          maxScore: run.capture.maxScore,
          scriptId: id,
          retryNote,
        })
      : await evaluator.evaluateFirst({
          referencePath: run.capture.referencePath,
          pages: run.capture.pages,
          maxScore: run.capture.maxScore,
        })
    this.sessionsStarted.add(key)

    return {
      candidate: run.candidate,
      capture: run.publicCapture,
      evaluation,
    }
  }

  async exitRunning(): Promise<boolean> {
    return this.site.exitRunning()
  }

  async close(): Promise<void> {
    await this.site.close()
  }
}
