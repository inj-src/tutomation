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
): Promise<T> {
  console.log(`\n${title}`);
  values.forEach((value, index) => {
    console.log(`${index + 1}. ${value.label}`);
  });

  while (true) {
    const answer = await terminal.question("Select a number: ");
    const selected = Number.parseInt(answer.trim(), 10);
    if (selected >= 1 && selected <= values.length) {
      return values[selected - 1];
    }
    console.log("Please enter one of the listed numbers.");
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
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const terminal = createInterface({ input, output });
  const site = new TeacherSite(terminal);

  try {
    await site.open();
    const categories = await site.listCategories();
    const category = await choose(
      terminal,
      "Available script categories",
      categories.map((value) => ({
        ...value,
        label: `${value.examName} | Pending: ${value.pending}`,
      })),
    );

    const candidates = await site.listCandidates(category);
    const candidate = await choose(
      terminal,
      `Available scripts in ${category.examName}`,
      candidates.map((value) => ({
        ...value,
        label: candidateLabel(value),
      })),
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
      maxScore: capture.maxScore,
    });

    console.log("\nEvaluation and image generation complete.");
    console.log(`Annotated image: ${annotatedPath}`);
    console.log(`Evaluation JSON: ${evaluationPath}`);
    console.log("\nModel token usage:");
    console.log(`  Input tokens:          ${evaluation.usage.inputTokens}`);
    console.log(
      `  Cached input tokens:   ${evaluation.usage.cachedInputTokens}`,
    );
    console.log(`  Output tokens:         ${evaluation.usage.outputTokens}`);
    console.log(
      `  Reasoning tokens:      ${evaluation.usage.reasoningTokens}`,
    );
    console.log(`  Total tokens:          ${evaluation.usage.totalTokens}`);
    console.log("  Image generation:      0 (local Sharp renderer)");
  } finally {
    terminal.close();
    await site.close();
  }
}

await main();
