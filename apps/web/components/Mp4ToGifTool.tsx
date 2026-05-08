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
  CheckIcon,
  DownloadIcon,
  Cross1Icon,
  RocketIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { ALLOWED_VIDEO_MIME_TYPES } from "@repo/shared";
import { convertToGif } from "@/lib/compress-video";
import { sniffIsVideoFile } from "@/lib/file-signatures";
import { trackEvent } from "@/lib/analytics";

type Phase = "idle" | "loading" | "encoding" | "done" | "error";

export interface Mp4ToGifStrings {
  badge: string;
  headlineBefore: string;
  headlineHighlight: string;
  subtitle: string;
  dropzoneTitle: string;
  dropzoneSubtitle: string;
  notVideoError: string;
  phaseLoading: string;
  phaseEncoding: string;
  phaseDone: string;
  phaseError: string;
  phaseIdle: string;
  encodingHint: string;
  resultBadge: string;
  reset: string;
  errorGeneric: string;
  download: string;
  convertAnother: string;
  step1Title: string;
  step1Body: string;
  step2Title: string;
  step2Body: string;
  step3Title: string;
  step3Body: string;
  localCallout: string;
  previewAlt: string;
}

interface Props {
  strings: Mp4ToGifStrings;
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

export function Mp4ToGifTool({ strings }: Props) {
  const s = strings;
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    const looksLikeVideo = await sniffIsVideoFile(next);
    if (!looksLikeVideo) {
      setError(s.notVideoError);
      return;
    }
    setFile(next);
    setResultBlob(null);
    setResultName(null);
    setPhase("loading");
    setProgress(0);
    trackEvent("Tool Mp4Gif Started", { sourceMime: next.type || "unknown" });
    try {
      const blob = await convertToGif(next, {
        onPhase: (p) => {
          if (p === "loading") setPhase("loading");
          else if (p === "transcoding") setPhase("encoding");
        },
        onProgress: (p) => setProgress(p),
      });
      setResultBlob(blob);
      setResultName(`${baseStem(next.name)}.gif`);
      setPhase("done");
      setProgress(1);
      trackEvent("Tool Mp4Gif Done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
      trackEvent("Tool Mp4Gif Failed", {
        message: ((err as Error).message ?? "unknown").slice(0, 80),
      });
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

  const isWorking = phase === "loading" || phase === "encoding";
  const phaseLabel =
    phase === "loading"
      ? s.phaseLoading
      : phase === "encoding"
        ? s.phaseEncoding
        : phase === "done"
          ? s.phaseDone
          : phase === "error"
            ? s.phaseError
            : s.phaseIdle;

  return (
    <Box
      className="intro-card"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-5)",
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
            {s.badge}
          </Text>
        </Badge>
        <Heading
          as="h1"
          size="9"
          className="tool-headline"
          style={{
            letterSpacing: "-0.035em",
            lineHeight: 1.04,
            maxWidth: 900,
          }}
        >
          {s.headlineBefore}{" "}
          <Text as="span" className="tool-headline-grad">
            {s.headlineHighlight}
          </Text>
        </Heading>
        <Text
          as="p"
          size="4"
          color="gray"
          mt="2"
          style={{ maxWidth: 680, lineHeight: 1.5 }}
        >
          {s.subtitle}
        </Text>
      </Flex>

      <Flex
        gap="5"
        mt="6"
        wrap="wrap"
        style={{ position: "relative", zIndex: 2 }}
      >
        <Box style={{ flex: "1 1 360px", minWidth: 0 }}>
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
                  {s.dropzoneTitle}
                </Text>
                <Text size="2" color="gray" align="center">
                  {s.dropzoneSubtitle}
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
                  {s.encodingHint}
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
                    alt={s.previewAlt}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                </Box>
                <Flex justify="between" align="center" gap="2" wrap="wrap">
                  <Flex gap="2" align="center" wrap="wrap">
                    <Badge color="green" variant="soft">
                      <CheckIcon /> {s.resultBadge}
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
                    aria-label={s.reset}
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
                  {error ?? s.errorGeneric}
                </Text>
                <Button variant="soft" color="gray" onClick={reset}>
                  {s.reset}
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
                onClick={() => {
                  trackEvent("Tool Mp4Gif Download");
                  triggerDownload(resultBlob, resultName);
                }}
              >
                <DownloadIcon /> {s.download}
              </Button>
              <Button size="3" variant="soft" color="gray" onClick={reset}>
                {s.convertAnother}
              </Button>
            </Flex>
          )}
        </Box>

        <Box style={{ flex: "1 1 320px", minWidth: 0 }}>
          <Flex direction="column" gap="3">
            <Step
              n={1}
              title={s.step1Title}
              body={s.step1Body}
              active={phase === "idle"}
              done={phase !== "idle"}
            />
            <ArrowDown />
            <Step
              n={2}
              title={s.step2Title}
              body={s.step2Body}
              active={isWorking}
              done={phase === "done"}
            />
            <ArrowDown />
            <Step
              n={3}
              title={s.step3Title}
              body={s.step3Body}
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
            <Text
              size="2"
              color="gray"
              dangerouslySetInnerHTML={{ __html: s.localCallout }}
            />
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
}

function Step({
  n,
  title,
  body,
  active,
  done,
}: {
  n: number;
  title: string;
  body: string;
  active: boolean;
  done: boolean;
}) {
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
        transition: "border-color 200ms ease, background 200ms ease",
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
          {title}
        </Text>
        <Text size="2" color="gray" as="div" style={{ marginTop: 2 }}>
          {body}
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
          background: "linear-gradient(180deg, var(--gray-6), transparent)",
        }}
      />
    </Flex>
  );
}
