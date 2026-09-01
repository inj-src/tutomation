import { mkdir, writeFile } from "node:fs/promises";
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
  const terminal = createInterface({ input, output });
  const site = new TeacherSite(terminal);

  try {
    await site.open();
    const loadCategories = async () =>
      (await site.listCategories()).map((value) => ({
        ...value,
        label: `${value.examName} | Pending: ${value.pending}`,
      }));
    const category = await choose(
      terminal,
      "Available script categories",
      await loadCategories(),
      loadCategories,
    );

    const loadCandidates = async () =>
      (await site.listCandidates(category)).map((value) => ({
        ...value,
        label: candidateLabel(value),
      }));
    const candidate = await choose(
      terminal,
      `Available scripts in ${category.examName}`,
      await loadCandidates(),
      loadCandidates,
    );

    const outputDirectory = `runs/${timestamp()}-exam-${candidate.examId}-script-${candidate.pendingQuestion}`;
    console.log("\nStarting evaluation and capturing browser assets...");
    const capture = await site.capture(candidate, outputDirectory);
    await site.close();

    const categoryKey = [
      candidate.examId,
      candidate.courseId,
      candidate.subjectId,
      candidate.uniqueSet,
      candidate.uniqueSetQuestionSerial,
      candidate.questionVersion,
    ].join("-");
    const evaluator = new CategoryEvaluator(categoryKey);
    const evaluation = await evaluator.evaluateFirst({
      questionPath: capture.questionPath,
      sampleAnswerPath: capture.sampleAnswerPath,
      studentScriptPath: capture.studentScriptPath,
      maxScore: capture.maxScore,
    });

    const evaluationPath = `${outputDirectory}/evaluation.json`;
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

    const annotatedPath = `${outputDirectory}/evaluated.png`;
    await renderEvaluation({
      sourcePath: capture.studentScriptPath,
      outputPath: annotatedPath,
      evaluation,
    });

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
  } finally {
    terminal.close();
    await site.close();
  }
}

await main();
