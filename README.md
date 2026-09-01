# Tutomation

## Log in and save a Playwright session

```bash
pnpm install
pnpm exec playwright install chromium
pnpm run login
```

The command opens the teacher website. If the login page is shown, it asks for the
TPIN and password in the terminal, submits the form, and saves both the authenticated
browser state and the credentials for future local runs. Password input is masked on
interactive terminals.

Credentials are stored in `.auth/credentials.json`, which is Git-ignored and restricted
to the current user. This is a local convenience file containing a password-equivalent;
delete it if you no longer want automatic login.

To use a different login URL:

```bash
LOGIN_URL="https://teacher.udvash-unmesh.com/Teacher/Account/Login" pnpm run login
```

The `.auth` directory is ignored by Git because it contains your authenticated
session.

Run the TypeScript check with:

```bash
pnpm run typecheck
```

## Test Codex OAuth and GPT-5.6 Luna

Run the local two-request probe with an image:

```bash
pnpm run ai:probe -- ./path/to/image.png
```

The probe uses `gpt-5.6-luna` by default. Set `MODEL_ID` to test another model.
It verifies image input, AI SDK structured output, `store: false`, and a
script-only follow-up using the OAuth provider's local response state.

The probe also sends a stable `promptCacheKey` and prints token usage. Cache hits
are provider-dependent and are not required for the local continuation flow.

## Annotation coordinates

The evaluator returns integer pixel coordinates relative to the student-script
image, with `(0, 0)` at the top-left. Circles use `center: [x, y]` and `radius`,
underlines use `start` and `end`, ticks use `points`, and boxes use pixel `x`,
`y`, `width`, and `height` values.

The evaluator also returns `questionScores`, one entry per distinguishable
answerable question or sub-question. Each entry contains the earned `score`,
its `maxScore`, and an `x`/`y` anchor at the left edge and vertical center of
the corresponding answer. The rendered image places the earned mark beside
that answer and left-pads one-character integer marks (`1` becomes `01`). The
overall score remains in `evaluation.json`; it is not drawn as a fixed badge on
the script image.
