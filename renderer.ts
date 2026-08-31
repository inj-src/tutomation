import { writeFile } from "node:fs/promises";

import sharp from "sharp";

import type { GeneratedEvaluation, PixelPoint } from "./types.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value: number, size: number): number {
  return Math.min(size, Math.max(0, value));
}

function coordinate(value: number | null, size: number): number {
  return clamp(value ?? 0, size);
}

function point(
  value: PixelPoint | null,
  width: number,
  height: number,
): PixelPoint | null {
  if (!value) {
    return null;
  }

  return [coordinate(value[0], width), coordinate(value[1], height)];
}

function renderSvg(
  width: number,
  height: number,
  evaluation: GeneratedEvaluation,
  maxScore: number,
): string {
  const annotationSvg = evaluation.annotations
    .map((annotation) => {
      const color = "#e11d48";

      switch (annotation.kind) {
        case "underline": {
          const start = point(annotation.start, width, height);
          const end = point(annotation.end, width, height);
          return start && end
            ? `<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`
            : "";
        }
        case "circle": {
          const center = point(annotation.center, width, height);
          if (!center || annotation.radius === null) {
            return "";
          }

          const radius = Math.max(
            4,
            Math.min(annotation.radius, Math.max(width, height)),
          );
          return `<circle cx="${center[0]}" cy="${center[1]}" r="${radius}" fill="none" stroke="${color}" stroke-width="3" />`;
        }
        case "box": {
          if (
            annotation.x === null ||
            annotation.y === null ||
            annotation.width === null ||
            annotation.height === null
          ) {
            return "";
          }

          const x = coordinate(annotation.x, width);
          const y = coordinate(annotation.y, height);
          const boxWidth = Math.min(annotation.width, width - x);
          const boxHeight = Math.min(annotation.height, height - y);
          return `<rect x="${x}" y="${y}" width="${Math.max(0, boxWidth)}" height="${Math.max(0, boxHeight)}" fill="none" stroke="${color}" stroke-width="3" />`;
        }
        case "tick": {
          const points = annotation.points
            ?.map((value) => point(value, width, height))
            .filter((value): value is PixelPoint => value !== null)
            .map((value) => `${value[0]},${value[1]}`)
            .join(" ");
          return points
            ? `<polyline points="${points}" fill="none" stroke="#15803d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`
            : "";
        }
        case "text":
          return annotation.text && annotation.x !== null && annotation.y !== null
            ? `<text x="${coordinate(annotation.x, width)}" y="${Math.max(20, coordinate(annotation.y, height))}" fill="${color}" font-family="Noto Sans Bengali, Noto Sans, sans-serif" font-size="20" font-weight="600">${escapeXml(annotation.text)}</text>`
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
