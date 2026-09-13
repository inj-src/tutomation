import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = resolve(packageDirectory, "../..")
const runtimePath =
  process.env.LITERT_RUNTIME ??
  resolve(repositoryRoot, ".litert-lm/venv/bin/litert-lm")
const host = process.env.LITERT_HOST ?? "127.0.0.1"
const port = process.env.LITERT_PORT ?? "9379"
const baseUrl = process.env.LITERT_BASE_URL ?? `http://${host}:${port}/v1`
const modelsUrl = new URL("models", `${baseUrl.replace(/\/+$/, "")}/`)

async function serverIsRunning() {
  try {
    const response = await fetch(modelsUrl, {
      signal: AbortSignal.timeout(1_000),
    })
    return response.ok
  } catch {
    return false
  }
}

function waitForSignal() {
  return new Promise((resolveWait) => {
    const heartbeat = setInterval(() => {}, 60_000)
    const finish = () => resolveWait()
    const finishAndClear = () => {
      clearInterval(heartbeat)
      finish()
    }
    process.once("SIGINT", finishAndClear)
    process.once("SIGTERM", finishAndClear)
    process.once("SIGHUP", finishAndClear)
  })
}

async function run() {
  if (await serverIsRunning()) {
    console.log(`Reusing existing LiteRT-LM server at ${modelsUrl.origin}`)
    await waitForSignal()
    return 0
  }

  try {
    await access(runtimePath, constants.X_OK)
  } catch {
    console.error(`LiteRT-LM executable was not found at ${runtimePath}`)
    console.error("Install it with: python3 -m pip install litert-lm==0.17.0")
    return 1
  }

  const child = spawn(runtimePath, ["serve", "--host", host, "--port", port], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  })

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
      console.error("LiteRT-LM failed to start:", error)
      resolveExit(1)
    })
    child.once("exit", (code, signal) => {
      if (signal && !shuttingDown) {
        console.error(`LiteRT-LM exited after signal ${signal}`)
        resolveExit(1)
        return
      }
      resolveExit(code ?? 0)
    })
  })
}

process.exitCode = await run()
