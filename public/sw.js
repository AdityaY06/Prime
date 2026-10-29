/* ─── PRIME service worker · prime-sw-v2 ────────────────────────────────────────
 *
 * DEV-SAFE by design. This worker must NEVER break Next.js dev hot-reload or
 * serve stale dev HTML or chunks:
 *   · dev mode (registered as /sw.js?mode=dev) → PURE PASSTHROUGH: the fetch
 *     handler handles NOTHING. v1 learned this the hard way — Turbopack dev
 *     chunks mutate in place under stable URLs, so stale-while-revalidate on
 *     /_next/static served yesterday's code after every edit (observed in
 *     R22-b: a shipped fix "didn't work" until a fresh browser context).
 *     A registered-but-inert worker keeps PWA install eligibility without
 *     ever poisoning dev.
 *   · production (registered as /sw.js):
 *     · /api/*            → network-only (no caching, failures propagate)
 *     · navigations       → network-first (cached "/" is a last-resort offline
 *                           shell used only when the network is unreachable)
 *     · static assets     → stale-while-revalidate (/_next/static chunks are
 *                           content-hashed and immutable in prod — safe)
 *     · everything else   → plain passthrough
 * Only same-origin GETs are ever handled. Only OK, basic-type responses are
 * ever cached. No external dependencies — plain vanilla service worker JS.
 */

const VERSION = "prime-sw-v2"
const CACHE = `prime-${VERSION}`

/* Dev detection: the register component registers this script as
 * "/sw.js?mode=dev" when NODE_ENV !== "production". In dev the worker is
 * inert by design (see header) — it controls the page (install eligibility,
 * offline-shell detection) but never answers fetches. */
const DEV =
  new URLSearchParams(self.location.search).get("mode") === "dev"

/* Extensions treated as immutable-ish static assets for cache-first + revalidate. */
const STATIC_EXT = /\.(?:png|jpe?g|svg|webp|woff2)$/i

/* ─── install: precache the offline shell, fail-open ────────────────────────────
 * In dev the "/" document changes constantly — but we only ever serve it when
 * the network is DOWN, so precaching it can't poison dev. Install never blocks:
 * if the precache fails (e.g. server restarting), we swallow the error. */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE)
        await cache.add(new Request("/", { cache: "reload" }))
      } catch (err) {
        // fail-open: a failed shell precache must not block installation
        console.debug("[prime-sw] shell precache skipped:", err)
      }
      await self.skipWaiting()
    })()
  )
})

/* ─── activate: purge old caches, take control ────────────────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

/* ─── helpers ─────────────────────────────────────────────────────────────────── */

/** Only cache responses that are OK and basic (same-origin, non-opaque). */
function cacheable(response) {
  return !!(response && response.ok && response.type === "basic")
}

/** Stale-while-revalidate for static assets. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)

  // background revalidate — never awaited by the caller's render path
  fetch(request)
    .then((response) => {
      if (cacheable(response)) {
        // clone before use: the response body is consumed by cache.put
        cache.put(request, response.clone())
      }
    })
    .catch(() => {
      /* network gone: the cached copy (if any) is already being served */
    })

  if (cached) return cached

  // cache miss: must wait for the network now
  try {
    const response = await fetch(request)
    if (cacheable(response)) {
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    // nothing cached and network down — surface the failure
    return Promise.reject(err)
  }
}

/** Network-first for navigations; cached "/" as the offline shell. */
async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      // keep the offline shell fresh — clone before the body is consumed
      cache.put("/", response.clone())
    }
    return response
  } catch (err) {
    const shell = await cache.match("/")
    if (shell) return shell
    return Promise.reject(err)
  }
}

/* ─── fetch: dispatch by rule ─────────────────────────────────────────────────── */
self.addEventListener("fetch", (event) => {
  const { request } = event

  // DEV: inert worker — never answer a fetch, never read or write a cache.
  // Hot-reload chunks, HMR sockets and fresh HTML always come straight from
  // the dev server. (Install eligibility is unaffected: the worker still
  // registers and controls the page.)
  if (DEV) return

  // ONLY same-origin GETs are handled — everything else passes through
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.method !== "GET") return

  // 1) API traffic is sacred: network-only, no cache reads, no cache writes.
  //    A rejected fetch simply propagates to the app's own error handling.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request))
    return
  }

  // 2) Navigations: network-first (dev hot-reload always wins), offline shell
  //    fallback only when the network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  // 3) Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    STATIC_EXT.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // 4) Everything else: plain passthrough (browser default).
})
