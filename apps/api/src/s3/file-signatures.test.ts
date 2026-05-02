import { describe, expect, it } from "vitest";
import {
  isEbmlSignature,
  isGifSignature,
  isIsoBmffSignature,
  looksLikeGif,
  looksLikeVideo,
} from "./file-signatures";

// Helper: build a Buffer with a known prefix and an arbitrary tail so
// each test mirrors what readObjectHead actually delivers (32 bytes).
function withTail(prefix: number[], length = 32): Buffer {
  const b = Buffer.alloc(length, 0);
  for (let i = 0; i < prefix.length; i++) b[i] = prefix[i];
  return b;
}

const ASCII = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe("isIsoBmffSignature", () => {
  // ISO BMFF: 4-byte big-endian size + "ftyp" at offset 4. Real-world
  // brands include isom (mp4), qt (.mov), avc1, mp42, M4V, etc.
  it("recognizes a real MP4 ftyp box (isom brand)", () => {
    const bytes = withTail([
      0x00, 0x00, 0x00, 0x20, // size = 32
      ...ASCII("ftyp"),
      ...ASCII("isom"),
    ]);
    expect(isIsoBmffSignature(bytes)).toBe(true);
  });

  it("recognizes a QuickTime ftyp box (qt brand)", () => {
    const bytes = withTail([
      0x00, 0x00, 0x00, 0x14,
      ...ASCII("ftyp"),
      ...ASCII("qt  "),
    ]);
    expect(isIsoBmffSignature(bytes)).toBe(true);
  });

  it("ignores non-ftyp first boxes", () => {
    const bytes = withTail([
      0x00, 0x00, 0x00, 0x20,
      ...ASCII("moov"),
    ]);
    expect(isIsoBmffSignature(bytes)).toBe(false);
  });

  it("rejects buffers shorter than 8 bytes", () => {
    expect(isIsoBmffSignature(Buffer.from([0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isIsoBmffSignature(Buffer.alloc(0))).toBe(false);
  });

  it("rejects an EBML header even though it's binary garbage at offset 4", () => {
    const bytes = withTail([0x1a, 0x45, 0xdf, 0xa3]);
    expect(isIsoBmffSignature(bytes)).toBe(false);
  });

  it("rejects a GIF header", () => {
    expect(isIsoBmffSignature(withTail(ASCII("GIF89a")))).toBe(false);
  });
});

describe("isEbmlSignature", () => {
  it("recognizes an EBML header", () => {
    const bytes = withTail([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
    expect(isEbmlSignature(bytes)).toBe(true);
  });

  it("rejects buffers shorter than 4 bytes", () => {
    expect(isEbmlSignature(Buffer.from([0x1a, 0x45]))).toBe(false);
    expect(isEbmlSignature(Buffer.alloc(0))).toBe(false);
  });

  it("rejects buffers whose first byte is wrong", () => {
    expect(isEbmlSignature(withTail([0x1b, 0x45, 0xdf, 0xa3]))).toBe(false);
  });

  it("rejects an MP4 ftyp box", () => {
    const bytes = withTail([0x00, 0x00, 0x00, 0x20, ...ASCII("ftyp"), ...ASCII("isom")]);
    expect(isEbmlSignature(bytes)).toBe(false);
  });
});

describe("isGifSignature", () => {
  it("recognizes GIF87a", () => {
    expect(isGifSignature(withTail(ASCII("GIF87a")))).toBe(true);
  });

  it("recognizes GIF89a", () => {
    expect(isGifSignature(withTail(ASCII("GIF89a")))).toBe(true);
  });

  it("rejects partial / cropped GIF magic", () => {
    expect(isGifSignature(Buffer.from(ASCII("GIF8")))).toBe(false);
  });

  it("rejects an MP4 ftyp box", () => {
    const bytes = withTail([0x00, 0x00, 0x00, 0x20, ...ASCII("ftyp")]);
    expect(isGifSignature(bytes)).toBe(false);
  });

  it("rejects a PNG header (an attacker mislabeling PNG as GIF)", () => {
    // PNG magic: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    const bytes = withTail([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(isGifSignature(bytes)).toBe(false);
  });

  it("rejects an empty buffer", () => {
    expect(isGifSignature(Buffer.alloc(0))).toBe(false);
  });
});

describe("looksLikeVideo + looksLikeGif (composite)", () => {
  it("looksLikeVideo accepts ISO BMFF", () => {
    expect(
      looksLikeVideo(
        withTail([0x00, 0x00, 0x00, 0x20, ...ASCII("ftyp"), ...ASCII("isom")]),
      ),
    ).toBe(true);
  });

  it("looksLikeVideo accepts EBML", () => {
    expect(looksLikeVideo(withTail([0x1a, 0x45, 0xdf, 0xa3]))).toBe(true);
  });

  it("looksLikeVideo refuses a GIF (mismatch with intent)", () => {
    expect(looksLikeVideo(withTail(ASCII("GIF89a")))).toBe(false);
  });

  it("looksLikeVideo refuses arbitrary HTML / text", () => {
    expect(looksLikeVideo(withTail(ASCII("<!DOCTYPE html>")))).toBe(false);
  });

  it("looksLikeGif accepts GIF87a / GIF89a only", () => {
    expect(looksLikeGif(withTail(ASCII("GIF87a")))).toBe(true);
    expect(looksLikeGif(withTail(ASCII("GIF89a")))).toBe(true);
    expect(looksLikeGif(withTail([0x1a, 0x45, 0xdf, 0xa3]))).toBe(false);
  });
});
