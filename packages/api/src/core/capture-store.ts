import { access, readFile } from "node:fs/promises"
import { basename, join, resolve, sep } from "node:path"

import {
  candidateId,
  type EvaluationCapture,
  type ScriptCandidate,
} from "./site.js"

type StoredCaptureMetadata = {
  candidate: ScriptCandidate
  captureId?: string
  evaluationUrl: string
  maxScore: number
  referencePath?: string
  pages: EvaluationCapture["pages"]
}

export type SavedCapture = {
  candidate: ScriptCandidate
  capture: EvaluationCapture
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isCandidate(value: unknown): value is ScriptCandidate {
  if (!isRecord(value)) return false
  return [
    "examId",
    "courseId",
    "subjectId",
    "uniqueSet",
    "uniqueSetQuestionSerial",
    "questionVersion",
    "pendingQuestion",
  ].every((key) => typeof value[key] === "string")
}

function isStoredPage(
  value: unknown
): value is EvaluationCapture["pages"][number] {
  if (!isRecord(value)) return false
  return (
    typeof value.imageIndex === "number" &&
    typeof value.imageOrder === "number" &&
    typeof value.capturedScriptPath === "string" &&
    typeof value.studentScriptPath === "string" &&
    isRecord(value.orientation) &&
    isRecord(value.canvas)
  )
}

function candidateMatchesRequestedId(
  id: string,
  candidate: ScriptCandidate
): boolean {
  const parts = id.split("~")
  return (
    (parts.length === 6 || parts.length === 7) &&
    candidateId(candidate) === parts.slice(0, 6).join("~") &&
    (parts.length === 6 || candidate.pendingQuestion === parts[6])
  )
}

function isInside(directory: string, path: string): boolean {
  const root = `${resolve(directory)}${sep}`
  return resolve(path).startsWith(root)
}

export async function loadSavedCapture(
  runsDirectory: string,
  id: string,
  captureId: string
): Promise<SavedCapture | null> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(captureId)) return null

  const runDirectory = resolve(runsDirectory, captureId)
  if (basename(runDirectory) !== captureId) return null

  let metadata: StoredCaptureMetadata
  try {
    const raw = JSON.parse(
      await readFile(join(runDirectory, "metadata.json"), "utf8")
    ) as unknown
    if (!isRecord(raw)) return null
    const pages = raw.pages
    if (
      !isCandidate(raw.candidate) ||
      (raw.captureId !== undefined && typeof raw.captureId !== "string") ||
      typeof raw.evaluationUrl !== "string" ||
      typeof raw.maxScore !== "number" ||
      !Array.isArray(pages) ||
      pages.length === 0 ||
      !pages.every(isStoredPage)
    ) {
      return null
    }
    metadata = raw as unknown as StoredCaptureMetadata
  } catch {
    return null
  }

  if (
    !candidateMatchesRequestedId(id, metadata.candidate) ||
    (metadata.captureId !== undefined && metadata.captureId !== captureId)
  ) {
    return null
  }

  const referencePath =
    metadata.referencePath ?? join(runDirectory, "reference.png")
  const paths = [
    referencePath,
    ...metadata.pages.map((page) => page.studentScriptPath),
  ]
  if (!paths.every((path) => isInside(runDirectory, path))) return null

  try {
    await Promise.all(paths.map((path) => access(path)))
  } catch {
    return null
  }

  const capture: EvaluationCapture = {
    referencePath,
    pages: metadata.pages,
    metadataPath: join(runDirectory, "metadata.json"),
    evaluationUrl: metadata.evaluationUrl,
    maxScore: metadata.maxScore,
  }
  return { candidate: metadata.candidate, capture }
}
