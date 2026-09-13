import { z } from "zod"

export type OrientationAngle = 0 | 90 | 180 | 270

export type ImageOrientation = {
  angle: OrientationAngle
  confidence: number | null
  source: "dedoc" | "fallback"
}

const angleSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
])
const responseSchema = z.object({
  results: z.array(
    z.object({
      angle: angleSchema,
      confidence: z.number().min(0).max(1).nullable(),
      source: z.literal("dedoc"),
    })
  ),
})

const orientationBaseUrl =
  process.env.ORIENTATION_BASE_URL ?? "http://127.0.0.1:9380"
const classifyUrl = new URL(
  "classify",
  `${orientationBaseUrl.replace(/\/+$/, "")}/`
)

function timeoutValue(name: string, fallbackValue: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : fallbackValue
}

function fallback(): ImageOrientation {
  return { angle: 0, confidence: null, source: "fallback" }
}

/** The classifier returns the clockwise correction that Sharp should apply. */
export function correctionRotation(angle: OrientationAngle): OrientationAngle {
  return angle
}

export class OrientationClassifier {
  private warned = false

  private warn(error: unknown): void {
    if (this.warned) return
    this.warned = true
    console.warn(
      `Dedoc orientation service is unavailable; using original image orientation: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  async classify(paths: string[]): Promise<ImageOrientation[]> {
    if (paths.length === 0) return []

    try {
      const response = await fetch(classifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
        signal: AbortSignal.timeout(
          timeoutValue("ORIENTATION_TIMEOUT_MS", 15_000)
        ),
      })
      if (!response.ok) {
        throw new Error(`Orientation service returned HTTP ${response.status}`)
      }
      const payload = responseSchema.parse(await response.json())
      if (payload.results.length !== paths.length) {
        throw new Error("Orientation service returned an invalid result count")
      }
      return payload.results
    } catch (error) {
      this.warn(error)
      return paths.map(() => fallback())
    }
  }
}
