import {
  access,
  chmod,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import type { Interface as ReadlineInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { BrowserContext, Page } from "playwright";

export const authDirectory = ".auth";
export const authFile = `${authDirectory}/state.json`;
export const credentialsFile =
  process.env.CREDENTIALS_FILE ?? `${authDirectory}/credentials.json`;

type Credentials = {
  pin: string;
  password: string;
};

function isCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pin === "string" &&
    candidate.pin.trim().length > 0 &&
    typeof candidate.password === "string" &&
    candidate.password.length > 0
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function hasSavedAuthState(): Promise<boolean> {
  return fileExists(authFile);
}

async function loadCredentials(): Promise<Credentials | null> {
  if (!(await fileExists(credentialsFile))) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(credentialsFile, "utf8"));
    return isCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveCredentials(credentials: Credentials): Promise<void> {
  const credentialsDirectory = dirname(credentialsFile);
  await mkdir(credentialsDirectory, { recursive: true, mode: 0o700 });
  if (credentialsDirectory !== ".") {
    await chmod(credentialsDirectory, 0o700);
  }
  await writeFile(
    credentialsFile,
    `${JSON.stringify(credentials, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(credentialsFile, 0o600);
}

export async function saveAuthState(context: BrowserContext): Promise<void> {
  await mkdir(authDirectory, { recursive: true, mode: 0o700 });
  await chmod(authDirectory, 0o700);
  await context.storageState({ path: authFile });
  await chmod(authFile, 0o600);
}

async function promptSecret(
  terminal: ReadlineInterface,
  prompt: string,
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return terminal.question(prompt);
  }

  terminal.pause();
  output.write(prompt);

  return new Promise<string>((resolve, reject) => {
    let value = "";
    let finished = false;

    const cleanup = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      input.setRawMode(false);
      input.removeListener("data", onData);
      terminal.resume();
      output.write("\n");
    };

    const onData = (chunk: Buffer | string): void => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Credential prompt cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }

        if (character === "\u0008" || character === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }

        value += character;
        output.write("*");
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function promptCredentials(
  terminal: ReadlineInterface,
): Promise<Credentials> {
  const pin = (await terminal.question("Teacher TPIN: ")).trim();
  const password = await promptSecret(terminal, "Teacher password: ");

  if (!pin || !password) {
    throw new Error("Both TPIN and password are required.");
  }

  return { pin, password };
}

function loginErrorText(page: Page): Promise<string> {
  return page
    .locator(
      ".field-validation-error:visible, .validation-summary-errors:visible, .alert-danger:visible",
    )
    .allTextContents()
    .then((messages) => messages.map((message) => message.trim()).filter(Boolean).join(" "));
}

export async function isLoginPage(page: Page): Promise<boolean> {
  if (/\/Teacher\/Account\/Login/i.test(page.url())) {
    return true;
  }

  return (await page.locator("#Username, input[name='Username']").count()) > 0;
}

async function submitLogin(page: Page, credentials: Credentials): Promise<boolean> {
  await page.locator("#Username, input[name='Username']").first().fill(credentials.pin);
  await page.locator("#Password, input[name='Password']").first().fill(credentials.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(300);

  return !(await isLoginPage(page));
}

export async function ensureTeacherAuthenticated(
  page: Page,
  terminal: ReadlineInterface,
  context?: BrowserContext,
): Promise<void> {
  if (!(await isLoginPage(page))) {
    return;
  }

  const saved = await loadCredentials();
  if (saved && (await submitLogin(page, saved))) {
    if (context) {
      await saveAuthState(context);
    }
    return;
  }

  if (saved) {
    console.log("Saved teacher credentials were rejected; please enter them again.");
  }

  const credentials = await promptCredentials(terminal);

  if (!(await submitLogin(page, credentials))) {
    const details = await loginErrorText(page);
    throw new Error(
      details
        ? `Teacher login failed: ${details}`
        : "Teacher login failed. Check the TPIN and password and try again.",
    );
  }

  await saveCredentials(credentials);

  if (context) {
    await saveAuthState(context);
  }
}
