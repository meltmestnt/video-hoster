"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import {
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  Cross1Icon,
  PlayIcon,
  RocketIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { ALLOWED_VIDEO_MIME_TYPES } from "@repo/shared";
import { convertToGif } from "@/lib/compress-video";
import { sniffIsVideoFile } from "@/lib/file-signatures";
import { setPendingUpload } from "@/lib/pending-upload";
import { useUploadDialog } from "@/lib/upload-dialog-context";
import { useRequireAuth } from "@/lib/auth-required";
import { useT } from "@/lib/i18n";

type Phase = "idle" | "loading" | "encoding" | "done" | "error";

interface Props {
  signedIn: boolean;
}

const triggerDownload = (blob: Blob, name: string) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
};

const baseStem = (name: string) =>
  name.replace(/\.[^.]+$/, "").trim() || "converted";

/**
 * Hero showpiece for the landing page: drop a video, watch it convert to
 * a GIF entirely in-browser via ffmpeg.wasm, then download or upgrade to
 * a hotlinkable URL by signing in.
 *
 * Anonymous visitors can complete the full conversion flow and walk away
 * with a downloaded .gif — no signup needed. Signing in upgrades the
 * already-converted result into a permanent hosted URL via the same
 * pending-upload IDB stash + One Tap flow used by the global drag overlay.
 */
