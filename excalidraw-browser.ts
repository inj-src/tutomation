import { convertToExcalidrawElements, FONT_FAMILY } from "@excalidraw/excalidraw";
import * as roughModule from "roughjs";

type OverlayElement = Record<string, unknown>;

type OverlayInput = {
  width: number;
  height: number;
  elements: OverlayElement[];
  fontDataUrl: string;
};

declare global {
  interface Window {
    __tutomationRenderExcalidraw?: (input: OverlayInput) => Promise<{
      svg: string;
      pngDataUrl: string;
    }>;
  }
}

const DEFAULT_COLOR = "#dc2626";
const DEFAULT_FONT_SIZE = 28;
const DEFAULT_STROKE_WIDTH = 3;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const rough = (
  roughModule as unknown as {
    default: { svg(svg: SVGSVGElement): any };
  }
).default;

function commonStyle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    strokeColor: DEFAULT_COLOR,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeStyle: "solid",
    strokeWidth: DEFAULT_STROKE_WIDTH,
    roughness: 1.5,
    opacity: 100,
    ...overrides,
  };
}

function normalizePoint(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function makeElements(input: OverlayInput): OverlayElement[] {
  return input.elements
    .map((element): OverlayElement | null => {
      if (element.type === "text") {
        const text = typeof element.text === "string" ? element.text : "";
        if (!text || typeof element.x !== "number" || typeof element.y !== "number") {
          return null;
        }

        return {
          type: "text",
          text,
          x: element.x,
          y: element.y,
          fontSize: typeof element.fontSize === "number" ? element.fontSize : DEFAULT_FONT_SIZE,
          fontFamily: FONT_FAMILY.Excalifont,
          textAlign: element.textAlign === "right" ? "right" : "left",
          verticalAlign: "top",
          autoResize: true,
          ...(typeof element.angle === "number" ? { angle: element.angle } : {}),
          ...commonStyle({ strokeWidth: 0 }),
        };
      }

      if (element.type === "line") {
        if (typeof element.x !== "number" || typeof element.y !== "number") {
          return null;
        }

        const points = Array.isArray(element.points)
          ? element.points
              .map(normalizePoint)
              .filter((point): point is [number, number] => point !== null)
          : [];
        if (points.length < 2) {
          return null;
        }

        return {
          type: "line",
          x: element.x,
          y: element.y,
          points,
          width: Math.max(1, ...points.map(([x]) => x)) - Math.min(0, ...points.map(([x]) => x)),
          height:
            Math.max(1, ...points.map(([, y]) => y)) - Math.min(0, ...points.map(([, y]) => y)),
          ...commonStyle({
            strokeWidth: typeof element.strokeWidth === "number"
              ? element.strokeWidth
              : DEFAULT_STROKE_WIDTH + 1,
          }),
        };
      }

      if (
        (element.type === "ellipse" || element.type === "rectangle") &&
        typeof element.x === "number" &&
        typeof element.y === "number" &&
        typeof element.width === "number" &&
        typeof element.height === "number"
      ) {
        return {
          type: element.type,
          x: element.x,
          y: element.y,
          width: Math.max(1, element.width),
          height: Math.max(1, element.height),
          ...commonStyle({
            strokeWidth: typeof element.strokeWidth === "number"
              ? element.strokeWidth
              : DEFAULT_STROKE_WIDTH,
          }),
        };
      }

      return null;
    })
    .filter((element): element is OverlayElement => element !== null);
}

window.__tutomationRenderExcalidraw = async (input) => {
  const elements = convertToExcalidrawElements(makeElements(input), {
    regenerateIds: true,
  });

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("version", "1.1");
  svg.setAttribute("xmlns", SVG_NAMESPACE);
  svg.setAttribute("viewBox", `0 0 ${input.width} ${input.height}`);
  svg.setAttribute("width", String(input.width));
  svg.setAttribute("height", String(input.height));

  const style = document.createElementNS(SVG_NAMESPACE, "style");
  style.textContent = `@font-face { font-family: Excalifont; src: url(${input.fontDataUrl}) format("woff2"); font-weight: 400; }`;
  svg.appendChild(style);

  const roughSvg = rough.svg(svg);
  const roughOptions = (element: {
    strokeColor: string;
    strokeWidth: number;
    roughness: number;
  }) => ({
    stroke: element.strokeColor,
    strokeWidth: element.strokeWidth,
    roughness: element.roughness,
    fill: "none",
  });

  for (const element of elements) {
    switch (element.type) {
      case "text": {
        const text = document.createElementNS(SVG_NAMESPACE, "text");
        text.setAttribute("x", String(element.x));
        text.setAttribute("y", String(element.y + element.fontSize));
        text.setAttribute("fill", element.strokeColor);
        text.setAttribute("font-family", "Excalifont, cursive");
        text.setAttribute("font-size", String(element.fontSize));
        text.setAttribute("font-weight", String(element.fontWeight ?? 600));
        text.setAttribute("text-anchor", element.textAlign === "right" ? "end" : "start");
        if (typeof element.angle === "number") {
          const estimatedTextWidth = element.text.length * element.fontSize * 0.58;
          const rotationCenterX = element.textAlign === "right"
            ? element.x - estimatedTextWidth / 2
            : element.x + estimatedTextWidth / 2;
          const rotationCenterY = element.y + element.fontSize / 2;
          text.setAttribute(
            "transform",
            `rotate(${element.angle} ${rotationCenterX} ${rotationCenterY})`,
          );
        }
        text.textContent = element.text;
        svg.appendChild(text);
        break;
      }
      case "line": {
        const points = element.points?.map(
          ([x, y]: [number, number]) => [element.x + x, element.y + y] as [number, number],
        );
        if (points && points.length >= 2) {
          svg.appendChild(roughSvg.linearPath(points, roughOptions(element)));
        }
        break;
      }
      case "ellipse":
        svg.appendChild(
          roughSvg.ellipse(
            element.x + (element.width ?? 0) / 2,
            element.y + (element.height ?? 0) / 2,
            element.width ?? 0,
            element.height ?? 0,
            roughOptions(element),
          ),
        );
        break;
      case "rectangle":
        svg.appendChild(
          roughSvg.rectangle(
            element.x,
            element.y,
            element.width ?? 0,
            element.height ?? 0,
            roughOptions(element),
          ),
        );
        break;
    }
  }

  const svgMarkup = svg.outerHTML;
  const image = new Image();
  const pngDataUrl = await new Promise<string>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = input.width;
      canvas.height = input.height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not create the Excalidraw overlay canvas."));
        return;
      }
      context.clearRect(0, 0, input.width, input.height);
      context.drawImage(image, 0, 0, input.width, input.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Could not rasterize the Excalidraw overlay."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  });

  return { svg: svgMarkup, pngDataUrl };
};
