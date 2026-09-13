# Tutomation Architecture

Tutomation is a local, human-in-the-loop handwritten-script evaluation tool for
the Udvash teacher portal. The source website remains authoritative: categories,
entries, running evaluations, question/reference content, and student images are
scraped live.

## Repository layout

```text
apps/
  server/       Hono Node adapter entry point
  web/          TanStack Router + Vite teacher workspace
  cli/          login and agent-oriented evaluator
packages/
  api/          Hono routes, Playwright scraper, AI evaluator, renderer
  shared/       browser-safe URL and image-scale helpers
  ui/           shadcn component source and shared styles
```

The root uses pnpm workspaces and Turborepo. Package tasks own their own
build, typecheck, lint, and format commands; the root delegates to
`turbo run`. Internal packages use `workspace:*`.

Important boundaries:

- `@repo/api` is the server/domain package. It exports the Hono app type,
  routes, domain types, and the RPC client factory.
- `@repo/shared` contains helpers safe for Vite/browser use, such as
  `candidateEvaluationUrl` and `canonicalImageSize`.
- `@workspace/ui` contains the installed shadcn components.
- The web app calls Hono through `hc<AppType>` and `parseResponse`; it does not maintain a generic untyped fetch wrapper.
- The CLI uses the same Hono app and typed RPC client with a local fetch
  adapter. It does not make network HTTP calls.

## Runtime topology

```text
Teacher browser
      |
      v
apps/web  -- typed Hono RPC -->  packages/api  <-- direct typed RPC -- apps/cli
                                      |
                                      v
                              apps/server / Hono Node adapter
                                      |
                                      v
                    one warm Chromium + authenticated BrowserContext
                                      |
                         one disposable Page per operation
                                      |
                              teacher.udvash-unmesh.com
```

The server owns one persistent Playwright browser and authenticated context.
Each category read, entry read, capture, and Exit operation creates a fresh
page and closes it in `finally`. This prevents a page navigating for one
request from corrupting another request while retaining warm Chromium startup
and cookies.

Authentication is persisted in the Git-ignored `.auth/` directory. The CLI
login command saves credentials and browser storage state. If a request lands
on the login page, the context authenticates once and waiting requests retry
their original URL.

The server has no category, entry, capture, or reference cache. The only
intentional server memory is the AI evaluator state:

- category key -> `CategoryEvaluator`
- the evaluator's previous AI response ID
- prompt-cache metadata used by the AI provider

The server logs request IDs, failures, and AI lifecycle events, and contains
unhandled promise rejections without taking down the local server.

## Request flow

### Categories and entries

Every request scrapes the portal with Playwright locators:

1. Navigate to the script index.
2. Parse category rows and sort by descending pending count.
3. For an entry request, navigate to that category's details page.
4. Parse the `.btnStartEvaluation` data attributes.
5. Sort entries by descending pending count.

The stable entry identity is:

```text
examId ~ courseId ~ subjectId ~ uniqueSet
  ~ uniqueSetQuestionSerial ~ questionVersion
```

`pendingQuestion` identifies a currently available student script, but it is
not part of the stable entry identity. This distinction is required because a
student script can disappear while the question entry remains available.

### Capture

A capture:

1. Re-scrapes the category and entry to avoid trusting stale client data.
2. Checks Udvash's running-evaluation endpoint.
3. If another stable entry is running, returns HTTP 409
   `RUNNING_EVALUATION` with the normalized running identity.
4. Navigates directly to the requested evaluation URL.
5. Verifies the hidden evaluation fields so a sticky redirect is detected.
6. Reads every ordered script-image URL from the portal carousel metadata.
7. Downloads all script images concurrently through Playwright's authenticated
   request context, without clicking through the carousel, and saves raw bytes.
8. Post-capture normalizes EXIF, classifies orientation with warm PaddleOCR, and
   writes corrected PNGs with Sharp.
9. Captures the question and sample answer together from the question `<thead>`.
10. Saves metadata, logs `image.orientation.completed`, and returns ordered page data URLs plus a persisted `captureId`.
11. Evaluation reuses that handle from disk; an expired handle returns `CAPTURE_EXPIRED` without recapturing the portal.

