import { readFile } from "node:fs/promises"

import sharp from "sharp"

import { canonicalImageSize, type ImageSize } from "./image-scale.js"

export type EvaluationContent =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: "image/png"; data: URL }

export type PreparedScriptPage = {
  imageIndex: number
  original: ImageSize
  canonical: ReturnType<typeof canonicalImageSize>
  image: URL
}

function imageUrl(bytes: Uint8Array): URL {
  return new URL(
    `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
  )
}

export async function fileImage(path: string): Promise<URL> {
  return imageUrl(await readFile(path))
}

export async function prepareScriptPages(
  paths: Array<{ imageIndex: number; studentScriptPath: string }>
): Promise<PreparedScriptPage[]> {
  if (paths.length === 0) {
    throw new Error("The captured script contains no images.")
  }
  return Promise.all(
    paths.map(async ({ imageIndex, studentScriptPath }) => {
      const bytes = await readFile(studentScriptPath)
      const metadata = await sharp(bytes).metadata()
      if (!metadata.width || !metadata.height) {
        throw new Error(`Could not read image dimensions: ${studentScriptPath}`)
      }
      const original = { width: metadata.width, height: metadata.height }
      const canonical = canonicalImageSize(original.width, original.height)
      const resized = await sharp(bytes)
        .resize(canonical.width, canonical.height, {
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        })
        .png()
        .toBuffer()
      return { imageIndex, original, canonical, image: imageUrl(resized) }
    })
  )
}

export function pageContent(pages: PreparedScriptPage[]): EvaluationContent[] {
  return pages.flatMap((page) => [
    {
      type: "text" as const,
      text: `Student script image ${page.imageIndex + 1} of ${pages.length}; imageIndex ${page.imageIndex}; dimensions ${page.canonical.width}×${page.canonical.height} pixels.`,
    },
    {
      type: "file" as const,
      mediaType: "image/png" as const,
      data: page.image,
    },
  ])
}
