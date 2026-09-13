import sharp from "sharp"
import type { APIRequestContext } from "playwright"

export type DownloadedImage = {
  bytes: Buffer
  width: number
  height: number
}

export function isStudentScriptImageUrl(value: string): boolean {
  const url = new URL(value)
  const isSaq =
    url.hostname === "ums-public-saq.s3-ap-southeast-1.amazonaws.com" &&
    url.pathname.startsWith("/StudentSaqExamImage/")
  const isOnlineWritten =
    url.hostname ===
      "ums-public-online-written.s3-ap-southeast-1.amazonaws.com" &&
    url.pathname.startsWith("/StudentOnlineWrittenExamImage/")
  return isSaq || isOnlineWritten
}

export async function downloadStudentImages(
  request: APIRequestContext,
  orderedUrls: string[]
): Promise<DownloadedImage[]> {
  if (orderedUrls.length === 0) {
    throw new Error(
      "No student-script image URLs were found on the evaluation page."
    )
  }
  if (orderedUrls.some((url) => !isStudentScriptImageUrl(url))) {
    throw new Error(
      "The evaluation page contained an unsupported script image URL."
    )
  }

  return Promise.all(
    orderedUrls.map(async (url) => {
      const response = await request.get(url, { timeout: 30_000 })
      if (!response.ok()) {
        throw new Error(
          `Student-script image request failed with status ${response.status()}.`
        )
      }
      const bytes = await response.body()
      const metadata = await sharp(bytes).metadata()
      if (!metadata.width || !metadata.height) {
        throw new Error("Could not read a student-script image's dimensions.")
      }
      return { bytes, width: metadata.width, height: metadata.height }
    })
  )
}