export function InstantGifDemo({ signedIn }: Props) {
  const t = useT();
  const requireAuth = useRequireAuth();
  const uploadDialog = useUploadDialog();

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Object URL for the rendered GIF preview. Revoked on unmount or when
  // the next conversion starts so we don't leak the previous blob.
  const previewUrl = useMemo(
    () => (resultBlob ? URL.createObjectURL(resultBlob) : null),
    [resultBlob],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = () => {
    setFile(null);
    setPhase("idle");
    setProgress(0);
    setResultBlob(null);
    setResultName(null);
    setError(null);
  };

  const handleFile = async (next: File | null | undefined) => {
    if (!next) return;
    setError(null);
    // Magic-byte check before kicking off ffmpeg — saves ~25 MB of WASM
    // download for an obviously-wrong file.
    const looksLikeVideo = await sniffIsVideoFile(next);
    if (!looksLikeVideo) {
      setError(t("instant.error.notVideo"));
      return;
    }
    setFile(next);
    setResultBlob(null);
    setResultName(null);
    setPhase("loading");
    setProgress(0);
    try {
      const blob = await convertToGif(next, {
        onPhase: (p) => {
          // Map ffmpeg-wrapper phases onto our visual ones. "loading" is
          // the WASM bundle loading and command boot; "transcoding" is
          // the actual conversion which is what users care to see
          // progress on. We surface it as "encoding" in the UI because
          // that's the more recognizable verb for a GIF render.
          if (p === "loading") setPhase("loading");
          else if (p === "transcoding") setPhase("encoding");
        },
        onProgress: (p) => setProgress(p),
      });
      setResultBlob(blob);
      setResultName(`${baseStem(next.name)}.gif`);
      setPhase("done");
      setProgress(1);
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (phase === "loading" || phase === "encoding") return;
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    e.target.value = "";
    void handleFile(next);
  };

  // After conversion, signed-in users go straight to the upload dialog
  // pre-filled with the GIF blob. Signed-out users get the same
  // experience: stash to IDB, fire the auth-required dialog, and the
  // PendingUploadResumer reopens the dialog after sign-in.
  const hostNow = async () => {
    if (!resultBlob || !resultName) return;
    const gifFile = new File([resultBlob], resultName, { type: "image/gif" });
    if (!signedIn) {
      await setPendingUpload("gif", gifFile);
      requireAuth();
      return;
    }
    uploadDialog.openGifUpload(gifFile);
  };

  const isWorking = phase === "loading" || phase === "encoding";
  // Inline labels keep the t() arg literal so the i18n key-completeness
  // check still fires at compile time.
  const phaseLabel =
    phase === "loading"
      ? t("instant.phase.loading")
      : phase === "encoding"
        ? t("instant.phase.encoding")
        : phase === "done"
          ? t("instant.phase.done")
          : phase === "error"
            ? t("instant.phase.error")
            : t("instant.phase.idle");

  return (
    <Box
      // intro-card brings back the conic-gradient crimson highlight that
      // travels around the perimeter — same effect that lived on the old
      // marketing hero. Defined globally in globals.css and respects
      // prefers-reduced-motion.
      className="intro-card"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-5)",
        // Layered hero background: dark base + iris glow top-right + a
        // subtle grid pattern for technical depth. The grid is drawn via
        // CSS gradients so it doesn't ship as an image.
        background:
          "radial-gradient(circle at 100% 0%, rgba(118, 99, 224, 0.32) 0%, transparent 55%), " +
          "radial-gradient(circle at 0% 100%, rgba(118, 99, 224, 0.18) 0%, transparent 50%), " +
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
        border: "1px solid var(--gray-5)",
        padding: "40px 32px",
        marginBottom: 32,
      }}
    >
      <Box
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <Flex
        direction="column"
        gap="2"
        align="start"
        style={{ position: "relative", zIndex: 2 }}
      >
        <Badge
          color="iris"
          variant="surface"
          radius="full"
          style={{ paddingInline: 12 }}
        >
          <RocketIcon width="12" height="12" />
          <Text size="1" weight="medium" ml="1">
            {t("instant.badge")}
          </Text>
        </Badge>
        <Heading
          size="9"
          style={{
            letterSpacing: "-0.035em",
            lineHeight: 1.04,
            maxWidth: 880,
          }}
        >
          {t("instant.headline.before")}{" "}
          <Text
            as="span"
            style={{
              backgroundImage:
                "linear-gradient(120deg, var(--accent-9) 0%, #d6c8ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {t("instant.headline.highlight")}
          </Text>
          {t("instant.headline.after")}
        </Heading>
        <Text
          as="p"
          size="4"
          color="gray"
          mt="2"
          style={{ maxWidth: 640, lineHeight: 1.5 }}
        >
          {t("instant.subtitle")}
        </Text>
      </Flex>

      <Flex
        gap="5"
        mt="6"
        wrap="wrap"
        style={{ position: "relative", zIndex: 2 }}
      >
        {/* Left column — the dropzone / progress / preview pane */}
        <Box
          style={{
            flex: "1 1 360px",
            minWidth: 0,
          }}
        >
          <Box
            role="button"
            tabIndex={0}
            onClick={() => {
              if (isWorking) return;
              if (phase === "done") return;
              inputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              if (isWorking || phase === "done") return;
              e.preventDefault();
              inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (isWorking) return;
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              position: "relative",
              borderRadius: "var(--radius-4)",
              border: `2px dashed ${
                dragging ? "var(--accent-9)" : "var(--gray-7)"
              }`,
              background: dragging ? "var(--accent-3)" : "var(--gray-2)",
              minHeight: 280,
              padding: 20,
              transition:
                "border-color 160ms ease, background 160ms ease, transform 160ms ease",
              cursor: isWorking || phase === "done" ? "default" : "pointer",
              outline: "none",
            }}
          >
            {phase === "idle" && !file && (
              <Flex
                direction="column"
                align="center"
                justify="center"
                gap="3"
                style={{ minHeight: 240 }}
              >
                <Box
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: "var(--accent-4)",
                    color: "var(--accent-11)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 0 6px rgba(118, 99, 224, 0.08)",
                  }}
                >
                  <UploadIcon width="22" height="22" />
                </Box>
                <Text size="3" weight="medium">
                  {t("instant.dropzone.title")}
                </Text>
                <Text size="2" color="gray" align="center">
                  {t("instant.dropzone.subtitle")}
                </Text>
                <Flex gap="2" wrap="wrap" justify="center">
                  <Badge color="gray" variant="soft">
                    .mp4
                  </Badge>
                  <Badge color="gray" variant="soft">
                    .mov
                  </Badge>
                  <Badge color="gray" variant="soft">
                    .webm
                  </Badge>
                  <Badge color="gray" variant="soft">
                    .mkv
                  </Badge>
                </Flex>
              </Flex>
            )}

            {(phase === "loading" || phase === "encoding") && (
              <Flex
                direction="column"
                gap="3"
                style={{ minHeight: 240 }}
                justify="center"
                align="stretch"
              >
                <Flex justify="between" align="center" gap="2">
                  <Badge color="iris" variant="solid" radius="full">
                    {phaseLabel}
                  </Badge>
                  <Text size="2" color="gray">
                    {Math.round(progress * 100)}%
                  </Text>
                </Flex>
                <Box
                  style={{
                    height: 10,
                    background: "var(--gray-4)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    style={{
                      width: `${Math.max(4, Math.round(progress * 100))}%`,
                      height: "100%",
                      background:
                        "linear-gradient(90deg, var(--accent-9), #cbb8ff)",
                      transition: "width 200ms ease",
                    }}
                  />
                </Box>
                <Text size="1" color="gray" align="center">
                  {t("instant.progress.hint")}
                </Text>
              </Flex>
            )}

            {phase === "done" && previewUrl && (
              <Flex direction="column" gap="3">
                <Box
                  style={{
                    background: "black",
                    borderRadius: "var(--radius-3)",
                    overflow: "hidden",
                    aspectRatio: "16 / 9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                </Box>
                <Flex justify="between" align="center" gap="2" wrap="wrap">
                  <Flex gap="2" align="center">
                    <Badge color="green" variant="soft">
                      <CheckIcon /> {t("instant.phase.done")}
                    </Badge>
                    {resultBlob && (
                      <Text size="1" color="gray">
                        {(resultBlob.size / 1024 ** 2).toFixed(2)} MB
                      </Text>
                    )}
                  </Flex>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label={t("common.reset")}
                    onClick={reset}
                  >
                    <Cross1Icon />
                  </IconButton>
                </Flex>
              </Flex>
            )}

            {phase === "error" && (
              <Flex
                direction="column"
                gap="2"
                align="center"
                justify="center"
                style={{ minHeight: 240 }}
              >
                <Text color="red" size="2">
                  {error ?? t("instant.phase.error")}
                </Text>
                <Button variant="soft" color="gray" onClick={reset}>
                  {t("common.reset")}
                </Button>
              </Flex>
            )}

            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_VIDEO_MIME_TYPES.join(",")}
              onChange={onPick}
              style={{ display: "none" }}
            />
          </Box>

          {phase === "done" && resultBlob && resultName && (
            <Flex gap="2" mt="3" wrap="wrap">
              <Button
                size="3"
                variant="solid"
                onClick={() => triggerDownload(resultBlob, resultName)}
              >
                <DownloadIcon /> {t("instant.action.download")}
              </Button>
              <Button
                size="3"
                variant="soft"
                color="iris"
                onClick={hostNow}
              >
                <PlayIcon /> {t("instant.action.host")}
              </Button>
            </Flex>
          )}
        </Box>

        {/* Right column — three-step pitch with connector arrows. Renders
            inline as the visual story of what happens behind the scenes. */}
        <Box style={{ flex: "1 1 320px", minWidth: 0 }}>
          <Flex direction="column" gap="3">
            <Step
              n={1}
              titleKey="instant.step1.title"
              bodyKey="instant.step1.body"
              active={phase === "idle"}
              done={phase !== "idle"}
            />
            <ArrowDown />
            <Step
              n={2}
              titleKey="instant.step2.title"
              bodyKey="instant.step2.body"
              active={isWorking}
              done={phase === "done"}
            />
            <ArrowDown />
            <Step
              n={3}
              titleKey="instant.step3.title"
              bodyKey="instant.step3.body"
              active={phase === "done"}
              done={false}
            />
          </Flex>

          <Flex
            mt="5"
            gap="2"
            align="center"
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-3)",
              background: "rgba(118, 99, 224, 0.08)",
              border: "1px solid rgba(118, 99, 224, 0.24)",
            }}
          >
            <ArrowRightIcon color="var(--accent-11)" />
            <Text size="2" color="gray">
              {t("instant.privacy")}
            </Text>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
}

