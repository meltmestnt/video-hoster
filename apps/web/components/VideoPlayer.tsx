"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Slider } from "@radix-ui/themes";
import {
  PlayIcon,
  PauseIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  SpeakerQuietIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
} from "@radix-ui/react-icons";
import type ReactPlayerType from "react-player";
import { useMiniPlayer } from "@/lib/mini-player-context";
import { useT } from "@/lib/i18n";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

const VOLUME_STEP = 0.05;
const SEEK_STEP_S = 5;
const HIDE_DELAY_MS = 2200;
// Tolerated drift between an overlay's audio.currentTime and the video's
// clock. Below this we leave the audio alone so we're not constantly
// thrashing currentTime on every progress tick.
const OVERLAY_DRIFT_TOLERANCE_S = 0.3;

export interface AudioOverlayTrack {
  id: string;
  url: string | null;
  startSeconds: number;
  volume: number;
}

interface VideoPlayerProps {
  url: string;
  thumbnailUrl?: string | null;
  videoId?: string;
  title?: string;
  // Layered audio tracks that play in sync with this video. Overlay audio
  // mirrors the player's play/pause/seek/volume state.
  audioTracks?: AudioOverlayTrack[];
  // When true, the video's built-in audio is silenced so only overlays
  // play. Independent from the user's session mute toggle.
  mainAudioMuted?: boolean;
  // Hard cap on playback time before the player pauses and shows a CTA.
  // Used for anonymous-viewer previews — the visitor watches the first
  // N seconds and then has to sign in to continue. Undefined = no cap.
  maxPlaybackSeconds?: number;
  // Renders inside the player frame when the playback cap fires. Server
  // pages pass a sign-in CTA; preview-less players leave it undefined.
  previewLockOverlay?: React.ReactNode;
  // When true, the underlying <video> element gets preload="none" so the
  // browser doesn't fetch any bytes until the user clicks play. We use
  // this for anon viewers — the byId trip costs nothing on its own,
  // but the metadata range request the player fires on mount can.
  lazyLoad?: boolean;
}

/**
 * Pull each overlay's <audio> element into agreement with the video clock.
 * Pauses tracks whose start point hasn't been reached yet (or whose clip
 * has already ended), and corrects drift on the rest. Idempotent — safe
 * to call on every progress tick.
 */
