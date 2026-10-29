"use client"

import { useEffect } from "react"

/**
 * SWRegister — mounts once (from the root layout) and registers /sw.js when
 * the browser supports service workers (errors are swallowed at console.debug
 * level — never spam). Offline narration lives in OfflineIndicator, which also
 * carries the mutation-queue state; this component owns no UI anymore.
 *
 * DEV-SAFE REGISTRATION (R22 close-out): in development the script URL carries
 * ?mode=dev and sw.js answers NO fetches (registered-but-inert). v1's
 * stale-while-revalidate on /_next/static served stale Turbopack chunks after
 * edits — a shipped fix could look broken until a fresh browser context. In
 * production the URL is bare /sw.js and the full caching strategy engages.
 */

export function SWRegister() {
  // ── service worker registration ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const swUrl =
      process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?mode=dev"

    // register after load so it never competes with first-paint resources
    const register = () => {
      navigator.serviceWorker
        .register(swUrl)
        .catch((err) => {
          // dev noise / unsupported — never surface as an error
          console.debug("[prime] service worker registration skipped:", err)
        })
    }

    if (document.readyState === "complete") {
      register()
    } else {
      window.addEventListener("load", register, { once: true })
      return () => window.removeEventListener("load", register)
    }
  }, [])

  return null
}
