"use client";

import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  Popover,
  Switch,
  Text,
} from "@radix-ui/themes";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StarIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { AvatarUploadPane } from "./AvatarUploadPane";
import { AvatarEditPane } from "./AvatarEditPane";

type View = "profile" | "upload" | "edit";

interface Props {
  name: string;
  email: string;
  avatarUrl: string | null;
  videoCount: number;
  verified: boolean;
  miniPlayerEnabled: boolean;
}

export function UserMenu({
  name,
  email,
  avatarUrl,
  videoCount,
  verified,
  miniPlayerEnabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("profile");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAvatarUrl, setLiveAvatarUrl] = useState<string | null>(avatarUrl);

  const router = useRouter();
  const utils = trpc.useUtils();
  const createUpload = trpc.users.createAvatarUpload.useMutation();
  const finalizeUpload = trpc.users.finalizeAvatarUpload.useMutation();

  const paneRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [paneSize, setPaneSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  const setPaneNode = useCallback((node: HTMLDivElement | null) => {
    paneRef.current = node;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setPaneSize({ w: node.scrollWidth, h: node.scrollHeight });
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const target = entry.target as HTMLElement;
      setPaneSize({ w: target.scrollWidth, h: target.scrollHeight });
    });
    ro.observe(node);
    observerRef.current = ro;
  }, []);

  const reset = () => {
    setView("profile");
    setFile(null);
    setError(null);
    setBusy(false);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setPaneSize(null);
    }
  };

  const handleSave = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const created = await createUpload.mutateAsync({
        mimeType: "image/jpeg",
        sizeBytes: blob.size,
      });
      const putRes = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      const finalized = await finalizeUpload.mutateAsync({
        s3Key: created.s3Key,
      });
      setLiveAvatarUrl(finalized.avatarUrl);
      await utils.auth.me.invalidate();
      router.refresh();
      reset();
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const displayAvatar = liveAvatarUrl ?? avatarUrl;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger>
        <button
          aria-label={`User menu for ${name}`}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            borderRadius: 999,
            transition: "transform 120ms ease, box-shadow 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "";
            e.currentTarget.style.boxShadow = "";
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "translateY(1px) scale(0.95)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
        >
          <Avatar
            size="3"
            src={displayAvatar ?? undefined}
            fallback={name.slice(0, 1).toUpperCase()}
            radius="full"
          />
        </button>
      </Popover.Trigger>
      <Popover.Content
        size="2"
        align="end"
        style={{ width: 312, overflow: "hidden" }}
      >
        <div
          className="user-menu-morph"
          style={{
            width: 280,
            height: paneSize ? paneSize.h : "auto",
          }}
        >
          <div ref={setPaneNode} key={view} className="user-menu-pane">
            {view === "profile" && (
              <ProfilePane
                name={name}
                email={email}
                avatarUrl={displayAvatar}
                videoCount={videoCount}
                verified={verified}
                miniPlayerEnabled={miniPlayerEnabled}
                onChangeAvatar={() => setView("upload")}
              />
            )}
            {view === "upload" && (
              <AvatarUploadPane
                onPick={(f) => {
                  setFile(f);
                  setView("edit");
                }}
                onBack={() => setView("profile")}
              />
            )}
            {view === "edit" && file && (
              <AvatarEditPane
                file={file}
                busy={busy}
                errorMessage={error}
                onCancel={() => {
                  if (busy) return;
                  setFile(null);
                  setError(null);
                  setView("upload");
                }}
                onSave={handleSave}
              />
            )}
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

interface ProfilePaneProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  videoCount: number;
  verified: boolean;
  miniPlayerEnabled: boolean;
  onChangeAvatar: () => void;
}

function ProfilePane({
  name,
  email,
  avatarUrl,
  videoCount,
  verified,
  miniPlayerEnabled,
  onChangeAvatar,
}: ProfilePaneProps) {
  const utils = trpc.useUtils();
  // The prop is from a server-rendered layout that doesn't re-fetch on every
  // navigation, so it can drift after a mutation. Treat the client-side
  // `auth.me` query as the source of truth and fall back to the prop only
  // until the query resolves.
  const me = trpc.auth.me.useQuery();
  const liveEnabled = me.data?.miniPlayerEnabled ?? miniPlayerEnabled;
  const [enabled, setEnabled] = useState(liveEnabled);
  useEffect(() => {
    setEnabled(liveEnabled);
  }, [liveEnabled]);

  const setPref = trpc.users.setMiniPlayerPreference.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  return (
    <Flex direction="column" gap="3" style={{ width: 280 }}>
      <Flex gap="3" align="center">
        <button
          type="button"
          onClick={onChangeAvatar}
          aria-label="Change avatar"
          title="Change avatar"
          style={{
            border: 0,
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            borderRadius: 999,
            position: "relative",
          }}
        >
          <Avatar
            size="5"
            src={avatarUrl ?? undefined}
            fallback={name.slice(0, 1).toUpperCase()}
            radius="full"
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "var(--accent-9)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              border: "2px solid var(--gray-1)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            ✎
          </span>
        </button>
        <Box style={{ minWidth: 0 }}>
          <Flex align="center" gap="2">
            <Text as="div" size="3" weight="medium" truncate>
              {name}
            </Text>
            <Badge
              color={verified ? "green" : "amber"}
              variant="soft"
              radius="full"
            >
              {verified ? "Verified" : "Unverified"}
            </Badge>
          </Flex>
          <Text as="div" size="1" color="gray" truncate>
            {email}
          </Text>
        </Box>
      </Flex>
      <Box
        style={{
          height: 1,
          background: "var(--gray-5)",
          margin: "4px 0",
        }}
      />
      <Flex justify="between" align="center" px="1">
        <Text size="2" color="gray">
          Videos uploaded
        </Text>
        <Text size="2" weight="medium">
          {videoCount}
        </Text>
      </Flex>
      <Flex justify="between" align="center" px="1" gap="3">
        <Box style={{ minWidth: 0 }}>
          <Text as="div" size="2" color="gray">
            Mini player
          </Text>
          <Text as="div" size="1" color="gray">
            Show a floating player when leaving a video page.
          </Text>
        </Box>
        <Switch
          checked={enabled}
          disabled={setPref.isPending}
          onCheckedChange={(checked) => {
            const prev = enabled;
            setEnabled(checked);
            setPref.mutate(
              { enabled: checked },
              { onError: () => setEnabled(prev) },
            );
          }}
          aria-label="Toggle mini player"
        />
      </Flex>
      <Box
        style={{
          height: 1,
          background: "var(--gray-5)",
          margin: "4px 0",
        }}
      />
      <Flex direction="column" gap="2">
        <Button asChild variant="soft" color="amber">
          <Link href="/favorites">
            <StarIcon /> Favorites
          </Link>
        </Button>
        <Button variant="soft" onClick={onChangeAvatar}>
          Change avatar
        </Button>
        <Button
          color="gray"
          variant="soft"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </Button>
      </Flex>
    </Flex>
  );
}
