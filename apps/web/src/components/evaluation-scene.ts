import {
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw"

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

export function sceneFor(evaluation?: EvaluationResult["evaluation"]): {
  elements: ReturnType<typeof convertToExcalidrawElements>
} {
  const skeletons: ElementSkeleton[] = []

  if (evaluation) {
    for (const questionScore of evaluation.questionScores) {
      const label = scoreText(questionScore.score)
      const fontSize = 30
      const scoreWidth = label.length * fontSize * 0.62
      const scoreX = Math.max(4, questionScore.x - scoreWidth - 10)
      const scoreY = Math.max(4, questionScore.y - fontSize / 2)
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
          x: scoreX - 5,
          y: scoreY + fontSize + 4,
          points: [
            [0, 0],
            [scoreWidth + 10, 0],
          ],
          strokeColor: "#d62f2f",
          strokeWidth: 1.8,
          roughness: 1.5,
          angle,
        }
      )
    }

    for (const annotation of evaluation.annotations) {
      const common = {
        strokeColor: "#d62f2f",
        roughness: 1.5,
        strokeWidth: 2.5,
      }
      if (
        (annotation.kind === "circle" || annotation.kind === "oval") &&
        annotation.center
      ) {
        const radiusX =
          annotation.kind === "oval"
            ? (annotation.radiusX ?? 12)
            : (annotation.radius ?? 12)
        const radiusY =
          annotation.kind === "oval" ? (annotation.radiusY ?? radiusX) : radiusX
        skeletons.push({
          type: "ellipse",
          x: annotation.center[0] - radiusX,
          y: annotation.center[1] - radiusY,
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
          x: annotation.start[0],
          y: annotation.start[1],
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
        const origin = annotation.points[0]
        skeletons.push({
          type: "line",
          x: origin[0],
          y: origin[1],
          points: annotation.points
            .slice(1)
            .map((point) => [point[0] - origin[0], point[1] - origin[1]]),
          ...common,
        })
      } else if (
        annotation.kind === "box" &&
        annotation.x !== null &&
        annotation.y !== null
      ) {
        skeletons.push({
          type: "rectangle",
          x: annotation.x,
          y: annotation.y,
          width: annotation.width ?? 1,
          height: annotation.height ?? 1,
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
          fontSize: 24,
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
          fontSize: 24,
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
