import { parseResponse } from "hono/client"

import { createApiClient } from "@repo/api/client"
import type {
  GeneratedEvaluation,
  ScriptCandidate,
  ScriptCategory,
} from "@repo/api"

export type Entry = ScriptCandidate & { id: string }

export type Capture = {
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
  questionImage: string
  sampleAnswerImage: string
  studentScriptImage: string
}

export type EvaluationResult = {
  candidate: ScriptCandidate
  capture: Capture
  evaluation: GeneratedEvaluation
}

const client = createApiClient(import.meta.env.VITE_API_URL ?? "")

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
  return await parseResponse(
    client.api.entries[":candidateId"].capture.$get({ param: { candidateId } })
  )
}

export async function evaluateCandidate(
  candidateId: string
): Promise<EvaluationResult> {
  return await parseResponse(
    client.api.entries[":candidateId"].evaluate.$post({
      param: { candidateId },
      json: {},
    })
  )
}

export async function submitCandidate(
  candidateId: string
): Promise<{ message: string; submitted: boolean }> {
  return await parseResponse(
    client.api.entries[":candidateId"].submit.$post({ param: { candidateId } })
  )
}
