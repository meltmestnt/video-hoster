"use client";

import { useEffect, useRef, useState } from "react";
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

interface VideoPlayerProps {
  url: string;
  thumbnailUrl?: string | null;
  videoId?: string;
  title?: string;
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
}: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayerType | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const t = useT();

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

  const togglePlay = () => setPlaying((p) => !p);
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
        muted={muted}
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
        }}
        onDuration={(d) => setDuration(d)}
        config={{
          file: {
            attributes: thumbnailUrl ? { poster: thumbnailUrl } : {},
          },
        }}
      />
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
    </div>
  );
}
