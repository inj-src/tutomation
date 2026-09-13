import assert from "node:assert/strict"
import test from "node:test"

import { restoreEvaluationPages } from "./evaluation-output.js"

test("restores every AI page in image-index order", () => {
  const restored = restoreEvaluationPages(
    {
      score: 2,
      summary: "ok",
      pages: [
        {
          imageIndex: 1,
          annotations: [],
          questionScores: [
            {
              part: "b",
              score: 1,
              maxScore: 1,
              x: 200,
              y: 300,
              confidence: 1,
            },
          ],
        },
        {
          imageIndex: 0,
          annotations: [],
          questionScores: [
            {
              part: "a",
              score: 1,
              maxScore: 1,
              x: 100,
              y: 50,
              confidence: 1,
            },
          ],
        },
      ],
    },
    [
      { original: { width: 400, height: 200 }, inverseScale: 0.5 },
      { original: { width: 800, height: 1200 }, inverseScale: 1.5 },
    ],
    2
  )

  assert.deepEqual(
    restored.pages.map((page) => page.imageIndex),
    [0, 1]
  )
  assert.deepEqual(restored.pages[0]?.questionScores[0], {
    part: "a",
    score: 1,
    maxScore: 1,
    x: 50,
    y: 25,
    confidence: 1,
  })
  assert.deepEqual(restored.pages[1]?.questionScores[0], {
    part: "b",
    score: 1,
    maxScore: 1,
    x: 300,
    y: 450,
    confidence: 1,
  })
})

test("rejects duplicate page mappings", () => {
  assert.throws(
    () =>
      restoreEvaluationPages(
        {
          score: 0,
          summary: "",
          pages: [
            { imageIndex: 0, annotations: [], questionScores: [] },
            { imageIndex: 0, annotations: [], questionScores: [] },
          ],
        },
        [
          { original: { width: 100, height: 100 }, inverseScale: 1 },
          { original: { width: 100, height: 100 }, inverseScale: 1 },
        ],
        1
      ),
    /exactly one result/
  )
})
