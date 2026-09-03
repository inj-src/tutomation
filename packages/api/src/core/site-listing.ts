import type { Page } from "playwright"

import type { ScriptCandidate, ScriptCategory } from "./site.js"

const baseUrl = "https://teacher.udvash-unmesh.com"

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function number(value: string | undefined): number {
  const parsed = Number.parseInt(text(value), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function absoluteUrl(value: string): string {
  return new URL(value, baseUrl).toString()
}

export class SiteListing {
  async categories(page: Page): Promise<ScriptCategory[]> {
    const rows = page
      .locator("table")
      .filter({ has: page.locator("th", { hasText: /^Pending$/i }) })
      .locator("tbody tr")
      .filter({ has: page.locator('a[href*="NewScriptEvaluationDetails"]') })
    const count = await rows.count()

    if (count === 0) return []

    const categories: ScriptCategory[] = []
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const row = rows.nth(rowIndex)
      const cells = await row.locator("td").allTextContents()
      const href = await row
        .locator('a[href*="NewScriptEvaluationDetails"]')
        .getAttribute("href")

      if (!href) continue

      const detailsUrl = absoluteUrl(href)
      const examId = new URL(detailsUrl).searchParams.get("examId") ?? ""
      categories.push({
        index: rowIndex + 1,
        program: text(cells[1]),
        course: text(cells[2]),
        examName: text(cells[3]),
        pending: number(cells[4]),
        detailsUrl,
        examId,
      })
    }
    return categories.sort(
      (left, right) => right.pending - left.pending || left.index - right.index
    )
  }

  async candidates(
    page: Page,
    category: ScriptCategory
  ): Promise<ScriptCandidate[]> {
    const rows = page
      .locator("table tbody tr")
      .filter({ has: page.locator(".btnStartEvaluation") })
    const count = await rows.count()

    if (count === 0) return []

    const candidates: ScriptCandidate[] = []
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const row = rows.nth(rowIndex)
      const cells = await row.locator("td").allTextContents()
      const button = row.locator(".btnStartEvaluation")
      const attributes = await button.evaluate((element) => ({
        examId: element.getAttribute("data-examid") ?? "",
        courseId: element.getAttribute("data-courseid") ?? "",
        subjectId: element.getAttribute("data-subjectid") ?? "",
        uniqueSet: element.getAttribute("data-uniqueset") ?? "",
        uniqueSetQuestionSerial:
          element.getAttribute("data-uniquesetquestionserial") ?? "",
        questionVersion: element.getAttribute("data-questionversion") ?? "",
        pendingQuestion: element.getAttribute("data-pendingquestion") ?? "",
      }))
      candidates.push({
        index: rowIndex + 1,
        rowIndex,
        program: text(cells[1]),
        course: text(cells[2]),
        examSubject: text(cells[3]),
        version: text(cells[4]),
        question: text(cells[5]),
        pending: number(cells[6]),
        detailsUrl: category.detailsUrl,
        examId: attributes.examId,
        courseId: attributes.courseId,
        subjectId: attributes.subjectId,
        uniqueSet: attributes.uniqueSet,
        uniqueSetQuestionSerial: attributes.uniqueSetQuestionSerial,
        questionVersion: attributes.questionVersion,
        pendingQuestion: attributes.pendingQuestion,
      })
    }

    return candidates.sort(
      (left, right) => right.pending - left.pending || left.index - right.index
    )
  }
}
