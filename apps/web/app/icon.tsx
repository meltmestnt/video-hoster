import { ImageResponse } from "next/og";

// Google Search requires a favicon of at least 48×48 px to display in
// SERP results. Below that and the listing falls back to the generic
// globe icon (which is what was happening on vidsandgifs.xyz). 192×192
// also covers high-DPI browser tabs and PWA install prompts.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 30% 30%, #2a1f4a 0%, #0a0a0a 70%)",
          borderRadius: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="108"
          height="108"
          viewBox="0 0 108 108"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M26 16 L92 54 L26 92 Z" fill="#a78bfa" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
