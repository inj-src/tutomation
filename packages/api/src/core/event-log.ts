type EventFields = Record<string, unknown>;

const colors = {
  reset: "\u001b[0m",
  red: "\u001b[31m",
  dim: "\u001b[2m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  cyan: "\u001b[36m",
} as const;

function useColors(): boolean {
  return Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
}

function usePrettyLogs(): boolean {
  return Boolean(process.stdout.isTTY);
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

function eventTitle(event: string): string {
  return event
    .split(".")
    .map((part, index) => (index === 0 ? part.toUpperCase() : part))
    .join(" ");
}

function eventColor(event: string): keyof typeof colors {
  if (event.endsWith("failed")) return "red";
  if (event.endsWith("completed")) return "green";
  if (event.endsWith("started")) return "yellow";
  return "cyan";
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    const formatted = value.toLocaleString("en-US");
    return key.endsWith("Ms") ? `${formatted} ms` : formatted;
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatFields(fields: EventFields): string[] {
  const entries = Object.entries(fields);
  const labelWidth = Math.max(...entries.map(([key]) => key.length), 0);

  return entries.flatMap(([key, value]) => {
    const label = key.padEnd(labelWidth);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = Object.entries(value);
      return [
        `  ${label}`,
        ...nested.map(
          ([nestedKey, nestedValue]) =>
            `    ${nestedKey.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}: ${formatValue(nestedKey, nestedValue)}`,
        ),
      ];
    }
    return [`  ${label}  ${formatValue(key, value)}`];
  });
}

export function logEvent(event: string, fields: EventFields = {}): void {
  const timestamp = new Date().toISOString();
  const payload = { timestamp, event, ...fields };

  if (!usePrettyLogs()) {
    console.log(JSON.stringify(payload));
    return;
  }

  const time = new Date(timestamp).toLocaleTimeString([], { hour12: false });
  console.log(`${colorize(`[${time}]`, "dim")} ${colorize(eventTitle(event), eventColor(event))}`);
  for (const line of formatFields(fields)) {
    console.log(line);
  }
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
