"use client";

import { Box, Button, Flex, Heading, TextField, Tooltip } from "@radix-ui/themes";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useUpload, isUploadBusy } from "@/lib/upload-context";
import { useRequireAuth } from "@/lib/auth-required";
import { UploadDialog } from "./UploadDialog";
import { UploadProgressBar } from "./UploadProgressBar";
import { UploadSuccessToast } from "./UploadSuccessToast";
import { UserMenu } from "./UserMenu";

interface TopBarProps {
  signedIn: boolean;
  userName: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
  videoCount: number;
  verified: boolean;
  miniPlayerEnabled: boolean;
}

export function TopBar({
  signedIn,
  userName,
  userEmail,
  avatarUrl,
  videoCount,
  verified,
  miniPlayerEnabled,
}: TopBarProps) {
  const [open, setOpen] = useState(false);
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;
  const uploadDisabled = busy || otherTabBusy;
  const requireAuth = useRequireAuth();

  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Box
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--gray-1)",
        borderBottom: "1px solid var(--gray-4)",
      }}
    >
      <Flex align="center" justify="between" px="4" py="3" gap="3">
        <Link href="/">
          <Heading size="5" style={{ letterSpacing: "-0.02em" }}>
            Denis's videos
          </Heading>
        </Link>
        <Box asChild style={{ flex: 1, maxWidth: 520 }}>
          <form onSubmit={submitSearch} role="search">
            <TextField.Root
              placeholder={
                signedIn
                  ? "Search videos by title or tag"
                  : "Sign in to search"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (!signedIn) requireAuth();
              }}
              aria-label="Search videos"
            />
          </form>
        </Box>
        <Flex align="center" gap="3">
          {signedIn ? (
            <>
              <Tooltip
                content={
                  otherTabBusy
                    ? "Another tab is uploading. Wait for it to finish."
                    : busy
                      ? "Wait for current upload to finish"
                      : "Upload a video"
                }
              >
                <Button
                  size="2"
                  variant="solid"
                  onClick={() => !uploadDisabled && setOpen(true)}
                  disabled={uploadDisabled}
                >
                  Upload
                </Button>
              </Tooltip>
              <UserMenu
                name={userName ?? ""}
                email={userEmail ?? ""}
                avatarUrl={avatarUrl}
                videoCount={videoCount}
                verified={verified}
                miniPlayerEnabled={miniPlayerEnabled}
              />
            </>
          ) : (
            <>
              <Button asChild size="2" variant="soft">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="2" variant="solid">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </Flex>
      </Flex>
      {signedIn && (
        <>
          <UploadProgressBar />
          <UploadDialog open={open} onOpenChange={setOpen} />
          <UploadSuccessToast />
        </>
      )}
    </Box>
  );
}
