import type { ScriptCandidate } from "./site.js"

export function candidateEvaluationUrl(candidate: ScriptCandidate): string {
  const details = new URL(candidate.detailsUrl)
  const path = details.pathname.includes("/OnlineWrittenEvaluation/")
    ? "/Teacher/OnlineWrittenEvaluation/ExamOnlineWrittenQuestionDisplay"
    : "/Teacher/SaqEvaluation/ExamSaqQuestionDisplay"
  const url = new URL(path, details.origin)

  for (const [key, value] of Object.entries({
    examId: candidate.examId,
    courseId: candidate.courseId,
    subjectId: candidate.subjectId,
    uniqueSet: candidate.uniqueSet,
    uniqueSetQuestionSerial: candidate.uniqueSetQuestionSerial,
    questionVersion: candidate.questionVersion,
    pendingQuestion: candidate.pendingQuestion,
  })) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}
