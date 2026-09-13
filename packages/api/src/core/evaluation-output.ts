import { z } from "zod"

import type { ImageSize } from "./image-scale.js"
import type {
  Annotation,
  GeneratedEvaluation,
  PageEvaluation,
  QuestionScore,
} from "./types.js"

const COORDINATE_LIMIT = 800

function pointSchema() {
  return z.array(z.number().int().min(0).max(COORDINATE_LIMIT)).length(2)
}

export function evaluationSchema(pageCount: number, maxScore: number) {
  const point = pointSchema()
  const annotation = z.object({
    kind: z.enum(["underline", "circle", "oval", "tick", "text", "box"]),
    x: z.number().int().min(0).max(COORDINATE_LIMIT).nullable(),
    y: z.number().int().min(0).max(COORDINATE_LIMIT).nullable(),
    width: z.number().int().min(0).max(COORDINATE_LIMIT).nullable(),
    height: z.number().int().min(0).max(COORDINATE_LIMIT).nullable(),
    center: point.nullable(),
    radius: z.number().int().min(1).max(COORDINATE_LIMIT).nullable(),
    radiusX: z.number().int().min(1).max(COORDINATE_LIMIT).nullable(),
    radiusY: z.number().int().min(1).max(COORDINATE_LIMIT).nullable(),
    commentAt: point.nullable(),
    start: point.nullable(),
    end: point.nullable(),
    text: z.string().nullable(),
    points: z.array(point).nullable(),
    mark: z.number().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })

  return z.object({
    score: z.number().min(0).max(maxScore),
    summary: z.string(),
    pages: z
      .array(
        z.object({
          imageIndex: z
            .number()
            .int()
            .min(0)
            .max(pageCount - 1),
          questionScores: z.array(
            z.object({
              part: z.string(),
              score: z.number().min(0).max(maxScore),
              maxScore: z.number().min(0).max(maxScore),
              x: z.number().int().min(0).max(COORDINATE_LIMIT),
              y: z.number().int().min(0).max(COORDINATE_LIMIT),
              confidence: z.number().min(0).max(1).nullable(),
            })
          ),
          annotations: z.array(annotation),
        })
      )
      .length(pageCount),
  })
}

export type EvaluationOutput = z.infer<ReturnType<typeof evaluationSchema>>

function bounded(value: number, limit: number): number {
  return Math.min(limit, Math.max(0, Math.round(value)))
}

function scalePoint(
  value: number[] | null,
  scale: number,
  size: ImageSize
): number[] | null {
  return value
    ? [
        bounded(value[0] * scale, size.width),
        bounded(value[1] * scale, size.height),
      ]
    : null
}

function scalePositive(value: number | null, scale: number): number | null {
  return value === null ? null : Math.max(1, Math.round(value * scale))
}

function restoreScore(
  score: QuestionScore,
  scale: number,
  size: ImageSize,
  maxScore: number
): QuestionScore {
  const partMax = Math.min(maxScore, Math.max(0, score.maxScore))
  return {
    ...score,
    score: Math.min(partMax, Math.max(0, score.score)),
    maxScore: partMax,
    x: bounded(score.x * scale, size.width),
    y: bounded(score.y * scale, size.height),
  }
}

function restoreAnnotation(
  annotation: Annotation,
  scale: number,
  size: ImageSize
): Annotation {
  return {
    ...annotation,
    x: annotation.x === null ? null : bounded(annotation.x * scale, size.width),
    y:
      annotation.y === null ? null : bounded(annotation.y * scale, size.height),
    width: scalePositive(annotation.width, scale),
    height: scalePositive(annotation.height, scale),
    center: scalePoint(annotation.center, scale, size),
    radius: scalePositive(annotation.radius, scale),
    radiusX: scalePositive(annotation.radiusX, scale),
    radiusY: scalePositive(annotation.radiusY, scale),
    commentAt: scalePoint(annotation.commentAt, scale, size),
    start: scalePoint(annotation.start, scale, size),
    end: scalePoint(annotation.end, scale, size),
    points:
      annotation.points?.map((point) => scalePoint(point, scale, size) ?? []) ??
      null,
  }
}

export function restoreEvaluationPages(
  output: EvaluationOutput,
  sizes: Array<{ original: ImageSize; inverseScale: number }>,
  maxScore: number
): Pick<GeneratedEvaluation, "score" | "summary" | "pages"> {
  const pages = new Map(output.pages.map((page) => [page.imageIndex, page]))
  if (pages.size !== sizes.length) {
    throw new Error(
      "The model did not return exactly one result for every script image."
    )
  }

  const restored: PageEvaluation[] = sizes.map((size, imageIndex) => {
    const page = pages.get(imageIndex)
    if (!page)
      throw new Error(`The model omitted script image ${imageIndex + 1}.`)
    return {
      imageIndex,
      questionScores: page.questionScores.map((score) =>
        restoreScore(score, size.inverseScale, size.original, maxScore)
      ),
      annotations: page.annotations.map((annotation) =>
        restoreAnnotation(annotation, size.inverseScale, size.original)
      ),
    }
  })

  return {
    score: Math.min(maxScore, Math.max(0, output.score)),
    summary: output.summary,
    pages: restored,
  }
}
