import { serve } from "@hono/node-server"

import { app, browserService } from "@repo/api"

const port = Number.parseInt(process.env.PORT ?? "8787", 10)

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Tutomation API listening on http://localhost:${info.port}`)
  }
)

const shutdown = async (): Promise<void> => {
  await browserService.close()
  process.exit(0)
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