If the student script disappears between listing and navigation, capture retries
the same stable entry once. A fresh scrape can then provide its next pending
student script. If the stable entry itself is gone, the API returns
`ENTRY_STALE`.

### Student-image safety

The script image is not guessed from an arbitrary image on the page. Network
capture accepts only successful responses from the known Udvash storage hosts
and paths:

- `ums-public-saq.s3-ap-southeast-1.amazonaws.com/StudentSaqExamImage/`
- `ums-public-online-written.s3-ap-southeast-1.amazonaws.com/StudentOnlineWrittenExamImage/`

Every `questionImage_N[data-url]` slide is sorted by the portal's `ImageOrder`.
Those exact URLs are downloaded concurrently. EXIF orientation is normalized
with Sharp; a warm local PaddleOCR worker classifies all pages and Sharp applies
90/180/270 degree corrections before AI, canvas, and submission. The server
never guesses from arbitrary page images or clicks next/previous to discover
later pages.

### Question and sample answer

The reliable reference capture sequence is:

1. Locate the visible `#SampleAns` button.
2. Find its nearest `<thead>`.
3. Wait for visible question content, images, MathJax, and fonts.
4. Click the sample-answer button.
5. Wait for the answer content to render.
6. Screenshot the same `<thead>` as one reference image.

The question and sample answer are intentionally not captured as unrelated
crops. A prior split-capture approach produced blank questions and clipped
sample answers. The table header and button are part of the captured reference.

## Running evaluation and sticky-session rules

Udvash keeps a running evaluation at the teacher-account level. It is not safe
to assume that the URL alone identifies the displayed script. The observed
protocol is in [check_running_fetch.js](check_running_fetch.js),
[check_running_fetch_response.jsonl](check_running_fetch_response.jsonl), and
[exit_fetch.js](exit_fetch.js).

The running check is a POST to:

```text
/Teacher/SaqEvaluation/CheckForRunningSaqOnlineWrittenExamEvaluation
```

The response's nested DTO supplies the stable six-field identity. It also
contains `StudentScriptType`, which determines the Online Written versus SAQ
evaluation URL.

Automatic exit was removed. Silently calling
`RemoveCurrentRunningOnlineWrittenExamEvaluation` during navigation caused
long delays, wrong scripts, and accidental lock release. A redirect is now a
conflict, not permission to mutate the account:

- **Show running** opens the running evaluation target.
- **Open this** performs the explicit Exit flow, then retries the requested
  capture.
- **Exit** in the workspace explicitly releases the current evaluation.

The explicit Exit flow opens the running evaluation page, serializes its actual
hidden form fields (including the antiforgery token), sets
`FormSubmitText=Exit`, POSTs the form action, and verifies that the running
check returns no session. It follows the real request in
[exit_fetch.js](exit_fetch.js), rather than relying on a UI dialog that often
does not trigger.

There is no automatic release when changing entries. This protects another
teacher's lock and makes the teacher's action explicit.

## Web application behavior

The two routes are:

- `/`: scrape and choose a category.
- `/category/$examId?entry=...`: evaluate entries in that category.

The active entry is always represented in the URL. TanStack Query manages
request lifetimes and the entry list polls every 15 seconds while the page is
visible.

Polling rules:

- Only a successful entry response can change the queue.
- A network/server error never means “the queue is empty”.
- If the selected entry still exists, keep it selected even when its pending
  count changes.
- If the selected entry disappears, navigate to the category's highest-pending
  entry and show a toast.
- If the category becomes empty, return to the category page and show a toast.
- If a capture reports `ENTRY_STALE`, refresh the entry list so the same
  transition rules apply.

The page uses shadcn Sidebar/SidebarInset, Resizable panels, Card, Button,
Skeleton, Dialog, and Sonner notifications. The right reference image is keyed
by the active entry and opens in a dialog.

Submission is intentionally a successful local no-op in the MVP. When real
submission is enabled, the portal should assign the next pending student
script. The web app must then invalidate the current capture and entry queries
and let Udvash provide the next script; it must not calculate or store a local
“next” item.

## Excalidraw review surface

The student image is an HTML image underneath a transparent Excalidraw layer.
The image is not an editable Excalidraw image element:

