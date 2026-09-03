import type { Interface as ReadlineInterface } from "node:readline/promises"

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright"

import {
  authFile,
  ensureTeacherAuthenticated,
  hasSavedAuthState,
  isLoginPage,
  loginWithCredentials,
  type TeacherCredentials,
} from "./auth.js"
import {
  captureScript as captureScriptOnPage,
  finalizeCapture,
} from "./site-capture.js"
import { SiteListing } from "./site-listing.js"
import { exitRunningEvaluation } from "./site-navigation.js"
import { captureReferences as captureReferencesOnPage } from "./site-references.js"

export type ScriptCategory = {
  index: number
  program: string
  course: string
  examName: string
  pending: number
  detailsUrl: string
  examId: string
}

export type ScriptCandidate = {
  index: number
  rowIndex: number
  program: string
  course: string
  examSubject: string
  version: string
  question: string
  pending: number
  detailsUrl: string
  examId: string
  courseId: string
  subjectId: string
  uniqueSet: string
  uniqueSetQuestionSerial: string
  questionVersion: string
  pendingQuestion: string
}

export type EvaluationCapture = {
  referencePath: string
  studentScriptPath: string
  metadataPath: string
  evaluationUrl: string
  maxScore: number
  canvas: {
    cssWidth: number
    cssHeight: number
    pixelWidth: number
    pixelHeight: number
  }
}

const baseUrl = "https://teacher.udvash-unmesh.com"
const indexUrl = `${baseUrl}/Teacher/ScriptEvaluation/Index`

export function candidateId(candidate: ScriptCandidate): string {
  return [
    candidate.examId,
    candidate.courseId,
    candidate.subjectId,
    candidate.uniqueSet,
    candidate.uniqueSetQuestionSerial,
    candidate.questionVersion,
  ].join("~")
}

export class TeacherSite {
  private browser: Browser | undefined
  private context: BrowserContext | undefined
  private opening: Promise<void> | undefined
  private authenticating: Promise<void> | undefined
  private readonly listing = new SiteListing()

  constructor(private readonly terminal?: ReadlineInterface) {}

  private async launch(): Promise<void> {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
    })
    try {
      const context = await browser.newContext({
        storageState: (await hasSavedAuthState()) ? authFile : undefined,
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: 1,
      })
      this.browser = browser
      this.context = context
      browser.on("disconnected", () => {
        if (this.browser !== browser) return
        this.browser = this.context = undefined
      })
    } catch (error) {
      await browser.close().catch(() => undefined)
      throw error
    }
  }

  async open(): Promise<void> {
    if (this.browser?.isConnected() && this.context) return
    this.opening ??= this.launch().finally(() => {
      this.opening = undefined
    })
    await this.opening
  }

  private currentContext(): BrowserContext {
    if (!this.context) throw new Error("The Playwright context is not open.")
    return this.context
  }

  private async navigate(page: Page, url: string): Promise<Page> {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
    if (!(await isLoginPage(page))) return page

    this.authenticating ??= ensureTeacherAuthenticated(
      page,
      this.terminal,
      this.currentContext()
    ).finally(() => {
      this.authenticating = undefined
    })
    await this.authenticating
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
    if (await isLoginPage(page)) {
      throw new Error("Teacher login did not complete successfully.")
    }
    return page
  }

  private async withPage<T>(work: (page: Page) => Promise<T>): Promise<T> {
    await this.open()
    const page = await this.currentContext().newPage()
    try {
      return await work(page)
    } finally {
      await page.close().catch(() => undefined)
    }
  }

  async login(credentials: TeacherCredentials): Promise<void> {
    await this.withPage(async (page) => {
      await page.goto(baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      })
      if (await isLoginPage(page)) {
        await loginWithCredentials(page, credentials, this.currentContext())
      }
    })
  }

  async listCategories(): Promise<ScriptCategory[]> {
    return this.withPage(async (page) =>
      this.listing.categories(await this.navigate(page, indexUrl))
    )
  }

  async listCandidates(category: ScriptCategory): Promise<ScriptCandidate[]> {
    return this.withPage(async (page) =>
      this.listing.candidates(
        await this.navigate(page, category.detailsUrl),
        category
      )
    )
  }

  async capture(
    candidate: ScriptCandidate,
    outputDirectory: string
  ): Promise<EvaluationCapture> {
    return this.withPage(async (page) => {
      await this.navigate(page, candidate.detailsUrl)
      const script = await captureScriptOnPage(page, candidate, outputDirectory)
      const references = await captureReferencesOnPage(page, outputDirectory)
      return finalizeCapture(page, candidate, script, references)
    })
  }

  async exitRunning(): Promise<boolean> {
    return this.withPage(async (page) => {
      await this.navigate(page, indexUrl)
      return exitRunningEvaluation(page)
    })
  }

  async close(): Promise<void> {
    await this.opening?.catch(() => undefined)
    const context = this.context
    const browser = this.browser
    this.context = this.browser = undefined
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}