function Step({
  n,
  titleKey,
  bodyKey,
  active,
  done,
}: {
  n: number;
  titleKey:
    | "instant.step1.title"
    | "instant.step2.title"
    | "instant.step3.title";
  bodyKey:
    | "instant.step1.body"
    | "instant.step2.body"
    | "instant.step3.body";
  active: boolean;
  done: boolean;
}) {
  const t = useT();
  return (
    <Flex
      gap="3"
      align="start"
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-3)",
        border: `1px solid ${
          active
            ? "var(--accent-7)"
            : done
              ? "var(--green-6)"
              : "var(--gray-5)"
        }`,
        background: active
          ? "var(--accent-3)"
          : done
            ? "var(--green-2)"
            : "var(--gray-2)",
        transition:
          "border-color 200ms ease, background 200ms ease",
      }}
    >
      <Box
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 13,
          background: done
            ? "var(--green-9)"
            : active
              ? "var(--accent-9)"
              : "var(--gray-5)",
          color: "white",
        }}
      >
        {done ? <CheckIcon width="14" height="14" /> : n}
      </Box>
      <Box style={{ minWidth: 0 }}>
        <Text size="3" weight="medium" as="div">
          {t(titleKey)}
        </Text>
        <Text size="2" color="gray" as="div" style={{ marginTop: 2 }}>
          {t(bodyKey)}
        </Text>
      </Box>
    </Flex>
  );
}

function ArrowDown() {
  return (
    <Flex justify="center" style={{ height: 16 }}>
      <Box
        aria-hidden
        style={{
          width: 2,
          height: "100%",
          background:
            "linear-gradient(180deg, var(--gray-6), transparent)",
        }}
      />
    </Flex>
  );
}
