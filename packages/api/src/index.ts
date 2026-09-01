import { cors } from "hono/cors";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { logError, logEvent } from "./core/event-log.js";
import { ApiError, TeacherBrowserService } from "./service.js";
import { candidateId } from "./core/site.js";

export { ApiError, TeacherBrowserService } from "./service.js";
export { renderEvaluation } from "./core/renderer.js";
export * from "./core/types.js";
export * from "./core/site.js";
export type { TeacherCredentials } from "./core/auth.js";

const loginSchema = z.object({
  pin: z.string().min(1),
  password: z.string().min(1),
});

const evaluateSchema = z.object({
  retryNote: z.string().optional(),
});

export function createApi(service: TeacherBrowserService) {
  return new Hono()
    .use("*", requestId())
    .use("*", logger())
    .use("/api/*", cors({ origin: (origin) => origin || "*" }))
    .onError((error, c) => {
      const apiError = error instanceof ApiError ? error : new ApiError(error.message);
      logError("http.error", error, {
        requestId: c.var.requestId,
        method: c.req.method,
        path: c.req.path,
        status: apiError.status,
        code: apiError.code,
      });
      return c.json(
        {
          error: {
            code: apiError.code,
            message: apiError.message,
          },
        },
        apiError.status,
      );
    })
    .get("/", (c) => c.json({ name: "tutomation", status: "ok" }))
    .get("/api/health", (c) => c.json({ status: "ok" }))
    .get("/api/categories", async (c) => c.json({ categories: await service.listCategories() }))
    .get("/api/categories/:examId/entries", async (c) => {
      const entries = await service.listCandidates(c.req.param("examId"));
      return c.json({
        entries: entries.map((entry) => ({ ...entry, id: candidateId(entry) })),
      });
    })
    .post("/api/auth/login", zValidator("json", loginSchema), async (c) => {
      const body = c.req.valid("json");
      await service.login({ pin: body.pin, password: body.password });
      return c.json({ status: "ok", message: "Teacher credentials saved." });
    })
    .get("/api/entries/:candidateId/capture", async (c) => {
      return c.json(await service.capture(c.req.param("candidateId")));
    })
    .post("/api/entries/:candidateId/evaluate", zValidator("json", evaluateSchema), async (c) => {
      const { retryNote } = c.req.valid("json");
      const candidateIdValue = c.req.param("candidateId");
      const startedAt = Date.now();
      logEvent("ai.evaluation.started", {
        requestId: c.var.requestId,
        candidateId: candidateIdValue,
        hasRetryNote: Boolean(retryNote),
      });

      try {
        const result = await service.evaluate(candidateIdValue, retryNote);
        logEvent("ai.evaluation.completed", {
          requestId: c.var.requestId,
          candidateId: candidateIdValue,
          durationMs: Date.now() - startedAt,
          score: result.evaluation.score,
          questionScoreCount: result.evaluation.questionScores.length,
          annotationCount: result.evaluation.annotations.length,
          usage: result.evaluation.usage,
          responseId: result.evaluation.responseId,
        });
        return c.json(result);
      } catch (error) {
        logError("ai.evaluation.failed", error, {
          requestId: c.var.requestId,
          candidateId: candidateIdValue,
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
    })
    .post("/api/entries/:candidateId/submit", async (c) => {
      return c.json({
        status: "ok",
        submitted: false,
        message: "Review saved locally. Website submission is disabled in the MVP.",
        candidateId: c.req.param("candidateId"),
      });
    });
}

export const browserService = new TeacherBrowserService();
export const app = createApi(browserService);
export type AppType = typeof app;
