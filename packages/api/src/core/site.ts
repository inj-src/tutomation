import type { Interface as ReadlineInterface } from "node:readline/promises";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import {
  authFile,
  ensureTeacherAuthenticated,
  hasSavedAuthState,
  isLoginPage,
  loginWithCredentials,
  type TeacherCredentials,
} from "./auth.js";
import {
  captureScript as captureScriptOnPage,
  finalizeCapture,
  type ScriptCapture,
} from "./site-capture.js";
import { captureReferences as captureReferencesOnPage } from "./site-references.js";

export type ScriptCategory = {
  index: number;
  program: string;
  course: string;
  examName: string;
  pending: number;
  detailsUrl: string;
  examId: string;
};

export type ScriptCandidate = {
  index: number;
  rowIndex: number;
  program: string;
  course: string;
  examSubject: string;
  version: string;
  question: string;
  pending: number;
  detailsUrl: string;
  examId: string;
  courseId: string;
  subjectId: string;
  uniqueSet: string;
  uniqueSetQuestionSerial: string;
  questionVersion: string;
  pendingQuestion: string;
};

export type EvaluationCapture = {
  questionPath: string;
  sampleAnswerPath: string;
  studentScriptPath: string;
  metadataPath: string;
  evaluationUrl: string;
  maxScore: number;
  canvas: {
    cssWidth: number;
    cssHeight: number;
    pixelWidth: number;
    pixelHeight: number;
  };
};

const baseUrl = "https://teacher.udvash-unmesh.com";
const indexUrl = `${baseUrl}/Teacher/ScriptEvaluation/Index`;

function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function number(value: string | undefined): number {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function absoluteUrl(value: string): string {
  return new URL(value, baseUrl).toString();
}

function urlsEqual(left: string, right: string): boolean {
  return new URL(left).toString() === new URL(right).toString();
}

export function candidateId(candidate: ScriptCandidate): string {
  return [
    candidate.examId,
    candidate.courseId,
    candidate.subjectId,
    candidate.uniqueSet,
    candidate.uniqueSetQuestionSerial,
    candidate.questionVersion,
    candidate.pendingQuestion,
  ].join("~");
}

export class TeacherSite {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;

  constructor(private readonly terminal?: ReadlineInterface) {}

  async open(): Promise<void> {
    if (this.page && this.context && this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
    });
    this.context = await this.browser.newContext({
      storageState: (await hasSavedAuthState()) ? authFile : undefined,
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
    });
    this.page = await this.context.newPage();
  }

  async login(credentials: TeacherCredentials): Promise<void> {
    await this.open();
    const page = this.currentPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (await isLoginPage(page)) {
      await loginWithCredentials(page, credentials, this.currentContext());
    }
  }

  private currentPage(): Page {
    if (!this.page) {
      throw new Error("The Playwright browser is not open.");
    }
    return this.page;
  }

  private currentContext(): BrowserContext {
    if (!this.context) {
      throw new Error("The Playwright context is not open.");
    }
    return this.context;
  }

  private async navigate(url: string): Promise<Page> {
    const page = this.currentPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    if (await isLoginPage(page)) {
      await ensureTeacherAuthenticated(page, this.terminal, this.currentContext());
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      if (await isLoginPage(page)) {
        throw new Error("Teacher login did not complete successfully.");
      }
    }

    return page;
  }

  async listCategories(): Promise<ScriptCategory[]> {
    const page = await this.navigate(indexUrl);
    const rows = page
      .locator("table")
      .filter({ has: page.locator("th", { hasText: /^Pending$/i }) })
      .locator("tbody tr")
      .filter({ has: page.locator('a[href*="NewScriptEvaluationDetails"]') });
    await rows.first().waitFor({ state: "visible", timeout: 30_000 });
    const count = await rows.count();

    if (count === 0) {
      throw new Error("No script categories were found on the index page.");
    }

    const categories: ScriptCategory[] = [];
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const row = rows.nth(rowIndex);
      const cells = await row.locator("td").allTextContents();
      const href = await row.locator('a[href*="NewScriptEvaluationDetails"]').getAttribute("href");

      if (!href) {
        continue;
      }

      const detailsUrl = absoluteUrl(href);
      const examId = new URL(detailsUrl).searchParams.get("examId") ?? "";

      categories.push({
        index: rowIndex + 1,
        program: text(cells[1]),
        course: text(cells[2]),
        examName: text(cells[3]),
        pending: number(cells[4]),
        detailsUrl,
        examId,
      });
    }
    return categories.sort(
      (left, right) => right.pending - left.pending || left.index - right.index,
    );
  }

  async listCandidates(category: ScriptCategory): Promise<ScriptCandidate[]> {
    const page = await this.navigate(category.detailsUrl);
    const rows = page
      .locator("table tbody tr")
      .filter({ has: page.locator(".btnStartEvaluation") });
    await rows.first().waitFor({ state: "visible", timeout: 30_000 });
    const count = await rows.count();

    if (count === 0) {
      throw new Error("No pending scripts were found in this category.");
    }

    const candidates: ScriptCandidate[] = [];
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const row = rows.nth(rowIndex);
      const cells = await row.locator("td").allTextContents();
      const button = row.locator(".btnStartEvaluation");
      const attributes = await button.evaluate((element) => ({
        examId: element.getAttribute("data-examid") ?? "",
        courseId: element.getAttribute("data-courseid") ?? "",
        subjectId: element.getAttribute("data-subjectid") ?? "",
        uniqueSet: element.getAttribute("data-uniqueset") ?? "",
        uniqueSetQuestionSerial: element.getAttribute("data-uniquesetquestionserial") ?? "",
        questionVersion: element.getAttribute("data-questionversion") ?? "",
        pendingQuestion: element.getAttribute("data-pendingquestion") ?? "",
      }));

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
      });
    }

    return candidates.sort(
      (left, right) => right.pending - left.pending || left.index - right.index,
    );
  }

  async captureScript(candidate: ScriptCandidate, outputDirectory: string): Promise<ScriptCapture> {
    const currentPage = this.currentPage();
    const page = urlsEqual(currentPage.url(), candidate.detailsUrl)
      ? currentPage
      : await this.navigate(candidate.detailsUrl);
    return captureScriptOnPage(page, candidate, outputDirectory);
  }

  async finishCapture(
    candidate: ScriptCandidate,
    script: ScriptCapture,
  ): Promise<EvaluationCapture> {
    const page = this.currentPage();
    const references = await captureReferencesOnPage(page, script.outputDirectory);
    return finalizeCapture(page, candidate, script, references);
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
    this.page = undefined;
  }
}
