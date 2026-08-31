import { writeFile } from "node:fs/promises";

import sharp from "sharp";

import type { GeneratedEvaluation } from "./types.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function px(value: number | null, size: number): number {
  return clamp(value ?? 0) * size;
}

function renderSvg(
  width: number,
  height: number,
  evaluation: GeneratedEvaluation,
  maxScore: number,
): string {
  const annotationSvg = evaluation.annotations
    .map((annotation) => {
      const x = px(annotation.x, width);
      const y = px(annotation.y, height);
      const annotationWidth = px(annotation.width, width);
      const annotationHeight = px(annotation.height, height);
      const color = "#e11d48";

      switch (annotation.kind) {
        case "underline":
          return `<line x1="${x}" y1="${y + annotationHeight}" x2="${x + annotationWidth}" y2="${y + annotationHeight}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
        case "circle":
          return `<ellipse cx="${x + annotationWidth / 2}" cy="${y + annotationHeight / 2}" rx="${Math.max(annotationWidth / 2, 8)}" ry="${Math.max(annotationHeight / 2, 8)}" fill="none" stroke="${color}" stroke-width="3" />`;
        case "box":
          return `<rect x="${x}" y="${y}" width="${annotationWidth}" height="${annotationHeight}" fill="none" stroke="${color}" stroke-width="3" />`;
        case "tick": {
          const points = annotation.points?.length
            ? annotation.points
                .map((point) => `${px(point.x, width)},${px(point.y, height)}`)
                .join(" ")
            : `${x},${y + annotationHeight / 2} ${x + annotationWidth / 3},${y + annotationHeight} ${x + annotationWidth},${y}`;
          return `<polyline points="${points}" fill="none" stroke="#15803d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`;
        }
        case "text":
          return annotation.text
            ? `<text x="${x}" y="${Math.max(20, y)}" fill="${color}" font-family="Noto Sans Bengali, Noto Sans, sans-serif" font-size="20" font-weight="600">${escapeXml(annotation.text)}</text>`
            : "";
      }
    })
    .join("");

  const scoreText = `${evaluation.score.toFixed(2)} / ${maxScore.toFixed(2)}`;
  const scoreX = Math.max(0, width - 240);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${annotationSvg}
    <rect x="${scoreX}" y="12" width="228" height="44" rx="8" fill="white" fill-opacity="0.88" stroke="#e11d48" stroke-width="2" />
    <text x="${scoreX + 114}" y="41" text-anchor="middle" fill="#9f1239" font-family="Noto Sans, sans-serif" font-size="20" font-weight="700">Score: ${escapeXml(scoreText)}</text>
  </svg>`;
}

export async function renderEvaluation(input: {
  sourcePath: string;
  outputPath: string;
  evaluation: GeneratedEvaluation;
  maxScore: number;
}): Promise<void> {
  const source = sharp(input.sourcePath);
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read source image dimensions.");
  }

  const overlay = Buffer.from(
    renderSvg(metadata.width, metadata.height, input.evaluation, input.maxScore),
  );

  await source
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toFile(input.outputPath);

  await writeFile(
    `${input.outputPath}.svg`,
    renderSvg(metadata.width, metadata.height, input.evaluation, input.maxScore),
  );
}
