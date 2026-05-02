import { ImageResponse } from "next/og";

export const alt = "vids&gifs — upload, share, and discover short videos, GIFs, and screenshots";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          background:
            "radial-gradient(circle at 20% 20%, #2a1f4a 0%, #0a0a0a 60%)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 168,
            fontWeight: 700,
            letterSpacing: "-0.05em",
            lineHeight: 1,
            color: "#a78bfa",
          }}
        >
          vids&amp;gifs
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 40,
            color: "#cbd5e1",
            letterSpacing: "-0.01em",
            maxWidth: 900,
            lineHeight: 1.2,
          }}
        >
          Upload, share, and discover short videos, GIFs, and screenshots.
        </div>
        <div
          style={{
            marginTop: 56,
            fontSize: 28,
            color: "#64748b",
          }}
        >
          vidsandgifs.com
        </div>
      </div>
    ),
    { ...size },
  );
}
