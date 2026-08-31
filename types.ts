export type AnnotationKind = "underline" | "circle" | "tick" | "text" | "box";

export type Point = {
  x: number;
  y: number;
};

export type Annotation = {
  kind: AnnotationKind;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  text: string | null;
  points: Point[] | null;
  mark: number | null;
  confidence: number | null;
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type GeneratedEvaluation = {
  score: number;
  summary: string;
  annotations: Annotation[];
  usage: TokenUsage;
  responseId: string | null;
};
