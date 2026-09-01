type EventFields = Record<string, unknown>;

const colors = {
  reset: "\u001b[0m",
  red: "\u001b[31m",
  dim: "\u001b[2m",
  yellow: "\u001b[33m",
} as const;

function useColors(): boolean {
  return Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
}

function colorize(value: string, color: keyof typeof colors): string {
  return useColors() ? `${colors[color]}${value}${colors.reset}` : value;
}

function errorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  return { message: String(error) };
}

export function logEvent(event: string, fields: EventFields = {}): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    }),
  );
}

export function logError(event: string, error: unknown, fields: EventFields = {}): void {
  const { message, stack } = errorDetails(error);
  const timestamp = new Date().toLocaleTimeString([], { hour12: false });
  const context = Object.entries(fields)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");

  console.error(`${colorize(`[${timestamp}] ERROR`, "red")} ${event}`);
  if (context) {
    console.error(`  ${colorize(context, "yellow")}`);
  }
  console.error(`  ${message}`);
  if (stack) {
    const stackLines = stack.split("\n").slice(1);
    if (stackLines.length > 0) {
      console.error(colorize(`  ${stackLines.join("\n  ")}`, "dim"));
    }
  }
}
