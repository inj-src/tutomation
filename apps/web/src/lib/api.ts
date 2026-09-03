import { DetailedError, parseResponse } from "hono/client"

import type {
  GeneratedEvaluation,
  RunningEvaluation,
  ScriptCandidate,
  ScriptCategory,
} from "@repo/api"
import { createApiClient } from "@repo/api/client"

export type Entry = ScriptCandidate & { id: string }

export type Capture = {
  status: "capturing" | "ready" | "failed"
  error?: string
  candidate: ScriptCandidate
  evaluationUrl: string
  maxScore: number
  canvas: {
    cssWidth: number
    cssHeight: number
    pixelWidth: number
    pixelHeight: number
  }
  runDirectory: string
  referenceImage?: string
  studentScriptImage: string
}

export type EvaluationResult = {
  candidate: ScriptCandidate
  capture: Capture
  evaluation: GeneratedEvaluation
}

export type ApiFailure = {
  code?: string
  message: string
  running?: RunningEvaluation
}

type ErrorPayload = {
  error?: {
    code?: string
    message?: string
    details?: { running?: RunningEvaluation }
  }
}

const client = createApiClient(import.meta.env.VITE_API_URL ?? "")

export function apiFailure(error: unknown): ApiFailure {
  if (error instanceof DetailedError) {
    const payload = error.detail?.data as ErrorPayload | undefined
    if (payload?.error) {
      return {
        code: payload.error.code,
        message: payload.error.message ?? error.message,
        running: payload.error.details?.running,
      }
    }
  }
  return {
    message: error instanceof Error ? error.message : "The request failed.",
  }
}

export async function getCategories(): Promise<ScriptCategory[]> {
  return (await parseResponse(client.api.categories.$get())).categories
}

export async function getEntries(examId: string): Promise<Entry[]> {
  return (
    await parseResponse(
      client.api.categories[":examId"].entries.$get({ param: { examId } })
    )
  ).entries
}

export async function getCapture(candidateId: string): Promise<Capture> {
  return parseResponse(
    client.api.entries[":candidateId"].capture.$get({ param: { candidateId } })
  )
}

export async function evaluateCandidate(
  candidateId: string
): Promise<EvaluationResult> {
  return parseResponse(
    client.api.entries[":candidateId"].evaluate.$post({
      param: { candidateId },
      json: {},
    })
  )
}

export async function exitRunningEvaluation(): Promise<{
  message: string
  released: boolean
}> {
  return parseResponse(client.api.evaluation.exit.$post())
}

export async function submitCandidate(
  candidateId: string
): Promise<{ message: string; submitted: boolean }> {
  return parseResponse(
    client.api.entries[":candidateId"].submit.$post({ param: { candidateId } })
  )
}
