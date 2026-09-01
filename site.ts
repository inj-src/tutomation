import { mkdir, writeFile } from "node:fs/promises";
import type { Interface as ReadlineInterface } from "node:readline/promises";

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";

import { authFile, ensureTeacherAuthenticated, hasSavedAuthState, isLoginPage } from "./auth.js";

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
const evaluationPagePattern =
  /\/(?:ExamOnlineWrittenQuestionDisplay|ExamSaqQuestionDisplay)(?:\?|$)/i;

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

function queryUrl(candidate: ScriptCandidate): string {
  const url = new URL("/Teacher/OnlineWrittenEvaluation/ExamOnlineWrittenQuestionDisplay", baseUrl);

  url.search = new URLSearchParams({
    examId: candidate.examId,
    courseId: candidate.courseId,
    subjectId: candidate.subjectId,
    uniqueSet: candidate.uniqueSet,
    uniqueSetQuestionSerial: candidate.uniqueSetQuestionSerial,
    questionVersion: candidate.questionVersion,
    pendingQuestion: candidate.pendingQuestion,
  }).toString();

  return url.toString();
}

function candidateButtonSelector(candidate: ScriptCandidate): string {
  return [
    `.btnStartEvaluation[data-examid="${candidate.examId}"]`,
    `[data-courseid="${candidate.courseId}"]`,
    `[data-subjectid="${candidate.subjectId}"]`,
    `[data-uniqueset="${candidate.uniqueSet}"]`,
    `[data-uniquesetquestionserial="${candidate.uniqueSetQuestionSerial}"]`,
    `[data-questionversion="${candidate.questionVersion}"]`,
    `[data-pendingquestion="${candidate.pendingQuestion}"]`,
  ].join("");
}

async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
}

export class TeacherSite {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;

  constructor(private readonly terminal: ReadlineInterface) {}

