import assert from "node:assert/strict"
import test from "node:test"

import { isStudentScriptImageUrl } from "./site-network-image.js"

test("accepts only known student-script image paths", () => {
  assert.equal(
    isStudentScriptImageUrl(
      "https://ums-public-saq.s3-ap-southeast-1.amazonaws.com/StudentSaqExamImage/127400/student.jpg"
    ),
    true
  )
  assert.equal(
    isStudentScriptImageUrl(
      "https://ums-public-online-written.s3-ap-southeast-1.amazonaws.com/StudentOnlineWrittenExamImage/121307/student.jpg"
    ),
    true
  )
  assert.equal(
    isStudentScriptImageUrl(
      "https://ums-public-online-written.s3-ap-southeast-1.amazonaws.com/question.jpg"
    ),
    false
  )
})
