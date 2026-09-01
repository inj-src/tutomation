import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { CategoryEvaluator } from "./evaluator.js";
import { renderEvaluation } from "./renderer.js";
import { type ScriptCandidate, TeacherSite } from "./site.js";

type Choice = {
  label: string;
};

async function choose<T extends Choice>(
  terminal: ReturnType<typeof createInterface>,
  title: string,
  values: T[],
  reload: () => Promise<T[]>,
): Promise<T> {
  let options = values;

  while (true) {
    console.log(`\n${title}`);
    options.forEach((value, index) => {
      console.log(`${index + 1}. ${value.label}`);
    });
    console.log("0. Reload options");

    const answer = await terminal.question("Select a number: ");
    if (answer.trim().toLowerCase() === "r" || answer.trim() === "0") {
      try {
        options = await reload();
        console.log(`Reloaded ${options.length} option(s).`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`Could not reload options: ${message}`);
      }
      continue;
    }

    const selected = Number.parseInt(answer.trim(), 10);
    if (selected >= 1 && selected <= options.length) {
      return options[selected - 1];
    }
    console.log("Please enter one of the listed numbers or 0 to reload.");
  }
}

function candidateLabel(candidate: ScriptCandidate): string {
  return [
    candidate.examSubject,
    candidate.version,
    candidate.question,
    `Pending: ${candidate.pending}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join("_");
}

async function main(): Promise<void> {
  const runStartedAt = performance.now();
  const timings: Record<string, number> = {};
  const terminal = createInterface({ input, output });
  const site = new TeacherSite(terminal);

  try {
    const siteOpenStartedAt = performance.now();
    await site.open();
    timings.siteOpen = performance.now() - siteOpenStartedAt;

    const selectionStartedAt = performance.now();
    const loadCategories = async () => {
      try {
        const categories = await site.listCategories();
        if (categories.length === 0) {
          console.warn("Warning: No script categories are currently available.");
        }

        return categories.map((value) => ({
          ...value,
          label: `${value.examName} | Pending: ${value.pending}`,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not load script categories: ${message}`);
        return [];
      }
    };
    const category = await choose(
      terminal,
      "Available script categories",
      await loadCategories(),
      loadCategories,
    );

    const loadCandidates = async () => {
      try {
        const candidates = await site.listCandidates(category);
        if (candidates.length === 0) {
          console.warn("Warning: No scripts are currently available in this category.");
        }

        return candidates.map((value) => ({
          ...value,
          label: candidateLabel(value),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not load scripts: ${message}`);
        return [];
      }
    };
    const candidate = await choose(
      terminal,
      `Available scripts in ${category.examName}`,
      await loadCandidates(),
      loadCandidates,
    );
    timings.categoryAndScriptSelection = performance.now() - selectionStartedAt;

    const outputDirectory = `runs/${timestamp()}-exam-${candidate.examId}-script-${candidate.pendingQuestion}`;
    console.log("\nStarting evaluation and capturing browser assets...");
    const captureStartedAt = performance.now();
    const capture = await site.capture(candidate, outputDirectory);
    await site.close();
    timings.captureAndBrowserClose = performance.now() - captureStartedAt;

    const categoryKey = [
      candidate.examId,
      candidate.courseId,
      candidate.subjectId,
      candidate.uniqueSet,
      candidate.uniqueSetQuestionSerial,
      candidate.questionVersion,
    ].join("-");
    const evaluator = new CategoryEvaluator(categoryKey);
    const aiStartedAt = performance.now();
    const evaluation = await evaluator.evaluateFirst({
      questionPath: capture.questionPath,
      sampleAnswerPath: capture.sampleAnswerPath,
      studentScriptPath: capture.studentScriptPath,
      maxScore: capture.maxScore,
    });
    timings.aiEvaluation = performance.now() - aiStartedAt;

    const evaluationPath = `${outputDirectory}/evaluation.json`;
    const evaluationWriteStartedAt = performance.now();
    await writeFile(
      evaluationPath,
      JSON.stringify(
        {
          model: process.env.MODEL_ID ?? "gpt-5.6-luna",
          evaluationUrl: capture.evaluationUrl,
          maxScore: capture.maxScore,
          ...evaluation,
        },
        null,
        2,
      ),
    );
    timings.evaluationJsonWrite = performance.now() - evaluationWriteStartedAt;

    const annotatedPath = `${outputDirectory}/evaluated.png`;
    const renderStartedAt = performance.now();
    await renderEvaluation({
      sourcePath: capture.studentScriptPath,
      outputPath: annotatedPath,
      evaluation,
    });
    timings.localAnnotationRender = performance.now() - renderStartedAt;

    const totalMs = performance.now() - runStartedAt;
    const aiMs = timings.aiEvaluation ?? 0;
    const nonAiMs = totalMs - aiMs;

    console.log("\nEvaluation and image generation complete.");
    console.log(`Annotated image: ${annotatedPath}`);
    console.log(`Evaluation JSON: ${evaluationPath}`);
    console.log("\nModel token usage:");
    console.log(`  Input tokens:          ${evaluation.usage.inputTokens}`);
    console.log(`  Cached input tokens:   ${evaluation.usage.cachedInputTokens}`);
    console.log(`  Output tokens:         ${evaluation.usage.outputTokens}`);
    console.log(`  Reasoning tokens:      ${evaluation.usage.reasoningTokens}`);
    console.log(`  Total tokens:          ${evaluation.usage.totalTokens}`);
    console.log("  Image generation:      0 (local Sharp renderer)");
    console.log("\nStage timings:");
    console.log(`  Site browser startup:  ${(timings.siteOpen / 1000).toFixed(2)} s`);
    console.log(`  CLI/site selection:    ${(timings.categoryAndScriptSelection / 1000).toFixed(2)} s`);
    console.log(`  Asset capture + close:  ${(timings.captureAndBrowserClose / 1000).toFixed(2)} s`);
    console.log(`  AI evaluation:         ${(aiMs / 1000).toFixed(2)} s`);
    console.log(`  Evaluation JSON write:  ${(timings.evaluationJsonWrite / 1000).toFixed(2)} s`);
    console.log(`  Local annotation:      ${(timings.localAnnotationRender / 1000).toFixed(2)} s`);
    console.log(`  Non-AI subtotal:       ${(nonAiMs / 1000).toFixed(2)} s`);
    console.log(`  Full run:               ${(totalMs / 1000).toFixed(2)} s`);
  } finally {
    terminal.close();
    await site.close();
  }
}

await main();
