"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSystem } from "@/store/system-store"
import { enqueueMutation, OfflineQueuedError } from "@/lib/offline-queue"

const MUTATING_METHOD = /^(POST|PUT|PATCH|DELETE)$/i

/** Small JSON fetch helper that surfaces server error messages. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // OFFLINE QUEUE — mutating requests never hard-fail while the link is down:
  // they are persisted here and replayed FIFO when connectivity returns. The
  // thrown message is surfaced by callers' existing catch-blocks (toasts), so
  // it reads as a system status, not an error. GETs pass straight through.
  const method = init?.method
  if (
    method &&
    MUTATING_METHOD.test(method) &&
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  ) {
    const pending = enqueueMutation(
      path,
      method.toUpperCase(),
      typeof init?.body === "string" ? init.body : null,
    )
    throw new OfflineQueuedError(`OFFLINE — SAVED TO QUEUE (${pending} PENDING), WILL AUTO-SYNC`)
  }
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `Request failed (${res.status})`
    throw new Error(msg)
  }
  return body as T
}

/**
 * Fetches a path and refetches whenever the global refresh key changes.
 *
 * RACE-SAFE by generation counter: every `load` bumps `genRef` at start and
 * re-checks it after each `await` — a stale response (slow fetch from an old
 * path, or a rapid refreshKey burst) can never overwrite the state a newer
 * load owns. A `path` switch to `null` resets data/error/loading so a consumer
 * unmounting its query never shows stale data on remount.
 */
export function useApi<T>(path: string | null) {
  const refreshKey = useSystem((s) => s.refreshKey)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(path !== null)
  /** Monotonic generation — only the newest load may touch state. */
  const genRef = useRef(0)

  const load = useCallback(
    async (silent = false) => {
      const gen = ++genRef.current
      // null path = the consumer unmounted its query (e.g. a view switching
      // its source away): reset state so no stale data survives the remount
      if (path === null) {
        setData(null)
        setError(null)
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      try {
        const d = await api<T>(path)
        if (gen !== genRef.current) return // a newer load owns the state now
        setData(d)
        setError(null)
      } catch (e) {
        if (gen !== genRef.current) return
        setError((e as Error).message)
      } finally {
        if (gen === genRef.current) setLoading(false)
      }
    },
    [path]
  )

  useEffect(() => {
    // silent=true on refresh-key reloads: keeps `loading` false so panels never
    // unmount mid-interaction (no boot-screen flash, no local view-state loss)
    load(refreshKey > 0)
  }, [load, refreshKey])

  // stable identity: memoized consumers (effects/deps arrays) don't re-fire on
  // every render just because `reload` was a fresh arrow each time
  const reload = useCallback(() => void load(true), [load])

  return { data, error, loading, reload }
}
