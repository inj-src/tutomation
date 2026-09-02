import sharp from "sharp";
import type { Response as PlaywrightResponse } from "playwright";

export type DownloadedImage = {
  bytes: Buffer;
  width: number;
  height: number;
};

export function isStudentScriptImage(response: PlaywrightResponse): boolean {
  const url = new URL(response.url());
  return (
    response.ok() &&
    url.hostname === "ums-public-saq.s3-ap-southeast-1.amazonaws.com" &&
    url.pathname.startsWith("/StudentSaqExamImage/")
  );
}

export async function downloadedStudentImage(
  responses: PlaywrightResponse[],
): Promise<DownloadedImage> {
  const unique = [...new Map(responses.map((value) => [value.url(), value])).values()];
  const images = (
    await Promise.all(
      unique.map(async (response) => {
        try {
          const bytes = await response.body();
          const metadata = await sharp(bytes).metadata();
          if (!metadata.width || !metadata.height) return undefined;
          return {
            bytes,
            width: metadata.width,
            height: metadata.height,
            url: response.url(),
          };
        } catch {
          return undefined;
        }
      }),
    )
  ).filter((value) => value !== undefined);

  const largest = images.sort(
    (left, right) => right.width * right.height - left.width * left.height,
  )[0];
  if (!largest) {
    throw new Error("No StudentSaqExamImage response was captured from the evaluation page.");
  }
  return largest;
}
