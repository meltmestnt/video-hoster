import { ImageResponse } from "next/og";

// 512×512 sibling of icon.tsx, served at /icon1. PWA install criteria
// require a 512×512 icon in the web app manifest, so this exists
// solely to feed manifest.ts. Browsers also use it as the splash
// screen and app-launcher icon when the site is installed.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon512() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 30% 30%, #2a1f4a 0%, #0a0a0a 70%)",
          borderRadius: 96,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="288"
          height="288"
          viewBox="0 0 288 288"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M70 42 L246 144 L70 246 Z" fill="#a78bfa" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
