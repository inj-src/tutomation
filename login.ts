import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium } from "playwright";

import { authFile, ensureTeacherAuthenticated, saveAuthState } from "./auth.js";

const loginUrl = process.env.LOGIN_URL ?? "https://teacher.udvash-unmesh.com/";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

const terminal = createInterface({ input, output });
try {
  await ensureTeacherAuthenticated(page, terminal, context);
  await saveAuthState(context);
  console.log(`Saved Playwright session to ${authFile}`);
} finally {
  terminal.close();
  await browser.close();
}
