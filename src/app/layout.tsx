import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Serif, Nunito } from "next/font/google";
import { SWRegister } from "@/components/system/sw-register";
import { OfflineIndicator } from "@/components/system/offline-indicator";
import { InstallPrompt } from "@/components/system/install-prompt";
import "./globals.css";

// R43 · MIRAGE STUDIO — the user retired the nature feel: professional,
// less sci-fi, "almost like studiomirage.io". Space Grotesk (confident
// geometric grotesque, the PPPangramSans register) replaces Nunito under
// the SAME --font-geist-sans variable so zero components change;
// Instrument Serif joins as --font-fraunces for the italic editorial
// flourishes only (.sys-italic — the madebykota Times-accent signature);
// Geist_Mono stays for tiny tabular data readouts only.
// R57 · CLEAN SLATE — the cinematic studio retired ("simple, crisp and
// human"): Nunito — the friendly rounded face the project was born with —
// returns under the SAME --font-geist-sans variable so zero components
// change. The `dark` class drops: R57 tokens re-declare a light canvas.
const friendlySans = Nunito({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const studioSerif = Instrument_Serif({
  variable: "--font-fraunces",
  subsets: ["latin"],
  // true italics (no faux-slant): one or two editorial flourish words
  // per surface (.sys-italic), the madebykota.com Times-accent signature.
  style: ["normal", "italic"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRIME — Training Studio",
  description:
    "One system. Real training. Measurable progression. An immersive local-first training companion — log real workouts, earn XP, and grow measurable strength.",
  keywords: ["fitness", "gamified", "workout tracker", "leveling", "RPG fitness", "prime"],
  // R20-a — explicit manifest link (belt-and-braces: Next also auto-links the
  // app/manifest.ts file convention; a duplicate is deduped by the resolver).
  manifest: "/manifest.webmanifest",
  applicationName: "PRIME",
  // iOS home-screen install: standalone-capable, edge-to-edge status bar over
  // the TopNav (black-translucent + viewport-fit=cover), proper home title.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PRIME",
  },
  // R20-a — local-first icons: the previous CDN logo is unreachable offline /
  // installed; /logo.svg + /apple-touch-icon.png ship with the app itself.
  icons: {
    icon: "/logo.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // R20-a — notch/edge-to-edge: exposes env(safe-area-inset-*) to the layout
  // (TopNav pads the status-bar strip on notched phones).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html> AND <body> — PERMANENT HYDRATION
    // NOISE GUARDS (R30-0; the R28 version of this fix was lost to a sandbox
    // rollback and never re-landed — do NOT remove these in refactors):
    //
    // 1. <html>: the reveal flow system adds the `js-reveal` class to
    //    documentElement at client-bundle EVAL time (before hydration), and
    //    any future theme/extension class follows the same next-themes
    //    pattern — React must accept server/client class drift here.
    // 2. <body>: real browsers with extensions (password managers, grammar
    //    tools, dark-mode overlays) inject foreign attributes/classes onto
    //    <body> BEFORE React 19 hydrates, producing the "attributes of the
    //    server rendered HTML didn't match" console error. The app's SSR tree
    //    itself is provably deterministic (boot screen + static ambient
    //    layers only — every env-reading surface is mounted-gated), so this
    //    suppression only ever swallows EXTERNAL noise, never real bugs.
    //    Depth-1 suppression on these two elements is the documented
    //    Next.js/React remedy; it does NOT cascade to children.
    <html
      lang="en"
      className={`${friendlySans.variable} ${studioSerif.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
        {children}
        <SWRegister />
        <OfflineIndicator />
        <InstallPrompt />
      </body>
    </html>
  );
}
