import { serve } from "@hono/node-server"

import { app, browserService } from "@repo/api"

const port = Number.parseInt(process.env.PORT ?? "8787", 10)

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection; keeping server alive:", reason)
})

const server = await browserService.start().then(() =>
  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Tutomation API listening on http://localhost:${info.port}`)
    }
  )
)

const shutdown = async (): Promise<void> => {
  server.close()
  await browserService.close()
  process.exit(0)
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
