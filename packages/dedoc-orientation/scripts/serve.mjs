import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(packageDirectory, "../..")
const runtimePath =
  process.env.DEDOC_ORIENTATION_RUNTIME ??
  resolve(repositoryRoot, ".dedoc-orientation/venv/bin/python")
const workerPath = resolve(packageDirectory, "worker.py")
const modelPath =
  process.env.DEDOC_ORIENTATION_MODEL ??
  "/home/inj-src/.dedoc-orientation/models/scan_orientation_efficient_net_b0.pth"
const host = process.env.DEDOC_ORIENTATION_HOST ?? "127.0.0.1"
const port = process.env.DEDOC_ORIENTATION_PORT ?? "9380"
const healthUrl = `http://${host}:${port}/health`

async function serverIsRunning() {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1_000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function run() {
  if (await serverIsRunning()) {
    console.log(`Reusing existing Dedoc orientation server at ${healthUrl}`)
    await new Promise(() => {})
    return 0
  }

  for (const [label, path] of [
    ["Python runtime", runtimePath],
    ["Dedoc checkpoint", modelPath],
  ]) {
    try {
      await access(
        path,
        label === "Python runtime" ? constants.X_OK : constants.R_OK
      )
    } catch {
      console.error(`${label} was not found at ${path}`)
      return 1
    }
  }

  const child = spawn(
    runtimePath,
    [workerPath, "--host", host, "--port", port, "--model", modelPath],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    }
  )

  let shuttingDown = false
  const forwardSignal = () => {
    if (shuttingDown) return
    shuttingDown = true
    if (child.exitCode === null) child.kill("SIGTERM")
  }
  process.once("SIGINT", forwardSignal)
  process.once("SIGTERM", forwardSignal)
  process.once("SIGHUP", forwardSignal)

  return new Promise((resolveExit) => {
    child.once("error", (error) => {
      console.error("Dedoc orientation service failed to start:", error)
      resolveExit(1)
    })
    child.once("exit", (code, signal) => {
      if (signal && !shuttingDown) {
        console.error(`Dedoc orientation service exited after signal ${signal}`)
        resolveExit(1)
        return
      }
      resolveExit(code ?? 0)
    })
  })
}

process.exitCode = await run()
