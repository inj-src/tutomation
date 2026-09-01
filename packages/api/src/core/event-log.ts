type EventFields = Record<string, unknown>

function errorFields(error: unknown): EventFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    }
  }

  return { errorMessage: String(error) }
}

export function logEvent(event: string, fields: EventFields = {}): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    })
  )
}

export function logError(
  event: string,
  error: unknown,
  fields: EventFields = {}
): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields,
      ...errorFields(error),
    })
  )
}
