import { hc, type ClientRequestOptions } from "hono/client"

import type { AppType } from "./index.js"

export function createApiClient(
  baseUrl: string,
  options?: ClientRequestOptions
) {
  return hc<AppType>(baseUrl, options)
}
