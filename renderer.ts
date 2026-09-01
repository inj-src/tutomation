import { fileURLToPath } from "node:url";
import { readFile, readdir, writeFile } from "node:fs/promises";

import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";

import { canonicalImageSize } from "./image-scale.js";
import type { Annotation, GeneratedEvaluation, PixelPoint } from "./types.js";

const SCORE_FONT_SIZE = 30;
const COMMENT_FONT_SIZE = 28;
const EXCALIDRAW_ENTRY = fileURLToPath(new URL("./excalidraw-browser.ts", import.meta.url));
const EXCALIFONT_DIRECTORY = fileURLToPath(new URL(
  "./node_modules/@excalidraw/excalidraw/dist/prod/fonts/Excalifont/",
  import.meta.url,
));

type RenderElement = {
  type: "text" | "line" | "ellipse" | "rectangle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  angle?: number;
  points?: PixelPoint[];
  textAlign?: "left" | "right";
  strokeWidth?: number;
};

let browserBundle: Promise<string> | undefined;

async function readExcalifont(): Promise<string> {
  const fontName = (await readdir(EXCALIFONT_DIRECTORY))
    .filter((name) => name.endsWith(".woff2"))
    .sort((left, right) => right.localeCompare(left))
    .find((name) => name.includes("a88"));
  if (!fontName) {
    throw new Error("Could not find Excalifont in the installed Excalidraw package.");
  }

  return (await readFile(`${EXCALIFONT_DIRECTORY}/${fontName}`)).toString("base64");
}

function getBrowserBundle(): Promise<string> {
  browserBundle ??= build({
    entryPoints: [EXCALIDRAW_ENTRY],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    write: false,
    legalComments: "none",
  }).then((result) => {
    const output = result.outputFiles?.[0]?.text;
    if (!output) {
      throw new Error("Excalidraw browser bundle was empty.");
    }
    return output;
  });

  return browserBundle;
}

function clamp(value: number, size: number): number {
  return Math.min(size, Math.max(0, value));
}

function coordinate(value: number | null, size: number): number {
  return clamp(value ?? 0, size);
}

function formatScore(value: number): string {
  const normalized = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

  return normalized.length < 2 ? normalized.padStart(2, "0") : normalized;
}

function point(value: PixelPoint | null, width: number, height: number): [number, number] | null {
  if (!value || value.length < 2) {
    return null;
  }

  return [coordinate(value[0], width), coordinate(value[1], height)];
}

function lineElement(start: [number, number], end: [number, number]): RenderElement {
  return {
    type: "line",
    x: start[0],
    y: start[1],
    points: [
      [0, 0],
      [end[0] - start[0], end[1] - start[1]],
    ],
  };
}

