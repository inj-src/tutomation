export type AnnotationKind = "underline" | "circle" | "oval" | "tick" | "text" | "box";

export type PixelPoint = number[];

export type Annotation = {
  kind: AnnotationKind;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  center: PixelPoint | null;
  radius: number | null;
  radiusX: number | null;
  radiusY: number | null;
  commentAt: PixelPoint | null;
  start: PixelPoint | null;
  end: PixelPoint | null;
  text: string | null;
  points: PixelPoint[] | null;
  mark: number | null;
  confidence: number | null;
};

export type QuestionScore = {
  part: string;
  score: number;
  maxScore: number;
  x: number;
  y: number;
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
  questionScores: QuestionScore[];
  usage: TokenUsage;
  responseId: string | null;
};
