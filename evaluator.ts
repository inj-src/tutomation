import { readFile } from "node:fs/promises";

import { generateText, Output } from "ai";
import { createOpenAIOAuth } from "openai-oauth-provider";
import sharp from "sharp";
import { z } from "zod";

import type { GeneratedEvaluation, TokenUsage } from "./types.js";

type ImageSize = {
  width: number;
  height: number;
};

function pointSchema(size: ImageSize) {
  return z.array(z.number().int().min(0).max(Math.max(size.width, size.height))).length(2);
}

function evaluationSchema(size: ImageSize, maxScore: number) {
  const point = pointSchema(size);

  return z.object({
    score: z.number().min(0).max(maxScore),
    summary: z.string(),
    questionScores: z.array(
      z.object({
        part: z.string(),
        score: z.number().min(0).max(maxScore),
        maxScore: z.number().min(0).max(maxScore),
        x: z.number().int().min(0).max(size.width),
        y: z.number().int().min(0).max(size.height),
        confidence: z.number().min(0).max(1).nullable(),
      }),
    ),
    annotations: z.array(
      z.object({
        kind: z.enum(["underline", "circle", "tick", "text", "box"]),
        x: z.number().int().min(0).max(size.width).nullable(),
        y: z.number().int().min(0).max(size.height).nullable(),
        width: z.number().int().min(0).max(size.width).nullable(),
        height: z.number().int().min(0).max(size.height).nullable(),
        center: point.nullable(),
        radius: z.number().int().min(1).max(Math.max(size.width, size.height)).nullable(),
        start: point.nullable(),
        end: point.nullable(),
        text: z.string().nullable(),
        points: z.array(point).nullable(),
        mark: z.number().nullable(),
        confidence: z.number().min(0).max(1).nullable(),
      }),
    ),
  });
}

type EvaluationOutput = z.infer<ReturnType<typeof evaluationSchema>>;

type EvaluationContent =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: "image/png"; data: string };

function dataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function imageSize(path: string): Promise<ImageSize> {
  const metadata = await sharp(path).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read image dimensions: ${path}`);
  }

  return { width: metadata.width, height: metadata.height };
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageOf(value: unknown): TokenUsage {
  const usage = (value ?? {}) as Record<string, unknown>;
  const inputDetails = (usage.inputTokenDetails ?? {}) as Record<string, unknown>;
  const outputDetails = (usage.outputTokenDetails ?? {}) as Record<string, unknown>;

  return {
    inputTokens: numeric(usage.inputTokens),
    cachedInputTokens: numeric(inputDetails.cacheReadTokens ?? usage.cachedInputTokens),
    outputTokens: numeric(usage.outputTokens),
    reasoningTokens: numeric(outputDetails.reasoningTokens ?? usage.reasoningTokens),
    totalTokens: numeric(usage.totalTokens),
  };
}

export class CategoryEvaluator {
  private readonly modelId: string;
  private readonly model: ReturnType<ReturnType<typeof createOpenAIOAuth>>;
  private readonly promptCacheKey: string;
  private previousResponseId: string | undefined;

  constructor(categoryKey: string) {
    this.modelId = process.env.MODEL_ID ?? "gpt-5.6-luna";
    const openai = createOpenAIOAuth({ store: false });
    this.model = openai(this.modelId);
    this.promptCacheKey = `tutomation-category-${categoryKey}`;
  }

  private providerOptions(): {
    openai: {
      store: false;
      promptCacheKey: string;
      reasoningEffort: string;
      previousResponseId?: string;
    };
  } {
    return {
      openai: {
        store: false,
        promptCacheKey: this.promptCacheKey,
        reasoningEffort: process.env.REASONING_EFFORT ?? "low",
        ...(this.previousResponseId ? { previousResponseId: this.previousResponseId } : {}),
      },
    };
  }

  private async request(
    prompt: string,
    content: EvaluationContent[],
    maxScore: number,
    size: ImageSize,
  ): Promise<GeneratedEvaluation> {
    const result = await generateText({
      model: this.model,
      system:
        "You evaluate handwritten student answers. Compare the student answer with the question and sample answer. Award a fair score between zero and the full marks. Return one questionScores entry for every distinguishable answerable question or sub-question. Keep each score within that part's maxScore, and make the sum of the part scores equal the total score. For each questionScores entry, return the part label, earned score, maximum score, and an integer pixel anchor at the left edge and vertical center of that answer's visible work. The renderer will place the earned mark immediately to the left of that anchor. Return concise comments of two or three words. Use underlines for wrong portions, circles for wrong words or formulas, and ticks only where useful. Use integer pixel coordinates with (0, 0) at the top-left, x increasing to the right, and y increasing downward. For circles, return center [x, y] and radius. For underlines, return start [x, y] and end [x, y]. For ticks, return points. For boxes, return x, y, width, and height. For text, return x and y. Every annotation must overlap the relevant visible handwriting; do not invent annotations when the target is uncertain. Never return normalized 0-to-1 coordinates. The renderer formats earned marks shorter than two characters with a leading zero, so numeric scores should be returned as numbers.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...content],
        },
      ],
      output: Output.object({ schema: evaluationSchema(size, maxScore) }),
      providerOptions: this.providerOptions(),
    });

    const output: EvaluationOutput | undefined = result.output;
    if (!output) {
      throw new Error("The model returned no structured evaluation.");
    }

    this.previousResponseId = result.response.id ?? undefined;

    return {
      score: Math.min(maxScore, Math.max(0, output.score)),
      summary: output.summary,
      annotations: output.annotations,
      questionScores: output.questionScores.map((questionScore) => ({
        ...questionScore,
        score: Math.min(questionScore.maxScore, Math.max(0, questionScore.score)),
        maxScore: Math.min(maxScore, Math.max(0, questionScore.maxScore)),
        x: Math.min(size.width, Math.max(0, questionScore.x)),
        y: Math.min(size.height, Math.max(0, questionScore.y)),
      })),
      usage: usageOf(result.usage),
      responseId: result.response.id ?? null,
    };
  }

  async evaluateFirst(input: {
    questionPath: string;
    sampleAnswerPath: string;
    studentScriptPath: string;
    maxScore: number;
  }): Promise<GeneratedEvaluation> {
    const [question, sampleAnswer, studentScript, size] = await Promise.all([
      readFile(input.questionPath),
      readFile(input.sampleAnswerPath),
      readFile(input.studentScriptPath),
      imageSize(input.studentScriptPath),
    ]);

    return this.request(
      `This is the first script in this category. The full marks are ${input.maxScore}. The student-script image dimensions are ${size.width}×${size.height} pixels. Evaluate the student script and return the total score, per-question scores, and annotations. For each answerable question or sub-question, place its score anchor at the left edge and vertical center of the corresponding visible answer. Keep all visible comments short.`,
      [
        { type: "text", text: "Reference image: question" },
        { type: "file", mediaType: "image/png", data: dataUrl(question) },
        { type: "text", text: "Reference image: sample answer" },
        { type: "file", mediaType: "image/png", data: dataUrl(sampleAnswer) },
        { type: "text", text: "Target image: student script" },
        { type: "file", mediaType: "image/png", data: dataUrl(studentScript) },
      ],
      input.maxScore,
      size,
    );
  }

  async evaluateNext(input: {
    studentScriptPath: string;
    maxScore: number;
    scriptId: string;
    retryNote?: string;
  }): Promise<GeneratedEvaluation> {
    if (!this.previousResponseId) {
      throw new Error("Cannot evaluate a follow-up before the first request.");
    }

    const [studentScript, size] = await Promise.all([
      readFile(input.studentScriptPath),
      imageSize(input.studentScriptPath),
    ]);
    const retryNote = input.retryNote ? ` Teacher note: ${input.retryNote}` : "";

    return this.request(
      `Evaluate only the new student script for script ID ${input.scriptId}. Continue using the question and sample answer context from the previous request. The student-script image dimensions are ${size.width}×${size.height} pixels. Full marks are ${input.maxScore}. Return the total score, one score entry for each distinguishable answerable question or sub-question, and the annotations. Place each score anchor at the left edge and vertical center of its corresponding visible answer.${retryNote}`,
      [
        { type: "text", text: "Target image: student script" },
        { type: "file", mediaType: "image/png", data: dataUrl(studentScript) },
      ],
      input.maxScore,
      size,
    );
  }
}
