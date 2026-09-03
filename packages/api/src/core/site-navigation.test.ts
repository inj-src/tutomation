import assert from "node:assert/strict"
import test from "node:test"

import { parseRunningEvaluation } from "./site-navigation.js"

test("normalizes Udvash running-evaluation responses", () => {
  assert.equal(parseRunningEvaluation(null), null)

  const running = parseRunningEvaluation({
    StudentScriptType: 10,
    OnlineWrittenExamEvaluationPendingDetailOnlinePortalDto: {
      ExamId: 128844,
      CourseId: 2964,
      SubjectId: 71,
      UniqueSet: 1,
      UniqueSetQuestionSerial: 6,
      Version: 1,
    },
  })

  assert.equal(running?.id, "128844~2964~71~1~6~1")
  assert.match(
    running?.evaluationUrl ?? "",
    /OnlineWrittenEvaluation\/ExamOnlineWrittenQuestionDisplay/
  )
})
