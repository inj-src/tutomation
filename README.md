# Tutomation

Local, human-in-the-loop handwritten-script evaluation for the Udvash teacher
portal.

## Workspace

- `apps/server` runs the Hono Node server and owns one persistent headless
  Playwright session.
- `apps/web` is the TanStack Router/Vite review workspace with Excalidraw.
- `apps/cli` provides login and agent-oriented evaluation commands. It calls
  the shared Hono app directly through typed RPC; it does not make HTTP calls.
- `packages/api` contains the Hono routes, scraper, Luna evaluator, and image
  renderer.

## Local setup

```bash
pnpm install
pnpm exec playwright install chromium
pnpm login
pnpm dev
```

The web app runs at `http://localhost:3000`; the Hono server runs at
`http://localhost:8787`. Login credentials and Playwright state are stored in
the Git-ignored `.auth/` directory. The server prompts only through the CLI,
so run `pnpm login` once before opening the web app.

To run the agent-oriented CLI evaluator:

```bash
pnpm evaluate
```

The CLI prints the generated score, annotated image path, and token usage. The
web submit action is intentionally a successful local no-op in this MVP.

## Checks

```bash
pnpm typecheck
pnpm build
```

AI grading keeps the original student image dimensions in the review surface,
while the API retains the canonical longest-edge `800px` supersampling step
for model perception and annotation rendering.
