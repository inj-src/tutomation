import { mkdir, writeFile } from "node:fs/promises";

import sharp from "sharp";
import type { Page, Response as PlaywrightResponse } from "playwright";

import type { EvaluationCapture, ScriptCandidate } from "./site.js";
import { downloadedStudentImage, isStudentScriptImage } from "./site-network-image.js";
import type { captureReferences } from "./site-references.js";

const evaluationPagePattern =
  /\/(?:ExamOnlineWrittenQuestionDisplay|ExamSaqQuestionDisplay)(?:\?|$)/i;
function text(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function candidateButtonSelector(candidate: ScriptCandidate): string {
  return [
    `.btnStartEvaluation[data-examid="${candidate.examId}"]`,
    `[data-courseid="${candidate.courseId}"]`,
    `[data-subjectid="${candidate.subjectId}"]`,
    `[data-uniqueset="${candidate.uniqueSet}"]`,
    `[data-uniquesetquestionserial="${candidate.uniqueSetQuestionSerial}"]`,
    `[data-questionversion="${candidate.questionVersion}"]`,
    `[data-pendingquestion="${candidate.pendingQuestion}"]`,
  ].join("");
}

async function startCandidate(page: Page, candidate: ScriptCandidate): Promise<void> {
  const button = page.locator(candidateButtonSelector(candidate));
  if ((await button.count()) === 0) {
    throw new Error(
      "The selected script is no longer available. Reload the script list and choose another entry.",
    );
  }

  await button.click();
  try {
    await page.waitForURL(evaluationPagePattern, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForLoadState("load");
    await page.locator("canvas:visible").first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
  } catch {
    const dialog = page.locator(".bootbox:visible, .modal:visible, [role=dialog]:visible");
    const dialogText = (await dialog.count()) > 0 ? text(await dialog.last().innerText()) : "";
    if (dialogText) {
      throw new Error(
        `The website did not start the script because it reported: ${dialogText}. Resolve it on the site and retry.`,
      );
    }
    throw new Error(
      `Start Evaluation did not navigate to the evaluation page. Current URL: ${page.url()}`,
    );
  }
}

async function largestCanvas(page: Page): Promise<{
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}> {
  const canvases = page.locator("canvas:visible");
  const count = await canvases.count();
  if (count === 0) throw new Error("No visible student-script canvas was found.");

  let selected = canvases.first();
  let largestArea = -1;
  for (let index = 0; index < count; index += 1) {
    const candidate = canvases.nth(index);
    const box = await candidate.boundingBox();
    const area = box ? box.width * box.height : 0;
    if (area > largestArea) {
      largestArea = area;
      selected = candidate;
    }
  }

  return selected.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("Selected student-script element is not a canvas.");
    }
    const rect = element.getBoundingClientRect();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelWidth: element.width,
      pixelHeight: element.height,
    };
  });
}

export type ScriptCapture = Omit<EvaluationCapture, "questionPath" | "sampleAnswerPath"> & {
  outputDirectory: string;
};

export async function captureScript(
  page: Page,
  candidate: ScriptCandidate,
  outputDirectory: string,
): Promise<ScriptCapture> {
  const responses: PlaywrightResponse[] = [];
  const collectResponse = (response: PlaywrightResponse) => {
    if (isStudentScriptImage(response)) responses.push(response);
  };
  const studentImageResponse = page.waitForResponse(isStudentScriptImage, {
    timeout: 30_000,
  });
  page.on("response", collectResponse);

  try {
    await startCandidate(page, candidate);
  } finally {
    page.off("response", collectResponse);
  }

  const response = await studentImageResponse.catch(() => undefined);
  if (response) responses.push(response);
  const networkImage = await downloadedStudentImage(responses);
  const canvas = await largestCanvas(page);
  await mkdir(outputDirectory, { recursive: true });

  const bodyText = await page.locator("body").innerText();
  const maxScore = Number(bodyText.match(/Full\s*Marks\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? 0);
  if (!maxScore) throw new Error("Could not read Full Marks from the evaluation page.");

  const studentScriptPath = `${outputDirectory}/student-script.png`;
  await sharp(networkImage.bytes).png().toFile(studentScriptPath);

  return {
    outputDirectory,
    studentScriptPath,
    metadataPath: `${outputDirectory}/metadata.json`,
    evaluationUrl: page.url(),
    maxScore,
    canvas: {
      cssWidth: canvas.cssWidth,
      cssHeight: canvas.cssHeight,
      pixelWidth: networkImage.width,
      pixelHeight: networkImage.height,
    },
  };
}

export async function finalizeCapture(
  page: Page,
  candidate: ScriptCandidate,
  script: ScriptCapture,
  references: Awaited<ReturnType<typeof captureReferences>>,
): Promise<EvaluationCapture> {
  const capture: EvaluationCapture = {
    ...script,
    questionPath: references.questionPath,
    sampleAnswerPath: references.sampleAnswerPath,
  };
  const imageCanvas = {
    ...script.canvas,
  };
  await writeFile(
    script.metadataPath,
    JSON.stringify(
      {
        candidate,
        evaluationUrl: script.evaluationUrl,
        maxScore: script.maxScore,
        viewport: page.viewportSize(),
        deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
        canvas: imageCanvas,
      },
      null,
      2,
    ),
  );

  return {
    ...capture,
    canvas: imageCanvas,
  };
}
