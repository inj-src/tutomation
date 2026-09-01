import { cors } from "hono/cors"
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

import { ApiError, TeacherBrowserService } from "./service.js"
import { candidateId } from "./core/site.js"

export { ApiError, TeacherBrowserService } from "./service.js"
export { renderEvaluation } from "./core/renderer.js"
export * from "./core/types.js"
export * from "./core/site.js"
export type { TeacherCredentials } from "./core/auth.js"

const loginSchema = z.object({
  pin: z.string().min(1),
  password: z.string().min(1),
})

const evaluateSchema = z.object({
  retryNote: z.string().optional(),
})

export function createApi(service: TeacherBrowserService) {
  return new Hono()
    .use("/api/*", cors({ origin: (origin) => origin || "*" }))
    .onError((error, c) => {
      const apiError =
        error instanceof ApiError ? error : new ApiError(error.message)
      console.error(`[api:${apiError.code}] ${apiError.message}`)
      return c.json(
        {
          error: {
            code: apiError.code,
            message: apiError.message,
          },
        },
        apiError.status
      )
    })
    .get("/", (c) => c.json({ name: "tutomation", status: "ok" }))
    .get("/api/health", (c) => c.json({ status: "ok" }))
    .get("/api/categories", async (c) =>
      c.json({ categories: await service.listCategories() })
    )
    .get("/api/categories/:examId/entries", async (c) => {
      const entries = await service.listCandidates(c.req.param("examId"))
      return c.json({
        entries: entries.map((entry) => ({ ...entry, id: candidateId(entry) })),
      })
    })
    .post("/api/auth/login", zValidator("json", loginSchema), async (c) => {
      const body = c.req.valid("json")
      await service.login({ pin: body.pin, password: body.password })
      return c.json({ status: "ok", message: "Teacher credentials saved." })
    })
    .get("/api/entries/:candidateId/capture", async (c) => {
      return c.json(await service.capture(c.req.param("candidateId")))
    })
    .post(
      "/api/entries/:candidateId/evaluate",
      zValidator("json", evaluateSchema),
      async (c) => {
        const { retryNote } = c.req.valid("json")
        return c.json(
          await service.evaluate(c.req.param("candidateId"), retryNote)
        )
      }
    )
    .post("/api/entries/:candidateId/submit", async (c) => {
      return c.json({
        status: "ok",
        submitted: false,
        message:
          "Review saved locally. Website submission is disabled in the MVP.",
        candidateId: c.req.param("candidateId"),
      })
    })
}

export const browserService = new TeacherBrowserService()
export const app = createApi(browserService)
export type AppType = typeof app
