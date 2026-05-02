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
});
export type ListFolderGifsInput = z.infer<typeof listFolderGifsInputSchema>;

// Pass `null` to clear the active folder, or a UUID to set it.
export const setActiveFolderInputSchema = z.object({
  folderId: z.string().uuid().nullable(),
});
export type SetActiveFolderInput = z.infer<typeof setActiveFolderInputSchema>;
