import { generateText, Output } from "ai";
import { createOpenAIOAuth } from "openai-oauth-provider";

import {
  fileImage,
  pageContent,
  prepareScriptPages,
  type EvaluationContent,
  type PreparedScriptPage,
} from "./evaluation-images.js";
import {
  evaluationSchema,
  restoreEvaluationPages,
  type EvaluationOutput,
} from "./evaluation-output.js";
import type { GeneratedEvaluation, TokenUsage } from "./types.js";

type ScriptPageInput = {
  imageIndex: number;
  studentScriptPath: string;
};

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

const systemPrompt = `You evaluate handwritten student answers by comparing every supplied student-script image with the question and sample answer. The images form one answer in the exact order supplied. Return exactly one pages item for every image, using its zero-based imageIndex; never move an annotation or score to another image. Award one fair total score between zero and the full marks. Return one questionScores entry for every distinguishable answerable question or sub-question, on the image where that visible work appears. Do not duplicate a part score across images, and make the sum of all part scores across all images equal the total score.

For each score, return the part label, earned score, maximum score, and an integer pixel anchor at the left edge and vertical center of that answer's visible work. If an answer area is blank or absent, give it zero but return no annotation or comment. If visible work is materially wrong, add one or two local annotations and a concise two- or three-word comment. Put commentAt in nearby blank space; omit it if no safe space exists. Use underlines for wrong portions, ovals for one wrong word, symbol, or short formula, and ticks only where useful. Ovals must tightly enclose the target and never span a line or section. Use circle only for genuinely round targets. Every annotation must overlap relevant visible handwriting.

Coordinates are integers with (0, 0) at each image's top-left, x rightward, and y downward. For circles return center and radius. For ovals return center, radiusX, and radiusY. For underlines return start and end. For ticks return points. For boxes return x, y, width, and height. For text return x and y. Never return normalized coordinates. The renderer formats short earned marks itself, so return numeric scores.`;

export class CategoryEvaluator {
  private readonly model: ReturnType<ReturnType<typeof createOpenAIOAuth>>;
  private readonly promptCacheKey: string;
  private previousResponseId: string | undefined;

  constructor(categoryKey: string) {
    const modelId = process.env.MODEL_ID ?? "gpt-5.6-luna";
    this.model = createOpenAIOAuth({ store: false })(modelId);
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
    pages: PreparedScriptPage[],
  ): Promise<GeneratedEvaluation> {
    const result = await generateText({
      model: this.model,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...content] }],
      output: Output.object({
        schema: evaluationSchema(pages.length, maxScore),
      }),
      providerOptions: this.providerOptions(),
    });
    const output: EvaluationOutput | undefined = result.output;
    if (!output) throw new Error("The model returned no structured evaluation.");

    this.previousResponseId = result.response.id ?? undefined;
    const restored = restoreEvaluationPages(
      output,
      pages.map((page) => ({
        original: page.original,
        inverseScale: 1 / page.canonical.scale,
      })),
      maxScore,
    );
    return {
      ...restored,
      usage: usageOf(result.usage),
      responseId: result.response.id ?? null,
    };
  }

  async evaluateFirst(input: {
    referencePath: string;
    pages: ScriptPageInput[];
    maxScore: number;
  }): Promise<GeneratedEvaluation> {
    const [reference, pages] = await Promise.all([
      fileImage(input.referencePath),
      prepareScriptPages(input.pages),
    ]);
    return this.request(
      `This is the first script in this category. Full marks are ${input.maxScore}. Evaluate all ${pages.length} student-script images as one ordered answer. Return every imageIndex from 0 through ${pages.length - 1} exactly once.`,
      [
        { type: "text", text: "Reference image: question and sample answer" },
        { type: "file", mediaType: "image/png", data: reference },
        ...pageContent(pages),
      ],
      input.maxScore,
      pages,
    );
  }

  async evaluateNext(input: {
    pages: ScriptPageInput[];
    maxScore: number;
    scriptId: string;
    retryNote?: string;
  }): Promise<GeneratedEvaluation> {
    if (!this.previousResponseId) {
      throw new Error("Cannot evaluate a follow-up before the first request.");
    }
    const pages = await prepareScriptPages(input.pages);
    const retryNote = input.retryNote ? ` Teacher note: ${input.retryNote}` : "";
    return this.request(
      `Evaluate only the new ordered answer for script ID ${input.scriptId}, using the prior question and sample-answer context. Full marks are ${input.maxScore}. Return every imageIndex from 0 through ${pages.length - 1} exactly once.${retryNote}`,
      pageContent(pages),
      input.maxScore,
      pages,
    );
  }
}
