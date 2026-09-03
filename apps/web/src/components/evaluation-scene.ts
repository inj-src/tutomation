import {
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw"
import { canonicalImageSize } from "@repo/shared/image-scale"

import type { EvaluationResult } from "../lib/api"

type ElementSkeleton = NonNullable<
  Parameters<typeof convertToExcalidrawElements>[0]
>[number]

function scoreText(value: number): string {
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return text.length < 2 ? `0${text}` : text
}

function coordinate(value: number, size: number): number {
  return Math.min(size, Math.max(0, value))
}

function boundedRadius(value: number, width: number, height: number): number {
  return Math.max(1, Math.min(value, Math.min(width, height) * 0.18))
}

export function sceneFor(
  evaluation: EvaluationResult["evaluation"] | undefined,
  width: number,
  height: number
): {
  elements: ReturnType<typeof convertToExcalidrawElements>
} {
  const skeletons: ElementSkeleton[] = []
  const sceneScale = 1 / canonicalImageSize(width, height).scale

  if (evaluation) {
    for (const questionScore of evaluation.questionScores) {
      if (
        questionScore.score === 0 &&
        questionScore.x === 0 &&
        questionScore.y === 0
      ) {
        continue
      }
      const label = scoreText(questionScore.score)
      const fontSize = 30 * sceneScale
      const scoreWidth = label.length * fontSize * 0.62
      const scoreX = Math.max(0, questionScore.x - scoreWidth - 10 * sceneScale)
      const scoreY = Math.max(0, questionScore.y - fontSize / 2)
      const angle = -(35 + Math.random() * 20) * (Math.PI / 180)
      skeletons.push(
        {
          type: "text",
          x: scoreX,
          y: scoreY,
          text: label,
          fontSize,
          strokeColor: "#d62f2f",
          fontFamily: FONT_FAMILY.Excalifont,
          roughness: 1.5,
          angle,
        },
        {
          type: "line",
          x: scoreX - 5 * sceneScale,
          y: scoreY + fontSize + 4 * sceneScale,
          points: [
            [0, 0],
            [scoreWidth + 10 * sceneScale, 0],
          ],
          strokeColor: "#d62f2f",
          strokeWidth: 1.8 * sceneScale,
          roughness: 1.5,
          angle,
        }
      )
    }

    for (const annotation of evaluation.annotations) {
      const common = {
        strokeColor: "#d62f2f",
        roughness: 1.5,
        strokeWidth: 2.5 * sceneScale,
      }
      if (
        (annotation.kind === "circle" || annotation.kind === "oval") &&
        annotation.center
      ) {
        const radiusX =
          annotation.kind === "oval"
            ? boundedRadius(annotation.radiusX ?? 12, width, height)
            : boundedRadius(annotation.radius ?? 12, width, height)
        const radiusY =
          annotation.kind === "oval"
            ? boundedRadius(annotation.radiusY ?? radiusX, width, height)
            : radiusX
        const x = coordinate(
          annotation.center[0] - radiusX,
          width - radiusX * 2
        )
        const y = coordinate(
          annotation.center[1] - radiusY,
          height - radiusY * 2
        )
        skeletons.push({
          type: "ellipse",
          x,
          y,
          width: radiusX * 2,
          height: radiusY * 2,
          ...common,
        })
      } else if (
        annotation.kind === "underline" &&
        annotation.start &&
        annotation.end
      ) {
        skeletons.push({
          type: "line",
          x: coordinate(annotation.start[0], width),
          y: coordinate(annotation.start[1], height),
          points: [
            [0, 0],
            [
              annotation.end[0] - annotation.start[0],
              annotation.end[1] - annotation.start[1],
            ],
          ],
          ...common,
        })
      } else if (
        annotation.kind === "tick" &&
        annotation.points &&
        annotation.points.length > 1
      ) {
        const origin = annotation.points[0].map((value, index) =>
          coordinate(value, index === 0 ? width : height)
        )
        skeletons.push({
          type: "line",
          x: origin[0],
          y: origin[1],
          points: annotation.points
            .slice(1)
            .map((point) => [
              coordinate(point[0], width) - origin[0],
              coordinate(point[1], height) - origin[1],
            ]),
          ...common,
        })
      } else if (
        annotation.kind === "box" &&
        annotation.x !== null &&
        annotation.y !== null
      ) {
        skeletons.push({
          type: "rectangle",
          x: coordinate(annotation.x, width),
          y: coordinate(annotation.y, height),
          width: Math.min(
            annotation.width ?? 1,
            width - coordinate(annotation.x, width)
          ),
          height: Math.min(
            annotation.height ?? 1,
            height - coordinate(annotation.y, height)
          ),
          ...common,
        })
      }

      if (
        annotation.text &&
        annotation.kind !== "text" &&
        annotation.commentAt
      ) {
        skeletons.push({
          type: "text",
          x: annotation.commentAt[0],
          y: annotation.commentAt[1],
          text: annotation.text,
          fontSize: 24 * sceneScale,
          fontFamily: FONT_FAMILY.Excalifont,
          strokeColor: "#d62f2f",
          roughness: 1.5,
        })
      }
      if (
        annotation.kind === "text" &&
        annotation.text &&
        annotation.x !== null &&
        annotation.y !== null
      ) {
        skeletons.push({
          type: "text",
          x: annotation.x,
          y: annotation.y,
          text: annotation.text,
          fontSize: 24 * sceneScale,
          fontFamily: FONT_FAMILY.Excalifont,
          strokeColor: "#d62f2f",
          roughness: 1.5,
        })
      }
    }
  }

  return {
    elements: convertToExcalidrawElements(skeletons, { regenerateIds: true }),
  }
}
