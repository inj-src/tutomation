# Tutomation

Local, human-in-the-loop handwritten-script evaluation for the Udvash teacher
portal.

## Workspace

- `apps/server` runs the Hono Node server and owns one persistent headless
  Playwright session.
- `apps/web` is the TanStack Router/Vite review workspace with Excalidraw.
- `packages/api` contains the Hono routes, scraper, and Luna evaluator.

## Local setup

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

The web app runs at `http://localhost:3000`; the Hono server runs at
`http://localhost:8787`. Login credentials and Playwright state are stored in
the Git-ignored `.auth/` directory. Authenticate through the API login endpoint
before using the web app.

The web submit action is intentionally a successful local no-op in this MVP.

## Checks

```bash
pnpm typecheck
pnpm build
```

AI grading keeps the original student image dimensions in the review surface,
while the API retains the canonical longest-edge `800px` supersampling step
for model perception and annotation rendering.
