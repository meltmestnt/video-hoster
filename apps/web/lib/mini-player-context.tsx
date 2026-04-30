"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export interface MiniPlayerVideo {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  title: string;
}

export interface MiniPlayerSnapshot {
  currentTime: number;
  playing: boolean;
  volume: number;
  muted: boolean;
}

interface MiniPlayerState extends MiniPlayerSnapshot {
  video: MiniPlayerVideo | null;
}

interface MiniPlayerContextValue extends MiniPlayerState {
  // Called by the main player on mount. If a snapshot exists for this video,
  // it's returned so the main player can restore time/playing/volume.
  attachToVideo: (video: MiniPlayerVideo) => MiniPlayerSnapshot | null;
  update: (partial: Partial<MiniPlayerSnapshot>) => void;
  // Called by the mini player when the user explicitly closes it.
  close: () => void;
}

const Ctx = createContext<MiniPlayerContextValue | null>(null);

const initial: MiniPlayerState = {
  video: null,
  currentTime: 0,
  playing: false,
  volume: 0.8,
  muted: false,
};

export function MiniPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<MiniPlayerState>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const attachToVideo = useCallback((video: MiniPlayerVideo) => {
    const cur = stateRef.current;
    if (cur.video?.id === video.id) {
      // Same video: restore snapshot, then clear so mini-player won't show
      // while the main player is on screen.
      const snapshot: MiniPlayerSnapshot = {
        currentTime: cur.currentTime,
        playing: cur.playing,
        volume: cur.volume,
        muted: cur.muted,
      };
      setState({ ...snapshot, video });
      return snapshot;
    }
    // Different video — reset and adopt the new one.
    setState({
      video,
      currentTime: 0,
      playing: false,
      volume: cur.volume,
      muted: cur.muted,
    });
    return null;
  }, []);

  const update = useCallback((partial: Partial<MiniPlayerSnapshot>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const close = useCallback(() => {
    setState({ ...initial });
  }, []);

  const value = useMemo<MiniPlayerContextValue>(
    () => ({
      ...state,
      attachToVideo,
      update,
      close,
    }),
    [state, attachToVideo, update, close],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMiniPlayer(): MiniPlayerContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMiniPlayer must be used inside MiniPlayerProvider");
  return ctx;
}
