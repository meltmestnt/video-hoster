"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  Flex,
  IconButton,
  SegmentedControl,
  Slider,
  Text,
} from "@radix-ui/themes";
import {
  PauseIcon,
  PlayIcon,
  ResetIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import {
  convertToGif,
  extract,
  type CropAspect,
  type EditOptions,
  type Rotation,
} from "@/lib/compress-video";
import { DownloadIcon } from "@radix-ui/react-icons";
import { Callout } from "@radix-ui/themes";
import {
  MAX_GIF_BYTES,
  MAX_GIF_DURATION_SECONDS,
} from "@repo/shared";

export type EditorOutput =
  | { kind: "video"; edit: EditOptions }
  | { kind: "gif"; blob: Blob; durationSeconds: number };

interface Props {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onApply: (output: EditorOutput) => void;
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const CROP_ASPECTS: { value: CropAspect; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" },
];

function format(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoEditorDialog({ open, file, onCancel, onApply }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const [duration, setDuration] = useState(0);
  const [sourceW, setSourceW] = useState(0);
  const [sourceH, setSourceH] = useState(0);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [cropAspect, setCropAspect] = useState<CropAspect>("original");
  const [zoom, setZoom] = useState(1);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [extractBusy, setExtractBusy] = useState<null | "audio" | "video">(
    null,
  );
  const [extractError, setExtractError] = useState<string | null>(null);

  const [outputKind, setOutputKind] = useState<"video" | "gif">("video");
  const [gifBusy, setGifBusy] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [gifError, setGifError] = useState<string | null>(null);

  const [playbackRate, setPlaybackRate] = useState(1);

  // Reset on file/open change.
  useEffect(() => {
    if (!open) return;
    setRotation(0);
    setCropAspect("original");
    setZoom(1);
    setTrimStart(0);
    setTrimEnd(0);
    setCurrentTime(0);
    setPlaying(false);
    setOutputKind("video");
    setGifError(null);
    setGifProgress(0);
    setPlaybackRate(1);
  }, [open, file]);

  // Live preview of speed: drive the <video> element's playbackRate.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // For GIFs the API caps duration at 20s — auto-clamp the trim window when
  // the user switches to gif mode so they can see the limit immediately.
  useEffect(() => {
    if (outputKind !== "gif") return;
    if (trimEnd - trimStart > MAX_GIF_DURATION_SECONDS) {
      setTrimEnd(
        Math.min(duration, trimStart + MAX_GIF_DURATION_SECONDS),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputKind]);

  // Cleanup object URL.
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setTrimEnd(v.duration);
    setSourceW(v.videoWidth);
    setSourceH(v.videoHeight);
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    // Loop playback within the trim window.
    if (v.currentTime > trimEnd) {
      v.currentTime = trimStart;
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trimStart || v.currentTime > trimEnd) {
        v.currentTime = trimStart;
      }
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
  };

  const cycleRotation = () => {
    const idx = ROTATIONS.indexOf(rotation);
    setRotation(ROTATIONS[(idx + 1) % ROTATIONS.length]);
  };

  // CSS preview crop window: aspect ratio only. Zoom is applied as a
  // transform on the video itself so it doesn't fight a width change here
  // (which would race the transform's transition and pulse visually).
  const previewBoxStyle = useMemo<React.CSSProperties>(() => {
    if (!sourceW || !sourceH) return {};
    let aspect = sourceW / sourceH;
    if (cropAspect !== "original") {
      const [a, b] = cropAspect.split(":").map(Number);
      aspect = a / b;
    }
    return {
      aspectRatio: `${aspect}`,
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
    };
  }, [sourceW, sourceH, cropAspect]);

  const buildEditOptions = (): EditOptions => ({
    trimStart: trimStart > 0 ? trimStart : undefined,
    trimEnd: trimEnd < duration ? trimEnd : undefined,
    rotation,
    cropAspect,
    zoom,
    playbackRate: playbackRate !== 1 ? playbackRate : undefined,
    sourceWidth: sourceW || undefined,
    sourceHeight: sourceH || undefined,
  });

  const apply = async () => {
    if (outputKind === "video") {
      onApply({ kind: "video", edit: buildEditOptions() });
      return;
    }

    // GIF path: convert in-browser before handing off to upload.
    if (!file) return;
    setGifError(null);
    setGifBusy(true);
    setGifProgress(0);
    try {
      const trimmedDuration =
        (trimEnd > 0 ? trimEnd : duration) - trimStart;
      if (trimmedDuration > MAX_GIF_DURATION_SECONDS + 0.5) {
        throw new Error(
          `GIFs can't be longer than ${MAX_GIF_DURATION_SECONDS}s. Trim it down first.`,
        );
      }
      const blob = await convertToGif(file, {
        edit: buildEditOptions(),
        onProgress: setGifProgress,
      });
      if (blob.size > MAX_GIF_BYTES) {
        throw new Error(
          `Generated GIF is ${(blob.size / 1024 ** 2).toFixed(1)} MB — over the ${(MAX_GIF_BYTES / 1024 ** 2).toFixed(0)} MB limit. Trim more or lower the resolution.`,
        );
      }
      onApply({ kind: "gif", blob, durationSeconds: trimmedDuration });
    } catch (err) {
      setGifError((err as Error).message);
    } finally {
      setGifBusy(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Defer revoke so the download has time to start in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(href), 5_000);
  };

  const runExtract = async (mode: "audio" | "video") => {
    if (!file) return;
    setExtractError(null);
    setExtractBusy(mode);
    try {
      const blob = await extract(mode, file, { edit: buildEditOptions() });
      const stem =
        file.name.replace(/\.[^.]+$/, "") +
        (mode === "audio" ? "-audio" : "-video-only");
      const ext = mode === "audio" ? "mp3" : "mp4";
      triggerDownload(blob, `${stem}.${ext}`);
    } catch (err) {
      setExtractError((err as Error).message);
    } finally {
      setExtractBusy(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Content maxWidth="720px">
        <Dialog.Title>Edit video</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Trim, rotate, crop, and zoom before uploading. You can also turn
          the clip into an animated GIF (max {MAX_GIF_DURATION_SECONDS}s,{" "}
          {Math.round(MAX_GIF_BYTES / 1024 / 1024)} MB).
        </Dialog.Description>

        <Flex align="center" gap="3" mb="3">
          <Text size="2" weight="medium" style={{ width: 76 }}>
            Output
          </Text>
          <SegmentedControl.Root
            value={outputKind}
            onValueChange={(v) => setOutputKind(v as "video" | "gif")}
          >
            <SegmentedControl.Item value="video">Video</SegmentedControl.Item>
            <SegmentedControl.Item value="gif">GIF</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>

        {url ? (
          <Flex direction="column" gap="3">
            {/* Preview */}
            <Box
              style={{
                position: "relative",
                background: "black",
                borderRadius: "var(--radius-3)",
                overflow: "hidden",
                aspectRatio: "16 / 9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Box
                style={{
                  position: "relative",
                  ...previewBoxStyle,
                  maxWidth: "100%",
                  maxHeight: "100%",
                  overflow: "hidden",
                }}
              >
                <video
                  ref={videoRef}
                  src={url}
                  onLoadedMetadata={onLoadedMetadata}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => setPlaying(false)}
                  muted
                  playsInline
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: `rotate(${rotation}deg) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                />
              </Box>
            </Box>

            {/* Transport */}
            <Flex align="center" gap="3">
              <IconButton size="2" variant="solid" onClick={togglePlay}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </IconButton>
              <Text size="1" color="gray" style={{ width: 90 }}>
                {format(currentTime)} / {format(duration)}
              </Text>
              <Box style={{ flex: 1 }}>
                <Slider
                  value={[Math.round(currentTime * 1000)]}
                  min={0}
                  max={Math.max(1, Math.round(duration * 1000))}
                  step={1}
                  onValueChange={(v) => seekTo((v[0] ?? 0) / 1000)}
                  size="1"
                  aria-label="Seek"
                />
              </Box>
            </Flex>

            {/* Trim */}
            <Box>
              <Flex justify="between" mb="1">
                <Text size="2" weight="medium">
                  Trim
                </Text>
                <Text size="1" color="gray">
                  {format(trimStart)} → {format(trimEnd)}
                </Text>
              </Flex>
              <Flex direction="column" gap="2">
                <Flex align="center" gap="2">
                  <Text size="1" color="gray" style={{ width: 36 }}>
                    Start
                  </Text>
                  <Box style={{ flex: 1 }}>
                    <Slider
                      value={[Math.round(trimStart * 1000)]}
                      min={0}
                      max={Math.max(1, Math.round(duration * 1000))}
                      step={1}
                      onValueChange={(v) => {
                        const next = Math.min(
                          (v[0] ?? 0) / 1000,
                          Math.max(0, trimEnd - 0.1),
                        );
                        setTrimStart(next);
                        seekTo(next);
                      }}
                      size="1"
                      aria-label="Trim start"
                    />
                  </Box>
                </Flex>
                <Flex align="center" gap="2">
                  <Text size="1" color="gray" style={{ width: 36 }}>
                    End
                  </Text>
                  <Box style={{ flex: 1 }}>
                    <Slider
                      value={[Math.round(trimEnd * 1000)]}
                      min={0}
                      max={Math.max(1, Math.round(duration * 1000))}
                      step={1}
                      onValueChange={(v) => {
                        const next = Math.max(
                          (v[0] ?? 0) / 1000,
                          trimStart + 0.1,
                        );
                        setTrimEnd(next);
                        seekTo(next);
                      }}
                      size="1"
                      aria-label="Trim end"
                    />
                  </Box>
                </Flex>
              </Flex>
            </Box>

            {/* Rotate */}
            <Flex align="center" gap="3">
              <Text size="2" weight="medium" style={{ width: 76 }}>
                Rotate
              </Text>
              <Button variant="soft" onClick={cycleRotation}>
                <ReloadIcon /> {rotation}°
              </Button>
              {rotation !== 0 && (
                <Button
                  size="1"
                  variant="ghost"
                  color="gray"
                  onClick={() => setRotation(0)}
                >
                  <ResetIcon /> Reset
                </Button>
              )}
            </Flex>

            {/* Crop */}
            <Flex align="center" gap="3">
              <Text size="2" weight="medium" style={{ width: 76 }}>
                Crop
              </Text>
              <SegmentedControl.Root
                value={cropAspect}
                onValueChange={(v) => setCropAspect(v as CropAspect)}
              >
                {CROP_ASPECTS.map((c) => (
                  <SegmentedControl.Item key={c.value} value={c.value}>
                    {c.label}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
            </Flex>

            {/* Zoom */}
            <Flex align="center" gap="3">
              <Text size="2" weight="medium" style={{ width: 76 }}>
                Zoom
              </Text>
              <Box style={{ flex: 1 }}>
                <Slider
                  value={[Math.round(zoom * 100)]}
                  min={100}
                  max={300}
                  step={5}
                  onValueChange={(v) => setZoom((v[0] ?? 100) / 100)}
                  aria-label="Zoom"
                />
              </Box>
              <Text size="1" color="gray" style={{ width: 40 }}>
                {zoom.toFixed(2)}×
              </Text>
            </Flex>

            {/* Speed */}
            <Flex align="center" gap="3">
              <Text size="2" weight="medium" style={{ width: 76 }}>
                Speed
              </Text>
              <Box style={{ flex: 1 }}>
                <Slider
                  value={[Math.round(playbackRate * 100)]}
                  min={50}
                  max={200}
                  step={5}
                  onValueChange={(v) =>
                    setPlaybackRate((v[0] ?? 100) / 100)
                  }
                  aria-label="Playback speed"
                />
              </Box>
              <Text size="1" color="gray" style={{ width: 40 }}>
                {playbackRate.toFixed(2)}×
              </Text>
            </Flex>

            {/* Export */}
            <Flex align="center" gap="3" wrap="wrap">
              <Text size="2" weight="medium" style={{ width: 76 }}>
                Export
              </Text>
              <Button
                variant="soft"
                color="gray"
                onClick={() => runExtract("audio")}
                disabled={extractBusy !== null}
              >
                <DownloadIcon />
                {extractBusy === "audio" ? "Extracting…" : "Audio (.mp3)"}
              </Button>
              <Button
                variant="soft"
                color="gray"
                onClick={() => runExtract("video")}
                disabled={extractBusy !== null}
              >
                <DownloadIcon />
                {extractBusy === "video" ? "Extracting…" : "Video (no audio)"}
              </Button>
            </Flex>
            {extractError && (
              <Text size="1" color="red">
                {extractError}
              </Text>
            )}
          </Flex>
        ) : (
          <Text color="gray">No file selected.</Text>
        )}

        {gifError && (
          <Callout.Root color="red" mt="3">
            <Callout.Text>{gifError}</Callout.Text>
          </Callout.Root>
        )}
        {gifBusy && (
          <Callout.Root color="iris" mt="3">
            <Callout.Text>
              Building GIF… {Math.round(gifProgress * 100)}%
            </Callout.Text>
          </Callout.Root>
        )}

        <Flex gap="3" mt="5" justify="end">
          <Button
            variant="soft"
            color="gray"
            onClick={onCancel}
            disabled={gifBusy}
          >
            Cancel
          </Button>
          <Button onClick={apply} disabled={!file || gifBusy}>
            {outputKind === "gif"
              ? gifBusy
                ? "Converting…"
                : "Convert & upload GIF"
              : "Apply & upload"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
