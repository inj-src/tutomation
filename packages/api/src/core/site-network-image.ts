import sharp from "sharp"
import type { Response as PlaywrightResponse } from "playwright"

export type DownloadedImage = {
  bytes: Buffer
  width: number
  height: number
}

export function isPotentialImage(response: PlaywrightResponse): boolean {
  const resourceType = response.request().resourceType()
  const contentType = response.headers()["content-type"]?.toLowerCase() ?? ""
  return (
    response.ok() &&
    (["image", "xhr", "fetch"].includes(resourceType) ||
      contentType.startsWith("image/"))
  )
}

export async function largestDownloadedImage(
  responses: PlaywrightResponse[]
): Promise<DownloadedImage> {
  const unique = [
    ...new Map(responses.map((value) => [value.url(), value])).values(),
  ]
  const images = (
    await Promise.all(
      unique.map(async (response) => {
        try {
          const bytes = await response.body()
          const metadata = await sharp(bytes).metadata()
          if (!metadata.width || !metadata.height) return undefined
          return {
            bytes,
            width: metadata.width,
            height: metadata.height,
            url: response.url(),
          }
        } catch {
          return undefined
        }
      })
    )
  ).filter((value) => value !== undefined)

  const largest = images
    .filter((image) => image.width >= 100 && image.height >= 100)
    .sort(
      (left, right) => right.width * right.height - left.width * left.height
    )[0]
  if (!largest) {
    const observed = images
      .map((image) => `${image.width}×${image.height} ${image.url}`)
      .join(", ")
    throw new Error(
      `No downloaded student-script image was found. Observed: ${observed || "none"}`
    )
  }
  return largest
}
