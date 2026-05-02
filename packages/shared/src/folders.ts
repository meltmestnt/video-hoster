import { z } from "zod";

// 80 matches the column length on the Folder entity. Keeping the cap
// here too gives the client schema-driven inline validation, instead of
// only finding out something is too long after the round-trip.
export const FOLDER_NAME_MAX_LEN = 80;

export const folderIdInputSchema = z.object({
  folderId: z.string().uuid(),
});
export type FolderIdInput = z.infer<typeof folderIdInputSchema>;

export const createFolderInputSchema = z.object({
  name: z.string().trim().min(1).max(FOLDER_NAME_MAX_LEN),
});
export type CreateFolderInput = z.infer<typeof createFolderInputSchema>;

export const renameFolderInputSchema = z.object({
  folderId: z.string().uuid(),
  name: z.string().trim().min(1).max(FOLDER_NAME_MAX_LEN),
});
export type RenameFolderInput = z.infer<typeof renameFolderInputSchema>;

export const folderGifInputSchema = z.object({
  folderId: z.string().uuid(),
  gifId: z.string().uuid(),
});
export type FolderGifInput = z.infer<typeof folderGifInputSchema>;

export const listFolderGifsInputSchema = z.object({
  folderId: z.string().uuid(),
  cursor: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(100).default(20),
  // Optional title/tag substring filter applied INSIDE the folder.
  // Either or both may be set; both are joined with AND on the server.
  // Empty strings are treated as "not set" so a cleared search input
  // doesn't reach the API as a literal "%%" pattern.
  q: z.string().trim().max(80).optional().nullable(),
  tag: z.string().trim().max(80).optional().nullable(),
});
export type ListFolderGifsInput = z.infer<typeof listFolderGifsInputSchema>;

// Returns the most-used tags within a folder so the UI can render a
// chip row of one-tap filters. Capped server-side to keep the row
// from running off-screen on a folder with hundreds of unique tags.
export const listFolderTagsInputSchema = z.object({
  folderId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListFolderTagsInput = z.infer<typeof listFolderTagsInputSchema>;

// Folder-scoped "similar to this gif" — uses the same tag-overlap
// ranking as the global suggested feed but restricts candidates to the
// folder. Limit caps the result; default is small because this surfaces
// inline in the folder grid, not on a dedicated page.
export const folderSuggestedInputSchema = z.object({
  folderId: z.string().uuid(),
  gifId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(24),
});
export type FolderSuggestedInput = z.infer<typeof folderSuggestedInputSchema>;

// Pass `null` to clear the active folder, or a UUID to set it.
export const setActiveFolderInputSchema = z.object({
  folderId: z.string().uuid().nullable(),
});
export type SetActiveFolderInput = z.infer<typeof setActiveFolderInputSchema>;

// Share a folder with another user looked up by handle (email or
// exact name match). Cap is generous — names can be longer than emails.
export const shareFolderInputSchema = z.object({
  folderId: z.string().uuid(),
  recipientHandle: z.string().trim().min(1).max(254),
});
export type ShareFolderInput = z.infer<typeof shareFolderInputSchema>;

export const unshareFolderInputSchema = z.object({
  folderId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
});
export type UnshareFolderInput = z.infer<typeof unshareFolderInputSchema>;

export const adminListFoldersInputSchema = z.object({
  cursor: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(80).optional().nullable(),
});
export type AdminListFoldersInput = z.infer<typeof adminListFoldersInputSchema>;
