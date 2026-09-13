import { createInterface, type Interface } from "node:readline"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

export type OrientationAngle = 0 | 90 | 180 | 270

export type ImageOrientation = {
  angle: OrientationAngle
  confidence: number | null
  source: "paddleocr" | "fallback"
}

type WorkerRequest = { id: number; paths: string[] }
type WorkerResponse =
  | { ready: true }
  | { id: number; results: Array<{ angle: number; confidence: number | null }> }
  | { id: number; error: string }

type PendingRequest = {
  resolve: (value: ImageOrientation[]) => void
  reject: (error: Error) => void
  paths: string[]
}

const workerPath = fileURLToPath(
  new URL("../../orientation/worker.py", import.meta.url)
)
const virtualenvPython = fileURLToPath(
  new URL("../../orientation/.venv/bin/python", import.meta.url)
)

function fallback(paths: string[]): ImageOrientation[] {
  return paths.map(() => ({ angle: 0, confidence: null, source: "fallback" }))
}

function validAngle(value: number): OrientationAngle {
  if (value === 90 || value === 180 || value === 270) return value
  return 0
}

function timeoutValue(name: string, fallbackValue: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : fallbackValue
}

/** Convert Paddle's detected clockwise orientation into Sharp's rotation. */
export function correctionRotation(angle: OrientationAngle): OrientationAngle {
  return ((360 - angle) % 360) as OrientationAngle
}

export class OrientationClassifier {
  private process: ChildProcessWithoutNullStreams | undefined
  private lines: Interface | undefined
  private starting: Promise<boolean> | undefined
  private unavailable = process.env.PADDLEOCR_ENABLED === "false"
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private warned = false

  async start(): Promise<boolean> {
    if (this.unavailable) return false
    if (this.process) return true
    if (this.starting) return this.starting

    this.starting = new Promise<boolean>((resolve) => {
      const python =
        process.env.PADDLEOCR_PYTHON ??
        (existsSync(virtualenvPython) ? virtualenvPython : "python3")
      const child = spawn(
        python,
        [process.env.PADDLEOCR_WORKER ?? workerPath],
        {
          env: {
            ...process.env,
            PADDLE_PDX_MODEL_SOURCE:
              process.env.PADDLE_PDX_MODEL_SOURCE ?? "BOS",
          },
          stdio: ["pipe", "pipe", "pipe"],
        }
      )
      this.process = child
      this.lines = createInterface({ input: child.stdout })

      let settled = false
      const finish = (ready: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (!ready) this.markUnavailable()
        resolve(ready)
      }
      const timer = setTimeout(
        () => finish(false),
        timeoutValue("PADDLEOCR_STARTUP_TIMEOUT_MS", 120_000)
      )

      this.lines.on("line", (line) => {
        try {
          this.handle(JSON.parse(line) as WorkerResponse, finish)
        } catch {
          // Paddle logs are redirected to stderr; malformed stdout is ignored.
        }
      })
      child.stderr.on("data", (chunk: Buffer) => {
        if (process.env.PADDLEOCR_DEBUG === "true") process.stderr.write(chunk)
      })
      child.once("error", () => finish(false))
      child.once("close", () => {
        if (!settled) finish(false)
        this.rejectPending(new Error("The PaddleOCR worker stopped."))
        this.process = undefined
        this.lines = undefined
      })
    }).finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  async warm(): Promise<void> {
    await this.start()
  }

  private handle(
    response: WorkerResponse,
    finish: (ready: boolean) => void
  ): void {
    if ("ready" in response) {
      finish(true)
      return
    }
    const request = this.pending.get(response.id)
    if (!request) return
    this.pending.delete(response.id)
    if ("error" in response) {
      request.reject(new Error(response.error))
      return
    }
    if (response.results.length !== request.paths.length) {
      request.reject(new Error("PaddleOCR returned an invalid result count."))
      return
    }
    request.resolve(
      response.results.map((result) => ({
        angle: validAngle(result.angle),
        confidence: result.confidence,
        source: "paddleocr",
      }))
    )
  }

  private markUnavailable(): void {
    this.unavailable = true
    this.process?.kill()
    this.process = undefined
    this.lines?.close()
    this.lines = undefined
    if (!this.warned) {
      this.warned = true
      console.warn(
        "PaddleOCR orientation worker is unavailable; using original image orientation."
      )
    }
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }

  async classify(paths: string[]): Promise<ImageOrientation[]> {
    if (paths.length === 0) return []
    if (!(await this.start())) return fallback(paths)
    const child = this.process
    if (!child) return fallback(paths)

    return new Promise<ImageOrientation[]>((resolve, reject) => {
      const id = this.nextRequestId++
      this.pending.set(id, { resolve, reject, paths })
      const request: WorkerRequest = { id, paths }
      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) return
        this.pending.delete(id)
        this.markUnavailable()
        resolve(fallback(paths))
      })
    }).catch((error: unknown) => {
      this.markUnavailable()
      console.warn(
        `PaddleOCR orientation failed; using original orientation: ${error instanceof Error ? error.message : String(error)}`
      )
      return fallback(paths)
    })
  }

  async close(): Promise<void> {
    await this.starting?.catch(() => false)
    this.rejectPending(new Error("The PaddleOCR worker was closed."))
    this.lines?.close()
    this.process?.kill()
    this.lines = undefined
    this.process = undefined
  }
}
