"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

interface MorphProps {
  // Children are rendered inside an auto-measured pane. Whenever their
  // intrinsic size changes — because the inner view swapped, an item was
  // added, an error appeared, etc. — the wrapper animates between the old
  // and new dimensions.
  children: ReactNode;
  // Re-keying the inner pane on `viewKey` change replays the fade/slide-in
  // animation, which is what makes a content swap feel like a deliberate
  // morph rather than a content replace.
  viewKey?: string | number;
  // Pin one axis when the popup naturally has a fixed width or height
  // (e.g. dialogs with maxWidth) so the morph only animates the other axis.
  axis?: "both" | "height" | "width";
  // Forwarded to the outer wrapper. Useful for popovers/dialogs that have
  // their own width sizing already.
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wrap content whose dimensions change between states and the wrapper will
 * animate width/height via a ResizeObserver-driven explicit size. Mirrors
 * the original UserMenu morph implementation.
 */
export function Morph({
  children,
  viewKey,
  axis = "both",
  className,
  style,
}: MorphProps) {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const setPaneNode = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setSize({ w: node.scrollWidth, h: node.scrollHeight });
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const target = entry.target as HTMLElement;
      setSize({ w: target.scrollWidth, h: target.scrollHeight });
    });
    ro.observe(node);
    observerRef.current = ro;
  }, []);

  return (
    <div
      className={`morph-container${className ? ` ${className}` : ""}`}
      style={{
        width: size && axis !== "height" ? size.w : undefined,
        height: size && axis !== "width" ? size.h : undefined,
        ...style,
      }}
    >
      <div
        ref={setPaneNode}
        key={viewKey}
        className="morph-pane"
      >
        {children}
      </div>
    </div>
  );
}
