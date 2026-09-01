import { createRootRoute, Outlet } from "@tanstack/react-router"
import type { ReactNode } from "react"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Tutomation | Script evaluation" },
    ],
  }),
  component: RootLayout,
  notFoundComponent: () => (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          This page does not exist.
        </p>
      </div>
    </main>
  ),
})

function RootLayout(): ReactNode {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <Outlet />
    </div>
  )
}
