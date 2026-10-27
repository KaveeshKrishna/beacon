import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { sanitizeJpeg } from "@/lib/images";

async function sampleJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 210, g: 70, b: 30 },
    },
  })
    .withExif({
      IFD0: {
        Copyright: "owner@example.test",
        Software: "Beacon test",
      },
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("photo sanitisation", () => {
  it("re-encodes JPEGs and strips EXIF metadata", async () => {
    const input = await sampleJpeg();
    const inputMetadata = await sharp(input).metadata();
    expect(inputMetadata.exif).toBeDefined();

    const output = await sanitizeJpeg(input);
    expect(output.data.length).toBeGreaterThan(0);
    expect(output.width).toBe(640);
    expect(output.height).toBe(480);

    const outputMetadata = await sharp(output.data).metadata();
    expect(outputMetadata.format).toBe("jpeg");
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
  });

  it("downscales oversized dimensions without cropping", async () => {
    const input = await sharp({
      create: {
        width: 4000,
        height: 2000,
        channels: 3,
        background: "#101010",
      },
    })
      .jpeg()
      .toBuffer();

    const output = await sanitizeJpeg(input);
    expect(output.width).toBe(1920);
    expect(output.height).toBe(960);
  });

  it("rejects bytes that are not a decodable JPEG", async () => {
    await expect(sanitizeJpeg(Buffer.from("not a jpeg"))).rejects.toMatchObject({
      status: 415,
    });
  });
});
