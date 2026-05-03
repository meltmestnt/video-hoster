/**
 * Server-side magic-byte sniffer. Mirrors apps/web/lib/file-signatures.ts —
 * we sniff a fresh copy of the bytes at finalize time because the Content-Type
 * a presigned PUT was signed for is just a label; the bytes are what
 * actually get served.
 *
 * Read 32 bytes off the head of the object via S3 Range and compare against
 * the small set of containers we accept.
 */

const enc = new TextEncoder();
const FTYP = enc.encode("ftyp");
const GIF87A = enc.encode("GIF87a");
const GIF89A = enc.encode("GIF89a");
const EBML = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);
const RIFF = enc.encode("RIFF");
const WAVE = enc.encode("WAVE");
const WEBP = enc.encode("WEBP");
const OGG_S = enc.encode("OggS");
const ID3 = enc.encode("ID3");
const PNG_MAGIC = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function startsAt(bytes: Buffer, offset: number, sig: Uint8Array): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** ISO BMFF: a 4-byte big-endian box length followed by "ftyp" at offset 4.
 *  Covers MP4, MOV, M4A, 3GP, etc. */
export function isIsoBmffSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 4, FTYP);
}

/** EBML — used by both WebM and Matroska (.mkv). */
export function isEbmlSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 0, EBML);
}

export function isGifSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 0, GIF87A) || startsAt(bytes, 0, GIF89A);
}

/** True when the header looks like a video container we accept. */
export function looksLikeVideo(bytes: Buffer): boolean {
  return isIsoBmffSignature(bytes) || isEbmlSignature(bytes);
}

/** True when the header is a GIF87a/89a magic. */
export function looksLikeGif(bytes: Buffer): boolean {
  return isGifSignature(bytes);
}

/** PNG: 8-byte fixed signature at offset 0. */
export function isPngSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 0, PNG_MAGIC);
}

/** JPEG: SOI marker FF D8 FF at offset 0. The fourth byte varies by
 *  encoder (E0, E1, DB, EE, …) so we only check the first three. */
export function isJpegSignature(bytes: Buffer): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

/** WebP: RIFF container with "WEBP" at offset 8. */
export function isWebpSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 0, RIFF) && startsAt(bytes, 8, WEBP);
}

/** True for any of the screenshot image types we accept (JPEG/PNG/WebP). */
export function looksLikeScreenshotImage(
  bytes: Buffer,
  mime: string,
): boolean {
  if (mime === "image/jpeg") return isJpegSignature(bytes);
  if (mime === "image/png") return isPngSignature(bytes);
  if (mime === "image/webp") return isWebpSignature(bytes);
  return false;
}

/** WAV: RIFF container with "WAVE" at offset 8. */
export function isWavSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 0, RIFF) && startsAt(bytes, 8, WAVE);
}

/** Ogg (Vorbis/Opus/etc.): "OggS" at offset 0. */
export function isOggSignature(bytes: Buffer): boolean {
  return startsAt(bytes, 0, OGG_S);
}

/** MP3: either an ID3v2 tag ("ID3" at offset 0) or a raw MPEG audio
 *  frame sync word — first byte 0xFF, next byte 0xE0 mask all set
 *  with valid layer + version bits. We allow the common Layer III
 *  variants (FB/FA/F3/F2/F1/F0/E3/E2 …); broadly: byte[1] & 0xE0 ===
 *  0xE0 with at least the layer bits set is enough to reject
 *  garbage. */
export function isMp3Signature(bytes: Buffer): boolean {
  if (startsAt(bytes, 0, ID3)) return true;
  if (bytes.length < 2) return false;
  if (bytes[0] !== 0xff) return false;
  // The 11-bit MPEG sync word is FF E/F at the byte level — the upper
  // 3 bits of the second byte must be set, with valid layer bits.
  return (bytes[1] & 0xe0) === 0xe0;
}

/** True for any audio container we accept. The Content-Type carried
 *  by the upload is used to pick which signature is required: if the
 *  client claimed mp3, we don't accept a wav header (and vice versa). */
export function looksLikeAudio(bytes: Buffer, mime: string): boolean {
  switch (mime) {
    case "audio/mpeg":
      return isMp3Signature(bytes);
    case "audio/mp4":
    case "audio/aac":
      // ADTS-encapsulated AAC has its own sync word but most browsers
      // export AAC inside an MP4 container; accept both.
      return isIsoBmffSignature(bytes) || isMp3Signature(bytes);
    case "audio/wav":
    case "audio/x-wav":
      return isWavSignature(bytes);
    case "audio/ogg":
      return isOggSignature(bytes);
    case "audio/webm":
      return isEbmlSignature(bytes);
    default:
      return false;
  }
}
