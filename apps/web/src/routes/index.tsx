import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowRight, RefreshCw, ScanLine } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { getCategories } from "../lib/api"

export const Route = createFileRoute("/")({ component: CategoryPage })

function CategoryPage() {
  const navigate = useNavigate()
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  })
  const categoryList = categories.data ?? []

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            <ScanLine className="size-4 text-primary" />
            Tutomation
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose a script queue
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Live categories from the teacher portal. Pick a queue to review its
            pending scripts.
          </p>
        </div>
        <Button
          aria-label="Reload script categories"
          variant="outline"
          size="icon"
          onClick={() => void categories.refetch()}
          disabled={categories.isFetching}
        >
          <RefreshCw
            className={categories.isFetching ? "size-4 animate-spin" : "size-4"}
          />
        </Button>
      </header>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>Available categories</CardTitle>
          <CardDescription>
            Each category is scraped again when you open it.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {categories.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : categories.isError ? (
            <div className="p-6">
              <p className="text-sm font-medium">
                Could not load the teacher portal.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {categories.error.message}
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => void categories.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : categoryList.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No pending script categories are available right now.
            </div>
          ) : (
            <div className="divide-y">
              {categoryList.map((category) => (
                <button
                  className="group flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  key={category.examId}
                  onClick={() =>
                    void navigate({
                      to: "/category/$examId",
                      params: { examId: category.examId },
                    })
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {category.examName}
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {category.program} · {category.course}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge variant="secondary">
                      {category.pending} pending
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
