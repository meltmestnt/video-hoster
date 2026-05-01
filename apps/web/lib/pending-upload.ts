/**
 * IndexedDB-backed slot for "the file the user dropped while signed out."
 *
 * sessionStorage / localStorage can only hold strings, so a real File
 * object survives a page reload only via IDB (or service-worker cache).
 * One slot is plenty — if a second drop overwrites the first, that's
 * what the user just intended.
 *
 * The store is created lazily; we never hand out the raw IDB instance
 * because callers always want one of the three operations below.
 */

const DB_NAME = "vidsandgifs";
const STORE_NAME = "pending-upload";
const KEY = "current";
// Files older than this are silently dropped on read — guards against
// "I dropped a video three weeks ago" zombie entries that would
// confuse the user the next time they log in.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingUploadKind = "video" | "gif";

export interface PendingUpload {
  kind: PendingUploadKind;
  file: File;
  /** When the drop happened — milliseconds since epoch. */
  storedAt: number;
}

interface StoredRecord {
  kind: PendingUploadKind;
  file: File;
  storedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    // No IDB (Safari private mode, etc.) — feature degrades to "drop
    // while signed in only," which is fine.
    return undefined;
  }
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    tx.oncomplete = () => {
      db.close();
      resolve(req?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IDB transaction failed"));
    };
  });
}

export async function setPendingUpload(
  kind: PendingUploadKind,
  file: File,
): Promise<void> {
  const record: StoredRecord = { kind, file, storedAt: Date.now() };
  await withStore("readwrite", (store) => store.put(record, KEY));
}

export async function getPendingUpload(): Promise<PendingUpload | null> {
  const record = (await withStore<StoredRecord>("readonly", (store) =>
    store.get(KEY),
  )) as StoredRecord | undefined;
  if (!record) return null;
  if (Date.now() - record.storedAt > MAX_AGE_MS) {
    // Stale — drop it and pretend it wasn't there.
    await clearPendingUpload();
    return null;
  }
  return record;
}

export async function clearPendingUpload(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(KEY));
}

/** Classify a dropped File by type. Returns null for unsupported kinds. */
export function classifyDroppedFile(file: File): PendingUploadKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "image/gif") return "gif";
  // Fall back on the extension when the OS didn't set a MIME type.
  const lower = file.name.toLowerCase();
  if (/\.(mp4|mov|webm|mkv)$/.test(lower)) return "video";
  if (/\.gif$/.test(lower)) return "gif";
  return null;
}
