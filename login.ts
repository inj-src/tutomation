import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium } from "playwright";

const loginUrl = process.env.LOGIN_URL ?? "https://teacher.udvash-unmesh.com/";
const authDirectory = ".auth";
const authFile = `${authDirectory}/state.json`;

await mkdir(authDirectory, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

const terminal = createInterface({ input, output });
await terminal.question(
  "Log in in the browser, then press Enter here to save the session...\n",
);
terminal.close();

await context.storageState({ path: authFile });
await browser.close();

console.log(`Saved Playwright session to ${authFile}`);
