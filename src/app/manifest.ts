import type { MetadataRoute } from "next"

// ─── /manifest.webmanifest — PRIME PWA manifest ────────────────────────────────
// Served by Next.js at /manifest.webmanifest automatically (file-based metadata
// route). Chrome derives installability from this + the service worker.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PRIME — Training System",
    short_name: "PRIME",
    description: "Gamified adaptive training system. Earn XP, break records, ascend.",
    // R20-a — identity & scope: `id` pins the app identity so later manifest
    // edits (renames, new icons) never fork the installed app into a duplicate
    // launcher entry; `scope` locks the navigable boundary to the single-route
    // SPA so external links never open "inside" the app frame.
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "en",
    dir: "ltr",
    // Play Store / launcher category shelves (Play "Health & Fitness")
    categories: ["health", "fitness", "lifestyle"],
    background_color: "#060607",
    theme_color: "#0a0a0b",
    // R20-a — launcher quick-actions (long-press the app icon on Android /
    // home-screen shortcut on iOS). Each deep-links through the ?tab= boot
    // param the page shell reads on first mount (see page.tsx). short_names
    // sit within the 12-char launcher glyph budget.
    shortcuts: [
      {
        name: "Start a Raid",
        short_name: "Start Raid",
        description: "Jump straight into today's training gates",
        url: "/?tab=gates",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Log Fuel",
        short_name: "Log Fuel",
        description: "Log a meal against today's nutrition targets",
        url: "/?tab=fuel",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Check Vitals",
        short_name: "Vitals",
        description: "Review sleep, heart-rate and readiness telemetry",
        url: "/?tab=vitals",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Chrome reads a space-separated purpose list — "any maskable" lets this one
    // asset serve regular launchers AND Android adaptive-icon crops. Next's
    // strict Manifest type only models single keywords, so the array is widened
    // with a targeted cast (runtime JSON keeps the dual purpose verbatim).
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        // dual purpose: Android adaptive icons crop into the safe zone,
        // regular launchers use it as-is
        purpose: "any maskable",
      },
    ] as MetadataRoute.Manifest["icons"],
  }
}
