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
import { compressTo480p } from "@/lib/compress-video";
import { trackEvent } from "@/lib/analytics";

type Phase = "idle" | "loading" | "encoding" | "done" | "error";

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

const isGifFile = (file: File) =>
  file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");

export function GifToMp4Tool() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<number>(0);
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
    setSourceSize(0);
    setError(null);
  };

  const handleFile = async (next: File | null | undefined) => {
    if (!next) return;
    setError(null);
    if (!isGifFile(next)) {
      setError("That doesn't look like a GIF. Drop a .gif file.");
      return;
    }
    setFile(next);
    setSourceSize(next.size);
    setResultBlob(null);
    setResultName(null);
    setPhase("loading");
    setProgress(0);
    trackEvent("Tool GifMp4 Started");
    try {
      const blob = await compressTo480p(next, {
        noAudio: true,
        onPhase: (p) => {
          if (p === "loading") setPhase("loading");
          else if (p === "transcoding") setPhase("encoding");
        },
        onProgress: (p) => setProgress(p),
      });
      setResultBlob(blob);
      setResultName(`${baseStem(next.name)}.mp4`);
      setPhase("done");
      setProgress(1);
      trackEvent("Tool GifMp4 Done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
      trackEvent("Tool GifMp4 Failed", {
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
      ? "Loading ffmpeg"
      : phase === "encoding"
        ? "Encoding MP4"
        : phase === "done"
          ? "Done"
          : phase === "error"
            ? "Something went wrong"
            : "Drop a GIF";

  const sizeReduction =
    resultBlob && sourceSize > 0
      ? Math.max(0, Math.round((1 - resultBlob.size / sourceSize) * 100))
      : 0;

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
            ffmpeg in your browser · no upload
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
          GIF to MP4 converter,{" "}
          <Text as="span" className="tool-headline-grad">
            free and instant
          </Text>
        </Heading>
        <Text
          as="p"
          size="4"
          color="gray"
          mt="2"
          style={{ maxWidth: 680, lineHeight: 1.5 }}
        >
          Drop a GIF, get an MP4 — typically 5–20× smaller and far smoother on
          mobile. Conversion runs entirely in your browser; the file never
          leaves your machine.
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
                  Drop a .gif here or click to pick
                </Text>
                <Text size="2" color="gray" align="center">
                  Up to ~50 MB works smoothly. Your file stays on this device.
                </Text>
                <Flex gap="2" wrap="wrap" justify="center">
                  <Badge color="gray" variant="soft">
                    .gif
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
                  Encoding entirely in your browser — feel free to keep
                  scrolling.
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
                  <video
                    src={previewUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
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
                      <CheckIcon /> MP4 ready
                    </Badge>
                    {resultBlob && (
                      <Text size="1" color="gray">
                        {(resultBlob.size / 1024 ** 2).toFixed(2)} MB
                      </Text>
                    )}
                    {sizeReduction > 0 && (
                      <Badge color="iris" variant="soft">
                        {sizeReduction}% smaller
                      </Badge>
                    )}
                  </Flex>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="Reset"
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
                  {error ?? "Something went wrong."}
                </Text>
                <Button variant="soft" color="gray" onClick={reset}>
                  Reset
                </Button>
              </Flex>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/gif,.gif"
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
                  trackEvent("Tool GifMp4 Download");
                  triggerDownload(resultBlob, resultName);
                }}
              >
                <DownloadIcon /> Download MP4
              </Button>
              <Button size="3" variant="soft" color="gray" onClick={reset}>
                Convert another
              </Button>
            </Flex>
          )}
        </Box>

        <Box style={{ flex: "1 1 320px", minWidth: 0 }}>
          <Flex direction="column" gap="3">
            <Step
              n={1}
              title="Drop your GIF"
              body="Click the dropzone or drag a .gif from your desktop. Files are read locally — nothing is uploaded."
              active={phase === "idle"}
              done={phase !== "idle"}
            />
            <ArrowDown />
            <Step
              n={2}
              title="Encode in your browser"
              body="ffmpeg.wasm runs the H.264 transcode on this tab. First conversion downloads ~25 MB of WASM; subsequent ones are instant."
              active={isWorking}
              done={phase === "done"}
            />
            <ArrowDown />
            <Step
              n={3}
              title="Download the MP4"
              body="Save the file or play it inline. The MP4 is silent (GIFs have no audio) and 480p H.264 — plays everywhere."
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
            <Text size="2" color="gray">
              <strong>100% local.</strong> The GIF never leaves your machine —
              the entire encode runs in this tab via ffmpeg.wasm.
            </Text>
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
