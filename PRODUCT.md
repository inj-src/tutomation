# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

pnpm Turbo monorepo with strict TypeScript; TanStack Router and Vite for the web app; Hono for the API; Playwright for browser automation; Excalidraw for the review editor.

## Users

Teachers evaluating handwritten student scripts on the teacher.udvash-unmesh.com website. A teacher uses the local workstation UI to inspect, correct, and approve marks.

## Product Purpose

Tutomation captures pending handwritten scripts and their question/sample-answer context, asks Luna for a grading proposal, and gives a teacher an editable visual review surface before submission. Success means a teacher can select a script category, open an entry, generate useful marks, adjust them in Excalidraw, and complete the no-op submit flow without losing context when the source website changes.

## Positioning

The product combines live Playwright scraping with an editable, human-in-the-loop grading canvas, keeping the teacher as the final authority over every annotation and score.

## Operating Context

The tool runs locally on a teacher workstation. The Hono server owns one headless persistent Playwright session and scrapes the source website on every request. The CLI calls the shared Hono app directly for login and agent-oriented workflows. The web app presents category selection, script entries, the student canvas, and question/sample-answer references.

## Capabilities and Constraints

- The repository is organized as `apps/server`, `apps/web`, `apps/cli`, and `packages/api`.
- The server automatically restores saved Playwright authentication and can prompt through the CLI when credentials are needed.
- Category and entry data are live and may disappear or change between requests; errors must be visible and recoverable.
- AI evaluation returns scores, annotations, comments, and Excalidraw-compatible visual data.
- The teacher can edit AI output in the base Excalidraw editor with infinity-canvas mode disabled.
- The submit endpoint is intentionally a successful no-op for this MVP and must not submit to the source website.
- Student images retain their original dimensions in final output while the existing canonical longest-edge `800px` supersampling workflow is retained.
- Hono RPC and TanStack Query are the network/data-management boundary for the web client.
- shadcn components are the only UI component system for the web app.

## Evidence on Hand

The existing local Playwright scraper, persisted authentication files, Luna evaluator, Excalidraw-style renderer, and captured run images in the repository are the implementation evidence. The attached UI sketch defines the intended two-page workflow. No production deployment, multi-user authentication, or live submission behavior is required for this build.

## Product Principles

- Keep the teacher in control of every generated mark.
- Treat the source website as live, fallible, and authoritative for current availability.
- Make recovery from stale or disappearing scripts explicit.
- Preserve original student evidence while improving working-scale perception and rendering.
- Keep local setup and agent/CLI workflows direct and inspectable.