- the image has `pointer-events: none` and `draggable=false`;
- the Excalidraw scene contains only teacher/AI marks;
- the image and canvas use the same exact width/height and aspect ratio;
- the wrapper has no content padding;
- the canvas is sized to the image plus any explicit extra bottom space.

The default Excalidraw menus, library, sidebars, bottom zoom controls, help
button, and unwanted tools are hidden. The teacher-facing controls are a small
external shadcn toolbar: selection, rectangle, oval, arrow, line, freehand,
text, eraser, plus 100px extension and removal.

Canvas navigation is constrained by the finite image-sized surface. Wheel,
middle-button, and navigation keyboard shortcuts are blocked at the wrapper.
AI and teacher marks remain editable, but the locked background image cannot be
moved or resized.

Multi-page scripts keep one independent Excalidraw scene per image. The
previous/next controls switch images in portal order, saving the current scene
before another page mounts. AI output contains one page object per zero-based
`imageIndex`; each page's coordinates are scaled back against that image's own
original dimensions. All ordered student images are sent to the model together,
while the question/sample-answer reference remains bounded to the category AI
session.

### Coordinates and supersampling

The model receives a canonical image whose longest edge is 800px. This improves
small-script perception and keeps model coordinates bounded. The final
evaluation coordinates are converted back to the original student-image
dimensions before the web scene is created.

Never mix canonical coordinates with original-image coordinates. Doing so makes
marks disproportionately large on very small source images or misplaced on
normal images.

AI annotations are bounded to image dimensions. Ovals are limited to a small
fraction of the image, and long mistakes use straight underlines. Score lines
use two endpoints with Excalidraw roughness; they are not generated from a
bent multi-point path. Comments use `commentAt` only when there is safe blank
space, so text does not cover handwriting or marks. `commentAt` is the
placement of a text comment; it is not a second score or annotation mark.
The default annotation color is red and the intentional roughness is retained
for a handwritten appearance.

## Failure modes and recovery

| Symptom | Cause | Correct behavior |
| --- | --- | --- |
| Requests take 15–30 seconds behind one capture | A global promise queue serialized all browser work | Fresh page per request; warm context only |
| Every entry shows the same script | Account-level running evaluation/sticky page | Check running DTO; conflict or explicit Exit |
| Dialog never appears | Portal's client dialog is unreliable | Use the observed running POST and explicit form Exit |
| Wrong image sent to AI | Captured an arbitrary page image | Allowlist the exact S3 host/path |
| Rotated page or annotations | Display used metadata/original pixels | Normalize EXIF, classify orientation, then use corrected pixels everywhere |
| Blank question or clipped answer | Separate/unstable DOM crops | Click `#SampleAns`; screenshot its `<thead>` |
| AI marks are huge on tiny scripts | Coordinates stayed in 800px space | Restore coordinates to original dimensions |
| Marks drift outside image | Canvas and image had different geometry/padding | Use one exact image-sized coordinate surface |
| Selected item vanishes during polling | Empty/error response was treated as authoritative | Act only on successful list data |
| Reference panel shows the previous entry | Reference content was not keyed by the active entry | Remount/reference-query by the selected entry ID |
| Vite cannot resolve an API helper | Browser imported a non-exported/deep server module | Put browser-safe helpers in `@repo/shared`; use type-only API imports |
| Hono client lost types | A hand-written generic request wrapper hid route types | Use `hc<AppType>` and `parseResponse` |
| Server becomes unresponsive after an error | Rejected work was not contained/logged | Hono `onError`, request logging, rejection logging, and page cleanup |
| Files become unmaintainable | Route/components grew beyond the project limit | Keep source files under 300 lines and extract focused components/hooks |

## Development rules

- Use pnpm; do not use the `latest` keyword for new dependencies.
- Let pnpm update `pnpm-lock.yaml`; never hand-edit the lockfile.
- Keep credentials, storage state, and captured private data out of commits.
- Preserve the evidence files when investigating portal behavior.
- Validate with `pnpm typecheck`, `pnpm lint`, `pnpm build`, and focused tests.
- Static checks do not prove a live Udvash transition, account lock, login, submission, or browser rendering path. Exercise those manually only when releasing or intentionally testing the portal integration.
