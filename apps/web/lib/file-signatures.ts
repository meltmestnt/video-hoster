/**
 * Magic-byte sniffing for uploaded media files. The accept= attribute on
 * <input type="file"> is a hint, the MIME type a File object reports is
 * filled in by the OS (and is wrong or empty surprisingly often), and the
 * filename extension is trivially spoofable. The bytes are not.
 *
 * We read just enough of the file header (32 bytes) to identify the
 * container and reject anything that isn't one of the formats this site
 * accepts. Sniffing runs entirely in the browser — no upload is started
 * for a file that fails this check.
 */

const HEADER_BYTES = 32;

async function readHeader(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, HEADER_BYTES);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

function bytesAt(
  bytes: Uint8Array,
  offset: number,
  ascii: string,
): boolean {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/** ISO BMFF (MP4, MOV, M4A, …) carries an "ftyp" box at offset 4 with a
 *  4-byte length prefix. Don't validate the brand — Quicktime, ISO, MS
 *  variants all start identically and we accept them all. */
function isIsoBmff(bytes: Uint8Array): boolean {
  return bytesAt(bytes, 4, "ftyp");
}

/** EBML header used by both WebM and Matroska. */
function isEbml(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
}

function isGif(bytes: Uint8Array): boolean {
  // "GIF87a" or "GIF89a" — six ASCII bytes at the very start.
  return bytesAt(bytes, 0, "GIF87a") || bytesAt(bytes, 0, "GIF89a");
}

export async function sniffIsVideoFile(file: File): Promise<boolean> {
  try {
    const bytes = await readHeader(file);
    return isIsoBmff(bytes) || isEbml(bytes);
  } catch {
    return false;
  }
}

export async function sniffIsGifFile(file: File): Promise<boolean> {
  try {
    const bytes = await readHeader(file);
    return isGif(bytes);
  } catch {
    return false;
  }
}

/**
 * Returns the kind we can confirm from the bytes alone. Used by the
 * drag-and-drop overlay so a file dropped under the wrong page (a GIF
 * dropped on /videos) is routed to the right dialog regardless of its
 * filename.
 */
export async function sniffFileKind(
  file: File,
): Promise<"video" | "gif" | null> {
  const bytes = await readHeader(file).catch(() => new Uint8Array());
  if (isGif(bytes)) return "gif";
  if (isIsoBmff(bytes) || isEbml(bytes)) return "video";
  return null;
}