  async open(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS === "true",
    });
    this.context = await this.browser.newContext({
      storageState: (await hasSavedAuthState()) ? authFile : undefined,
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
    });
    this.page = await this.context.newPage();
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
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    if (await isLoginPage(page)) {
      await ensureTeacherAuthenticated(page, this.terminal, this.currentContext());
      await page.goto(url, {
        waitUntil: "networkidle",
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

    return categories;
  }

  async listCandidates(category: ScriptCategory): Promise<ScriptCandidate[]> {
    const page = await this.navigate(category.detailsUrl);
    const rows = page
      .locator("table tbody tr")
      .filter({ has: page.locator(".btnStartEvaluation") });
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

    return candidates;
  }

  private async locateQuestion(page: Page): Promise<Locator> {
    const marker = page.getByText(/Question\s*:/i).first();
    await marker.waitFor({ state: "visible", timeout: 30_000 });

    // The question header and rendered `.questionResize` content share the
    // same table header. The closest ancestor containing "Full Marks" is
    // only the small header row, so capture the enclosing <th> instead.
    const block = marker.locator("xpath=ancestor::th[1]");

    if ((await block.count()) > 0 && (await block.first().isVisible())) {
      return block.first();
    }

    return marker;
  }

  private async locateSampleTrigger(page: Page): Promise<Locator> {
    const button = page.getByRole("button", { name: /Sample Answer/i }).first();
    if ((await button.count()) > 0) {
      return button;
    }

    const link = page.getByRole("link", { name: /Sample Answer/i }).first();
    if ((await link.count()) > 0) {
      return link;
    }

    const textLocator = page.getByText(/Sample Answer/i).first();
    await textLocator.waitFor({ state: "visible", timeout: 30_000 });
    return textLocator;
  }

  private async startCandidate(candidate: ScriptCandidate): Promise<Page> {
    const currentPage = this.currentPage();
    const page = urlsEqual(currentPage.url(), candidate.detailsUrl)
      ? currentPage
      : await this.navigate(candidate.detailsUrl);
    const button = page.locator(candidateButtonSelector(candidate));

    if ((await button.count()) === 0) {
      throw new Error(
        "The selected script is no longer available. Reload the script list and choose another entry.",
      );
    }

    await button.click();

    try {
      await page.waitForURL(evaluationPagePattern, {
        timeout: 30_000,
      });
    } catch {
      const dialog = page.locator(".bootbox:visible, .modal:visible, [role=dialog]:visible");
      const dialogText = (await dialog.count()) > 0 ? text(await dialog.last().innerText()) : "";

      if (dialogText) {
        throw new Error(
          `The website did not start the script because it reported: ${dialogText}. Resolve it on the site and retry.`,
        );
      }

      throw new Error(
        `Start Evaluation did not navigate to the evaluation page. Current URL: ${page.url()}`,
      );
    }

    await page.waitForLoadState("networkidle");
    return page;
  }

  async capture(candidate: ScriptCandidate, outputDirectory: string): Promise<EvaluationCapture> {
    const page = await this.startCandidate(candidate);
    const context = this.currentContext();
    await mkdir(outputDirectory, { recursive: true });
    await waitForFonts(page);

    const evaluationUrl = page.url();
    const bodyText = await page.locator("body").innerText();
    const fullMarksMatch = bodyText.match(/Full\s*Marks\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const maxScore = fullMarksMatch ? Number(fullMarksMatch[1]) : 0;

    if (!maxScore) {
      throw new Error("Could not read Full Marks from the evaluation page.");
    }

    const questionLocator = await this.locateQuestion(page);
    const questionPath = `${outputDirectory}/question.png`;
    await questionLocator.screenshot({
      path: questionPath,
      animations: "disabled",
    });

    const sampleTrigger = await this.locateSampleTrigger(page);
    const pagesBefore = new Set(context.pages());
    await sampleTrigger.click();
    await page.waitForTimeout(750);

    const samplePage =
      context.pages().find((candidatePage) => !pagesBefore.has(candidatePage)) ?? page;
    await samplePage.waitForLoadState("networkidle").catch(() => undefined);
    await waitForFonts(samplePage);

    const sampleContent = samplePage.locator(
      "#toggleCE:visible, .modal-content:visible, .bootbox-body:visible, .modal:visible, [role=dialog]:visible",
    );
    await sampleContent
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => undefined);
    if ((await sampleContent.count()) === 0) {
      await samplePage.screenshot({
        path: `${outputDirectory}/capture-debug.png`,
        fullPage: true,
      });
      throw new Error("Sample Answer was opened, but no visible answer container was found.");
    }

    const sampleAnswerPath = `${outputDirectory}/sample-answer.png`;
    await sampleContent.first().screenshot({
      path: sampleAnswerPath,
      animations: "disabled",
    });

    if (samplePage !== page) {
      await samplePage.close();
    } else {
      await page.keyboard.press("Escape").catch(() => undefined);
    }

    const canvases = page.locator("canvas:visible");
    const canvasCount = await canvases.count();
    if (canvasCount === 0) {
      throw new Error("No visible student-script canvas was found.");
    }

    let canvasIndex = 0;
    let largestArea = -1;
    for (let index = 0; index < canvasCount; index += 1) {
      const box = await canvases.nth(index).boundingBox();
      const area = box ? box.width * box.height : 0;
      if (area > largestArea) {
        largestArea = area;
        canvasIndex = index;
      }
    }

    const canvas = canvases.nth(canvasIndex);
    const canvasDetails = await canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error("Selected student-script element is not a canvas.");
      }

      const rect = element.getBoundingClientRect();
      return {
        dataUrl: element.toDataURL("image/png"),
        cssWidth: rect.width,
        cssHeight: rect.height,
        pixelWidth: element.width,
        pixelHeight: element.height,
      };
    });

    const studentScriptPath = `${outputDirectory}/student-script.png`;
    const commaIndex = canvasDetails.dataUrl.indexOf(",");
    if (commaIndex < 0) {
      throw new Error("Canvas did not return a valid PNG data URL.");
    }
    await writeFile(
      studentScriptPath,
      Buffer.from(canvasDetails.dataUrl.slice(commaIndex + 1), "base64"),
    );

    const metadataPath = `${outputDirectory}/metadata.json`;
    await writeFile(
      metadataPath,
      JSON.stringify(
        {
          candidate,
          evaluationUrl,
          maxScore,
          viewport: page.viewportSize(),
          deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
          canvas: {
            cssWidth: canvasDetails.cssWidth,
            cssHeight: canvasDetails.cssHeight,
            pixelWidth: canvasDetails.pixelWidth,
            pixelHeight: canvasDetails.pixelHeight,
          },
        },
        null,
        2,
      ),
    );

    return {
      questionPath,
      sampleAnswerPath,
      studentScriptPath,
      metadataPath,
      evaluationUrl,
      maxScore,
      canvas: {
        cssWidth: canvasDetails.cssWidth,
        cssHeight: canvasDetails.cssHeight,
        pixelWidth: canvasDetails.pixelWidth,
        pixelHeight: canvasDetails.pixelHeight,
      },
    };
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
    this.page = undefined;
  }
}

export { queryUrl };
