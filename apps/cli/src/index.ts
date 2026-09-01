import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { parseResponse } from "hono/client"

import {
  app,
  browserService,
  renderEvaluation,
  type ScriptCandidate,
  type ScriptCategory,
} from "@repo/api"
import { createApiClient } from "@repo/api/client"

type Choice = { label: string }

const client = createApiClient("http://local", {
  fetch: (requestInput: RequestInfo | URL, init?: RequestInit) =>
    app.fetch(new Request(requestInput, init)),
})

async function choose<T extends Choice>(
  terminal: ReturnType<typeof createInterface>,
  title: string,
  initial: T[],
  reload: () => Promise<T[]>
): Promise<T> {
  let options = initial
  while (true) {
    console.log(`\n${title}`)
    if (options.length === 0) {
      console.warn("Warning: no options are currently available.")
    }
    options.forEach((value, index) =>
      console.log(`${index + 1}. ${value.label}`)
    )
    console.log("0. Reload options")

    const answer = (await terminal.question("Select a number: ")).trim()
    if (answer === "0" || answer.toLowerCase() === "r") {
      try {
        options = await reload()
        console.log(`Reloaded ${options.length} option(s).`)
      } catch (error) {
        console.warn(`Warning: could not reload options: ${errorText(error)}`)
      }
      continue
    }

    const index = Number.parseInt(answer, 10) - 1
    if (index >= 0 && index < options.length) {
      return options[index]
    }
    console.log("Please choose a listed number or 0 to reload.")
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function categoryLabel(category: ScriptCategory): string {
  return `${category.examName} | Pending: ${category.pending}`
}

function candidateLabel(candidate: ScriptCandidate): string {
  return [
    candidate.examSubject,
    candidate.version,
    candidate.question,
    `Pending: ${candidate.pending}`,
  ]
    .filter(Boolean)
    .join(" | ")
}

async function login(
  terminal: ReturnType<typeof createInterface>
): Promise<void> {
  const pin = (await terminal.question("Teacher TPIN: ")).trim()
  const password = await terminal.question("Teacher password: ")
  if (!pin || !password) {
    throw new Error("Both TPIN and password are required.")
  }
  await parseResponse(client.api.auth.login.$post({ json: { pin, password } }))
  console.log("Teacher credentials and Playwright session saved.")
}

async function evaluate(
  terminal: ReturnType<typeof createInterface>
): Promise<void> {
  const loadCategories = async (): Promise<Array<ScriptCategory & Choice>> => {
    try {
      const result = await parseResponse(client.api.categories.$get())
      return result.categories.map((category: ScriptCategory) => ({
        ...category,
        label: categoryLabel(category),
      }))
    } catch (error) {
      console.warn(
        `Warning: could not load script categories: ${errorText(error)}`
      )
      return []
    }
  }
  const category = await choose(
    terminal,
    "Available script categories",
    await loadCategories(),
    loadCategories
  )

  const loadCandidates = async (): Promise<Array<ScriptCandidate & Choice>> => {
    try {
      const result = await parseResponse(
        client.api.categories[":examId"].entries.$get({
          param: { examId: category.examId },
        })
      )
      return result.entries.map(
        (candidate: ScriptCandidate & { id: string }) => ({
          ...candidate,
          label: candidateLabel(candidate),
        })
      )
    } catch (error) {
      console.warn(`Warning: could not load scripts: ${errorText(error)}`)
      return []
    }
  }
  const candidate = await choose(
    terminal,
    `Available scripts in ${category.examName}`,
    await loadCandidates(),
    loadCandidates
  )
  const id = [
    candidate.examId,
    candidate.courseId,
    candidate.subjectId,
    candidate.uniqueSet,
    candidate.uniqueSetQuestionSerial,
    candidate.questionVersion,
    candidate.pendingQuestion,
  ].join("~")

  console.log("\nCapturing script and reference images...")
  const capture = await parseResponse(
    client.api.entries[":candidateId"].capture.$get({
      param: { candidateId: id },
    })
  )
  const result = await parseResponse(
    client.api.entries[":candidateId"].evaluate.$post({
      param: { candidateId: id },
      json: {},
    })
  )
  const runDirectory = result.capture.runDirectory || capture.runDirectory
  await mkdir(runDirectory, { recursive: true })
  await writeFile(
    join(runDirectory, "evaluation.json"),
    JSON.stringify(result, null, 2)
  )
  await renderEvaluation({
    sourcePath: join(runDirectory, "student-script.png"),
    outputPath: join(runDirectory, "evaluated.png"),
    evaluation: result.evaluation,
  })

  const usage = result.evaluation.usage
  console.log(
    `\nEvaluation complete: ${result.evaluation.score}/${capture.maxScore}`
  )
  console.log(`Annotated image: ${join(runDirectory, "evaluated.png")}`)
  console.log(`Input tokens: ${usage.inputTokens}`)
  console.log(`Cached input tokens: ${usage.cachedInputTokens}`)
  console.log(`Output tokens: ${usage.outputTokens}`)
  console.log(`Reasoning tokens: ${usage.reasoningTokens}`)
  console.log(`Total tokens: ${usage.totalTokens}`)
}

const terminal = createInterface({ input, output })
try {
  const command = process.argv[2] ?? "evaluate"
  if (command === "login") {
    await login(terminal)
  } else if (command === "evaluate") {
    await evaluate(terminal)
  } else {
    throw new Error("Use `pnpm login` or `pnpm evaluate`.")
  }
} catch (error) {
  console.error(`Error: ${errorText(error)}`)
  process.exitCode = 1
} finally {
  terminal.close()
  await browserService.close()
}
