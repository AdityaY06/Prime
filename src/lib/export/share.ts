// ─── PRIME · Web Share API bridge (R20-c) ─────────────────────────────────────
// Sends PRIME exports through the OS share sheet — Gmail, Drive, Sheets,
// Strava's upload flow, any installed app that accepts files — instead of a
// bare download. This is the phone-app dispatch path the Play-Store build
// deserves.
//
// Capability detection is fully guarded (canShareFiles): no navigator.share,
// no navigator.canShare, or canShare refusing a tiny probe File (iOS Safari,
// headless Chrome, desktop Firefox…) → false, and callers fall back to an
// honest direct download. The probe File is built inside a try/catch because
// older embeddable browsers can throw on the File constructor itself.
//
// AbortError semantics: the USER CLOSING the share sheet is not an error —
// navigator.share rejects with AbortError on dismissal, so dispatch resolves
// "shared" and callers never toast a failure for a user decision. Every
// other failure falls back to download. Neither exported function EVER
// throws to the caller.

import { downloadCsv, downloadTextFile } from "@/lib/export/csv"

/** True only when this browser can dispatch FILES through navigator.share. */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined") return false // SSR / non-DOM runtimes
    if (typeof navigator.share !== "function") return false
    if (typeof navigator.canShare !== "function") return false
    const probe = new File([""], "x.csv", { type: "text/csv" })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/** Dispatch core — "shared" when the sheet completed OR was dismissed, "fallback" otherwise. */
async function dispatchFile(file: File, title: string, text: string): Promise<"shared" | "fallback"> {
  try {
    await navigator.share({ files: [file], title, text })
    return "shared"
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "shared" // user closed the sheet
    return "fallback"
  }
}

/** Belt for the never-throw contract — Blob/anchor cannot realistically fail in a DOM browser. */
function safeDownload(fn: () => void): void {
  try {
    fn()
  } catch {
    /* swallow — callers must never see a rejected promise from here */
  }
}

/**
 * Share a workout CSV through the OS share sheet; falls back to a direct
 * download when files cannot be shared (or the sheet hard-fails).
 */
export async function shareCsvFile(
  filename: string,
  csv: string,
  title: string,
  text: string,
): Promise<"shared" | "downloaded"> {
  if (canShareFiles()) {
    const outcome = await dispatchFile(new File([csv], filename, { type: "text/csv" }), title, text)
    if (outcome === "shared") return "shared"
  }
  safeDownload(() => downloadCsv(filename, csv))
  return "downloaded"
}

/**
 * Share a JSON export (the data-vault backup) through the OS share sheet;
 * falls back to a direct download. Sibling of shareCsvFile so the vault
 * never depends on the CSV flavor's MIME type.
 */
export async function shareJsonFile(
  filename: string,
  json: string,
  title: string,
  text: string,
): Promise<"shared" | "downloaded"> {
  if (canShareFiles()) {
    const outcome = await dispatchFile(new File([json], filename, { type: "application/json" }), title, text)
    if (outcome === "shared") return "shared"
  }
  safeDownload(() => downloadTextFile(filename, json, "application/json"))
  return "downloaded"
}
