import type { MetadataRoute } from "next";

/**
 * Web App Manifest served at /manifest.webmanifest. Defines the PWA
 * metadata browsers need before they'll offer "Install app" — name,
 * icons (192 + 512 minimum), theme color, and a start URL. Once this
 * is in place plus a registered service worker (see RegisterSW.tsx),
 * Chrome on desktop and Android shows the install prompt and Safari
 * lets users add to home screen with the right icon and title.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "vids&gifs",
    short_name: "vids&gifs",
    description:
      "Upload, convert, share, and discover short videos, GIFs, and screenshots.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["entertainment", "social", "photo"],
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Maskable variant lets Android crop the icon into its system
      // shape (squircle, circle) without clipping the play-button mark.
      // Reuses /icon1 because the artwork has plenty of safe-zone
      // padding on every side already.
      {
        src: "/icon1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
