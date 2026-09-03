import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ScriptCapture } from "./core/site-capture.js";
import type { EvaluationCapture, ScriptCandidate } from "./core/site.js";

export type PublicCapture = {
  status: "capturing" | "ready" | "failed";
  error?: string;
  candidate: ScriptCandidate;
  evaluationUrl: string;
  maxScore: number;
  canvas: EvaluationCapture["canvas"];
  runDirectory: string;
  referenceImage?: string;
  studentScriptImage: string;
};

export type StoredCapture = {
  candidate: ScriptCandidate;
  script: ScriptCapture;
  capture?: EvaluationCapture;
  publicCapture: PublicCapture;
  referencesReady?: Promise<void>;
};

export function timestamp(): string {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join("_");
}

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function dataUrlFromPath(path: string): Promise<string> {
  return readFile(path).then(dataUrl);
}

export async function publicCapture(
  candidate: ScriptCandidate,
  capture: EvaluationCapture,
): Promise<PublicCapture> {
  const [referenceImage, studentScriptImage] = await Promise.all([
    readFile(capture.referencePath).then(dataUrl),
    readFile(capture.studentScriptPath).then(dataUrl),
  ]);

  return {
    status: "ready",
    candidate,
    evaluationUrl: capture.evaluationUrl,
    maxScore: capture.maxScore,
    canvas: capture.canvas,
    runDirectory: dirname(capture.studentScriptPath),
    referenceImage,
    studentScriptImage,
  };
}

export async function scriptPublicCapture(
  candidate: ScriptCandidate,
  script: ScriptCapture,
): Promise<PublicCapture> {
  return {
    status: "capturing",
    candidate,
    evaluationUrl: script.evaluationUrl,
    maxScore: script.maxScore,
    canvas: script.canvas,
    runDirectory: script.outputDirectory,
    studentScriptImage: await dataUrlFromPath(script.studentScriptPath),
  };
}