function enlargedTick(
  annotation: Annotation,
  width: number,
  height: number,
  scale: number,
): RenderElement | null {
  const absolutePoints = annotation.points
    ?.map((value) => point(value, width, height))
    .filter((value): value is [number, number] => value !== null);
  if (!absolutePoints || absolutePoints.length < 2) {
    return null;
  }

  const bounds = absolutePoints.reduce(
    (current, [x, y]) => ({
      minX: Math.min(current.minX, x),
      minY: Math.min(current.minY, y),
      maxX: Math.max(current.maxX, x),
      maxY: Math.max(current.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const currentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const currentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const tickScale = Math.min(2.5, Math.max(1, (32 * scale) / currentWidth, (24 * scale) / currentHeight));
  const scaledPoints = absolutePoints.map(([x, y]) => [
    clamp(centerX + (x - centerX) * tickScale, width),
    clamp(centerY + (y - centerY) * tickScale, height),
  ] as [number, number]);
  const minX = Math.min(...scaledPoints.map(([x]) => x));
  const minY = Math.min(...scaledPoints.map(([, y]) => y));

  return {
    type: "line",
    x: minX,
    y: minY,
    points: scaledPoints.map(([x, y]) => [x - minX, y - minY]),
    strokeWidth: 4 * scale,
  };
}

function annotationElements(
  annotation: Annotation,
  width: number,
  height: number,
  scale: number,
): RenderElement[] {
  const elements: RenderElement[] = [];

  switch (annotation.kind) {
    case "underline": {
      const start = point(annotation.start, width, height);
      const end = point(annotation.end, width, height);
      if (start && end) {
        elements.push({ ...lineElement(start, end), strokeWidth: 4 * scale });
      }
      break;
    }
    case "circle":
    case "oval": {
      const center = point(annotation.center, width, height);
      if (!center || annotation.radius === null) {
        if (!center || annotation.kind !== "oval" || annotation.radiusX === null || annotation.radiusY === null) {
          break;
        }
      }

      // Keep circles local even if the model returns an oversized radius.
      // Long expressions should be marked with an underline instead.
      const maxRadius = Math.max(18, Math.round(Math.min(width, height) * 0.18));
      const radiusX = annotation.kind === "oval"
        ? Math.max(5, Math.min(annotation.radiusX ?? maxRadius, maxRadius))
        : Math.max(5, Math.min(annotation.radius ?? maxRadius, maxRadius));
      const radiusY = annotation.kind === "oval"
        ? Math.max(5, Math.min(annotation.radiusY ?? maxRadius, maxRadius))
        : radiusX;
      const diameterX = Math.min(radiusX * 2, width);
      const diameterY = Math.min(radiusY * 2, height);
      const x = Math.min(width - diameterX, Math.max(0, center[0] - diameterX / 2));
      const y = Math.min(height - diameterY, Math.max(0, center[1] - diameterY / 2));
      elements.push({
        type: "ellipse",
        x,
        y,
        width: diameterX,
        height: diameterY,
        strokeWidth: 3 * scale,
      });
      break;
    }
    case "box": {
      if (
        annotation.x === null ||
        annotation.y === null ||
        annotation.width === null ||
        annotation.height === null
      ) {
        break;
      }

      const x = coordinate(annotation.x, width);
      const y = coordinate(annotation.y, height);
      elements.push({
        type: "rectangle",
        x,
        y,
        width: Math.max(1, Math.min(annotation.width, width - x)),
        height: Math.max(1, Math.min(annotation.height, height - y)),
        strokeWidth: 3 * scale,
      });
      break;
    }
    case "tick": {
      const tick = enlargedTick(annotation, width, height, scale);
      if (tick) {
        elements.push(tick);
      }
      break;
    }
    case "text":
      if (annotation.text && annotation.x !== null && annotation.y !== null) {
        elements.push({
            type: "text",
            text: annotation.text,
            x: coordinate(annotation.x, width),
            y: coordinate(annotation.y, height),
            fontSize: COMMENT_FONT_SIZE * scale,
            fontWeight: 600,
          });
      }
      break;
  }

  const comment = annotationComment(annotation, width, height, scale);
  if (comment) {
    elements.push(comment);
  }

  return elements;
}

function annotationComment(
  annotation: Annotation,
  width: number,
  height: number,
  scale: number,
): RenderElement | null {
  const comment = annotation.kind === "text" ? null : annotation.text?.trim();
  if (!comment) {
    return null;
  }

  let anchorX = 0;
  let anchorY = 0;
  let rightEdge = 0;

  if (
    (annotation.kind === "circle" || annotation.kind === "oval") &&
    annotation.center &&
    (annotation.radius !== null || (annotation.radiusX !== null && annotation.radiusY !== null))
  ) {
    const center = point(annotation.center, width, height);
    if (!center) {
      return null;
    }
    const maxRadius = Math.max(18, Math.round(Math.min(width, height) * 0.18));
    const radiusX = annotation.kind === "oval"
      ? Math.max(5, Math.min(annotation.radiusX ?? maxRadius, maxRadius))
      : Math.max(5, Math.min(annotation.radius ?? maxRadius, maxRadius));
    anchorX = coordinate(center[0] + radiusX + 8 * scale, width);
    anchorY = coordinate(center[1] - (COMMENT_FONT_SIZE * scale) / 2, height);
    rightEdge = anchorX;
  } else if (annotation.kind === "underline" && annotation.start) {
    const start = point(annotation.start, width, height);
    if (!start) {
      return null;
    }
    anchorX = start[0];
    anchorY = Math.max(0, start[1] - COMMENT_FONT_SIZE * scale - 4 * scale);
    rightEdge = anchorX;
  } else if (annotation.kind === "box" && annotation.x !== null && annotation.y !== null) {
    anchorX = coordinate(annotation.x, width);
    anchorY = Math.max(0, coordinate(annotation.y, height) - COMMENT_FONT_SIZE * scale - 4 * scale);
    rightEdge = anchorX;
  } else {
    return null;
  }

  const estimatedWidth = comment.length * COMMENT_FONT_SIZE * scale * 0.55;
  if (rightEdge + estimatedWidth > width && anchorX >= estimatedWidth + 8) {
    return {
      type: "text",
      text: comment,
      x: anchorX - 8 * scale,
      y: anchorY,
      fontSize: COMMENT_FONT_SIZE * scale,
      fontWeight: 600,
      textAlign: "right",
    };
  }

  return {
    type: "text",
    text: comment,
    x: Math.min(anchorX, Math.max(0, width - estimatedWidth)),
    y: anchorY,
    fontSize: COMMENT_FONT_SIZE * scale,
    fontWeight: 600,
  };
}

function buildElements(
  width: number,
  height: number,
  evaluation: GeneratedEvaluation,
  scale: number,
): RenderElement[] {
  const scores: RenderElement[] = evaluation.questionScores.flatMap((questionScore) => {
    // Older responses use (0, 0) as the anchor for an unanswered part.
    if (questionScore.score === 0 && questionScore.x === 0 && questionScore.y === 0) {
      return [];
    }

    const anchorX = coordinate(questionScore.x, width);
    const anchorY = coordinate(questionScore.y, height);
    const scoreText = formatScore(questionScore.score);
    const estimatedScoreWidth = scoreText.length * 18 * scale;
    const hasLeftMargin = anchorX >= estimatedScoreWidth + 12 * scale;
    return [{
      type: "text",
      text: scoreText,
      // If the answer begins too close to the left edge, keep the mark in
      // the margin instead of moving it across the student's writing.
      x: hasLeftMargin ? anchorX - 10 * scale : 2,
      y: Math.max(0, Math.min(height - SCORE_FONT_SIZE * scale, anchorY - (SCORE_FONT_SIZE * scale) / 2)),
      fontSize: SCORE_FONT_SIZE * scale,
      fontWeight: 700,
      angle: -(35 + Math.random() * 20),
      textAlign: hasLeftMargin ? "right" : "left",
    }];
  });

  return [
    ...scores,
    ...evaluation.annotations.flatMap((annotation) => annotationElements(annotation, width, height, scale)),
  ];
}

function scalePoint(value: PixelPoint | null, scale: number): PixelPoint | null {
  return value?.map((coordinateValue) => coordinateValue * scale) ?? null;
}

function scaleEvaluation(evaluation: GeneratedEvaluation, scale: number): GeneratedEvaluation {
  if (scale === 1) {
    return evaluation;
  }

  return {
    ...evaluation,
    questionScores: evaluation.questionScores.map((questionScore) => ({
      ...questionScore,
      x: questionScore.x * scale,
      y: questionScore.y * scale,
    })),
    annotations: evaluation.annotations.map((annotation) => ({
      ...annotation,
      x: annotation.x === null ? null : annotation.x * scale,
      y: annotation.y === null ? null : annotation.y * scale,
      width: annotation.width === null ? null : annotation.width * scale,
      height: annotation.height === null ? null : annotation.height * scale,
      center: scalePoint(annotation.center, scale),
      radius: annotation.radius === null ? null : annotation.radius * scale,
      radiusX: annotation.radiusX === null ? null : annotation.radiusX * scale,
      radiusY: annotation.radiusY === null ? null : annotation.radiusY * scale,
      start: scalePoint(annotation.start, scale),
      end: scalePoint(annotation.end, scale),
      points: annotation.points?.map((value) => scalePoint(value, scale) ?? []) ?? null,
    })),
  };
}

async function renderExcalidrawSvg(
  width: number,
  height: number,
  elements: RenderElement[],
  fontDataUrl: string,
): Promise<{ svg: string; pngDataUrl: string }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[Excalidraw] ${message.text()}`);
      }
    });
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: await getBrowserBundle() });
    return await page.evaluate(async (input) => {
      await document.fonts.ready;
      const render = window.__tutomationRenderExcalidraw;
      if (!render) {
        throw new Error("Excalidraw renderer was not initialized.");
      }
      return render(input);
    }, { width, height, elements, fontDataUrl });
  } finally {
    await browser.close();
  }
}

export async function renderEvaluation(input: {
  sourcePath: string;
  outputPath: string;
  evaluation: GeneratedEvaluation;
}): Promise<void> {
  const source = sharp(input.sourcePath);
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read source image dimensions.");
  }

  const width = metadata.width;
  const height = metadata.height;
  const canonicalSize = canonicalImageSize(width, height);
  const scale = canonicalSize.scale;
  const workingWidth = canonicalSize.width;
  const workingHeight = canonicalSize.height;
  const workingEvaluation = scaleEvaluation(input.evaluation, scale);
  const elements = buildElements(workingWidth, workingHeight, workingEvaluation, scale);
  const fontData = await readExcalifont();
  const rendered = await renderExcalidrawSvg(
    workingWidth,
    workingHeight,
    elements,
    `data:font/woff2;base64,${fontData}`,
  );
  const overlayData = rendered.pngDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!overlayData) {
    throw new Error("Excalidraw overlay did not produce a PNG.");
  }
  const overlay = Buffer.from(overlayData[1], "base64");

  const workingSource = scale === 1
    ? source
    : source.clone().resize(workingWidth, workingHeight, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      });
  const output = workingSource.composite([{ input: overlay, top: 0, left: 0 }]);

  if (scale !== 1) {
    output.resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
  }

  await output.png().toFile(input.outputPath);

  await writeFile(`${input.outputPath}.svg`, rendered.svg);
}
