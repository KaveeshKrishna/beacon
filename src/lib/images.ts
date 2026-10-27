import "server-only";

import sharp, { type OutputInfo } from "sharp";

import { ApiError } from "@/lib/api";

/**
 * Photos arrive from an unauthenticated-if-compromised phone and are later
 * rendered by a signed-in browser. Treat every upload as hostile: decode it in
 * a sandbox with a hard pixel budget, bake in the EXIF orientation, downscale,
 * and re-encode. Re-encoding discards EXIF (including GPS), ICC payloads and
 * any polyglot content hidden after the JPEG trailer.
 */
const MAX_INPUT_PIXELS = 36_000_000; // 36 MP: above current phone sensors.
const MAX_OUTPUT_DIMENSION = 1920;
const OUTPUT_QUALITY = 80;
export const MAX_STORED_PHOTO_BYTES = 1_500_000;

export type SanitizedPhoto = {
  data: Buffer;
  width: number;
  height: number;
};

export async function sanitizeJpeg(input: Buffer): Promise<SanitizedPhoto> {
  let result: { data: Buffer; info: OutputInfo };
  try {
    result = await sharp(input, {
      // Reject truncated or structurally invalid JPEGs instead of rendering a
      // partially decoded image.
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    })
      // Applies the EXIF orientation to the pixels; sharp does not copy the
      // EXIF block to the output unless withMetadata() is called.
      .rotate()
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: OUTPUT_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ApiError(
      415,
      "unsupported_photo",
      "The photo could not be decoded as a JPEG.",
    );
  }

  if (
    !Number.isInteger(result.info.width) ||
    !Number.isInteger(result.info.height) ||
    result.info.width < 1 ||
    result.info.height < 1
  ) {
    throw new ApiError(415, "unsupported_photo", "The photo has no pixels.");
  }

  if (result.data.length > MAX_STORED_PHOTO_BYTES) {
    throw new ApiError(
      422,
      "photo_too_large",
      "The photo is too large after processing.",
    );
  }

  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
  };
}