function syncOverlayPositions(
  refs: Map<string, HTMLAudioElement>,
  tracks: AudioOverlayTrack[],
  videoTime: number,
  playing: boolean,
) {
  for (const track of tracks) {
    const audio = refs.get(track.id);
    if (!audio) continue;
    const offset = videoTime - track.startSeconds;
    if (offset < 0) {
      if (!audio.paused) audio.pause();
      if (audio.currentTime !== 0) audio.currentTime = 0;
      continue;
    }
    if (Number.isFinite(audio.duration) && offset >= audio.duration) {
      if (!audio.paused) audio.pause();
      continue;
    }
    if (Math.abs(audio.currentTime - offset) > OVERLAY_DRIFT_TOLERANCE_S) {
      audio.currentTime = offset;
    }
    if (playing && audio.paused) {
      audio.play().catch(() => {
        // Autoplay restrictions: a user-initiated play on the video has
        // already been granted, but a track that resumes async after a
        // seek can briefly fail. Next sync cycle retries.
      });
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function VideoPlayer({
  url,
  thumbnailUrl,
  videoId,
  title,
  audioTracks,
  mainAudioMuted,
  maxPlaybackSeconds,
  previewLockOverlay,
  lazyLoad,
}: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayerType | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const t = useT();
  // One <audio> ref per overlay, keyed by track id. We mutate currentTime/
  // volume/muted directly rather than via React props so a 60Hz progress
  // tick doesn't trigger a state update per overlay.
  const overlayAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  // Without memo, `audioTracks ?? []` constructs a new array on every render
  // and any effect that depends on it would fire on every parent rerender —
  // including the high-frequency ones from the mini-player progress tick.
  const tracks = useMemo(() => audioTracks ?? [], [audioTracks]);

  const mini = useMiniPlayer();
  const restoredTimeRef = useRef<number | null>(null);
  const seededRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [played, setPlayed] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // Latches once an anon viewer has watched their preview window. Stays
  // sticky for the page's lifetime — a seek back wouldn't bypass the gate.
  const [previewLocked, setPreviewLocked] = useState(false);

  // Adopt this video into the mini-player context. If the same video was
  // playing before (via mini), restore its time/playing/volume state.
  useEffect(() => {
    if (!videoId || !title) return;
    const restored = mini.attachToVideo({
      id: videoId,
      url,
      thumbnailUrl: thumbnailUrl ?? null,
      title,
    });
    if (restored) {
      restoredTimeRef.current = restored.currentTime;
      setPlaying(restored.playing);
      setVolume(restored.volume);
      setMuted(restored.muted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Push state changes to the mini-player snapshot so it can pick up
  // seamlessly on navigation away.
  useEffect(() => {
    if (!videoId) return;
    mini.update({ playing, volume, muted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, volume, muted, videoId]);

  const togglePlay = () => {
    // Once the preview window is exhausted there's nothing to toggle to —
    // the only way out is the CTA overlay rendered over the frame.
    if (previewLocked) return;
    setPlaying((p) => !p);
  };
  const toggleMute = () => setMuted((m) => !m);

  const seekBy = (deltaSec: number) => {
    const cur = playerRef.current?.getCurrentTime?.() ?? 0;
    const next = duration > 0 ? Math.max(0, Math.min(duration, cur + deltaSec)) : cur + deltaSec;
    playerRef.current?.seekTo(next, "seconds");
    if (duration > 0) setPlayed(next / duration);
  };

  const adjustVolume = (delta: number) => {
    setMuted(false);
    setVolume((v) => +Math.max(0, Math.min(1, v + delta)).toFixed(3));
  };

  const toggleFullscreen = () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement === frame) {
      document.exitFullscreen?.();
    } else {
      frame.requestFullscreen?.();
    }
  };

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Mirror the player's volume / mute onto each overlay. Per-track gain is
  // multiplied with the master volume so the volume slider behaves like a
  // single slider over the mixed output.
  useEffect(() => {
    overlayAudioRefs.current.forEach((audio, id) => {
      const track = tracks.find((t) => t.id === id);
      if (!track) return;
      audio.muted = muted;
      const v = track.volume * volume;
      audio.volume = Math.max(0, Math.min(1, v));
    });
  }, [muted, volume, tracks]);

  // When playback starts/stops, immediately pause every overlay. Resuming
  // is left to the next progress tick (which knows the live currentTime
  // from ReactPlayer) so we don't have to read it ourselves here.
  useEffect(() => {
    if (!playing) {
      overlayAudioRefs.current.forEach((audio) => {
        if (!audio.paused) audio.pause();
      });
    }
  }, [playing]);

  const showControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        HIDE_DELAY_MS,
      );
    }
  };

  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    } else {
      showControls();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const onFrameClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".player-controls")) return;
    frameRef.current?.focus();
    togglePlay();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case " ":
      case "k":
      case "K":
        e.preventDefault();
        togglePlay();
        break;
      case "m":
      case "M":
        e.preventDefault();
        toggleMute();
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "ArrowUp":
        e.preventDefault();
        adjustVolume(VOLUME_STEP);
        showControls();
        break;
      case "ArrowDown":
        e.preventDefault();
        adjustVolume(-VOLUME_STEP);
        showControls();
        break;
      case "ArrowLeft":
        e.preventDefault();
        seekBy(-SEEK_STEP_S);
        showControls();
        break;
      case "ArrowRight":
        e.preventDefault();
        seekBy(SEEK_STEP_S);
        showControls();
        break;
      case "Home":
      case "0":
        e.preventDefault();
        playerRef.current?.seekTo(0, "seconds");
        setPlayed(0);
        break;
      case "End":
        e.preventDefault();
        if (duration > 0) {
          playerRef.current?.seekTo(duration, "seconds");
          setPlayed(1);
        }
        break;
    }
  };

  const VolumeIcon =
    muted || volume === 0
      ? SpeakerOffIcon
      : volume < 0.5
        ? SpeakerQuietIcon
        : SpeakerLoudIcon;
  const FullscreenIcon = fullscreen ? ExitFullScreenIcon : EnterFullScreenIcon;
  const currentSeconds = duration > 0 ? played * duration : 0;

  return (
    <div
      ref={frameRef}
      className={`player-frame${controlsVisible ? " is-active" : ""}${ready ? " is-ready" : ""}`}
      tabIndex={0}
      role="application"
      aria-label={t("player.aria.player")}
      onClick={onFrameClick}
      onKeyDown={onKeyDown}
      onMouseMove={showControls}
      onMouseLeave={() => {
        if (playing) setControlsVisible(false);
      }}
    >
      <ReactPlayer
        ref={(r: ReactPlayerType | null) => {
          playerRef.current = r;
        }}
        url={url}
        playing={playing}
        volume={volume}
        // mainAudioMuted strips the original audio at playback time so
        // overlays alone are heard. The session mute toggle is OR'd in.
        muted={muted || !!mainAudioMuted}
        width="100%"
        height="100%"
        controls={false}
        onReady={() => {
          setReady(true);
          if (
            !seededRef.current &&
            restoredTimeRef.current !== null &&
            restoredTimeRef.current > 0
          ) {
            playerRef.current?.seekTo(restoredTimeRef.current, "seconds");
          }
          seededRef.current = true;
        }}
        onBuffer={() => setBuffering(true)}
        onBufferEnd={() => setBuffering(false)}
        onEnded={() => setPlaying(false)}
        onProgress={(s) => {
          if (!seeking) setPlayed(s.played);
          if (videoId && Number.isFinite(s.playedSeconds)) {
            mini.update({ currentTime: s.playedSeconds });
          }
          // Hard pause once the anon-preview window is up. We snap the
          // player to the cap rather than letting it drift past so the
          // visible time matches the lock.
          if (
            maxPlaybackSeconds != null &&
            s.playedSeconds >= maxPlaybackSeconds &&
            !previewLocked
          ) {
            setPreviewLocked(true);
            setPlaying(false);
            playerRef.current?.seekTo(maxPlaybackSeconds, "seconds");
          }
          // Drift-correct each overlay against the video's clock. Cheap when
          // already in sync (no DOM mutation), pulls back overlays that have
          // drifted >300ms — happens after seeks, network stalls, etc.
          syncOverlayPositions(
            overlayAudioRefs.current,
            tracks,
            s.playedSeconds,
            playing,
          );
        }}
        onDuration={(d) => setDuration(d)}
        config={{
          file: {
            attributes: {
              ...(thumbnailUrl ? { poster: thumbnailUrl } : {}),
              // preload="none" defers all byte fetches (including the
              // metadata range request the browser fires on mount) until
              // the user actually clicks play. Saves bandwidth on every
              // browse-and-bounce.
              preload: lazyLoad ? "none" : "metadata",
            },
          },
        }}
      />
      {previewLocked && previewLockOverlay && (
        <div
          className="player-preview-lock"
          // The overlay sits above the controls so seek/play don't bypass
          // it. onClick stops propagation so taps inside the CTA don't
          // bubble back into the frame's togglePlay handler.
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(2px)",
            zIndex: 5,
            padding: "24px",
            textAlign: "center",
          }}
        >
          {previewLockOverlay}
        </div>
      )}
      {(!ready || buffering) && <div className="media-loader" aria-hidden />}
      <div
        className={`player-controls${controlsVisible ? " is-visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="player-seek">
          <Slider
            value={[Math.round(played * 1000)]}
            onValueChange={(v) => {
              setSeeking(true);
              setPlayed((v[0] ?? 0) / 1000);
            }}
            onValueCommit={(v) => {
              const ratio = (v[0] ?? 0) / 1000;
              if (duration > 0) {
                playerRef.current?.seekTo(ratio * duration, "seconds");
              }
              setSeeking(false);
            }}
            min={0}
            max={1000}
            step={1}
            size="1"
            aria-label={t("player.aria.seek")}
          />
        </div>
        <div className="player-controls-row">
          <button
            type="button"
            className="player-icon-btn"
            onClick={togglePlay}
            aria-label={playing ? t("player.aria.pause") : t("player.aria.play")}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="player-icon-btn"
            onClick={toggleMute}
            aria-label={muted ? t("player.aria.unmute") : t("player.aria.mute")}
          >
            <VolumeIcon />
          </button>
          <div className="player-volume">
            <Slider
              value={[Math.round((muted ? 0 : volume) * 100)]}
              onValueChange={(v) => {
                const n = (v[0] ?? 0) / 100;
                setVolume(n);
                if (n > 0) setMuted(false);
              }}
              min={0}
              max={100}
              step={1}
              size="1"
              aria-label={t("player.aria.volume")}
            />
          </div>
          <span className="player-time" aria-hidden>
            {formatTime(currentSeconds)} / {formatTime(duration)}
          </span>
          <button
            type="button"
            className="player-icon-btn player-fullscreen-btn"
            onClick={toggleFullscreen}
            aria-label={
              fullscreen
                ? t("player.aria.fullscreen.exit")
                : t("player.aria.fullscreen.enter")
            }
          >
            <FullscreenIcon />
          </button>
        </div>
      </div>
      {tracks.map((track) =>
        track.url ? (
          <audio
            key={track.id}
            ref={(node) => {
              if (node) overlayAudioRefs.current.set(track.id, node);
              else overlayAudioRefs.current.delete(track.id);
            }}
            src={track.url}
            preload="auto"
            // Hide entirely — these are mixer tracks, not user-controlled.
            // visibility:hidden keeps them in the layout tree (helps autoplay
            // policies treat them as part of the user-initiated playback).
            style={{
              position: "absolute",
              width: 0,
              height: 0,
              opacity: 0,
              pointerEvents: "none",
            }}
            aria-hidden
          />
        ) : null,
      )}
    </div>
  );
}
