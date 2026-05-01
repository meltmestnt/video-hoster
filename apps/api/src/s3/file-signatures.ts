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
