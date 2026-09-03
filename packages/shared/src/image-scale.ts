export const CANONICAL_LONG_EDGE = 800

export type ImageSize = {
  width: number
  height: number
}

export type CanonicalImageSize = ImageSize & {
  scale: number
}

export function canonicalImageSize(
  width: number,
  height: number
): CanonicalImageSize {
  const scale = CANONICAL_LONG_EDGE / Math.max(width, height)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}
