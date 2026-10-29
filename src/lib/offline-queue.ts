// ─── PRIME · Offline mutation queue (R5 — Resilience round) ──────────────────
// When the link drops, mutating API calls are parked here instead of failing.
// The OfflineIndicator replays them FIFO when connectivity returns, then bumps
// the global refresh key so every panel reloads fresh data.
//
// Plain TS on purpose — no "use client", no React. Every window/localStorage
// access is guarded, so the module is safe to import from server and client
// code alike and never crashes on SSR or in storage-less contexts.

/** localStorage key holding the serialized queue. */
export const QUEUE_STORAGE_KEY = "prime.offline-queue"

/** One persisted mutating request, replayed verbatim on reconnect. */
export type QueuedMutation = {
  id: string
  path: string
  method: string
  body: string | null
  queuedAt: number
}

/** Result of one flush round. */
export type FlushResult = {
  /** Operations the server accepted (2xx) — dropped from the queue. */
  synced: number
  /** Error messages of operations the server rejected (4xx) — dropped too. */
  rejected: string[]
}

export type QueueListener = (count: number) => void

const listeners = new Set<QueueListener>()

// ── storage plumbing (guarded — never throws, never touches window on SSR) ──

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage
  } catch {
    return null // hardened / private-mode browsers can throw on access
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID()
    } catch {
      /* fall through to the manual id */
    }
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isQueuedMutation(v: unknown): v is QueuedMutation {
  if (!v || typeof v !== "object") return false
  const m = v as Record<string, unknown>
  return (
    typeof m.id === "string" &&
    typeof m.path === "string" &&
    typeof m.method === "string" &&
    (m.body === null || typeof m.body === "string") &&
    typeof m.queuedAt === "number"
  )
}

/** Reads and parses the queue safely — corrupt JSON or a wrong shape → empty. */
export function getQueue(): QueuedMutation[] {
  const storage = safeStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: QueuedMutation[] = []
    for (const it of parsed) {
      if (isQueuedMutation(it)) out.push(it)
    }
    return out
  } catch {
    return [] // corrupt JSON — treat as empty rather than bricking the queue
  }
}

function persist(queue: QueuedMutation[]): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // quota exceeded / disabled storage — keep going, next write may land
  }
}

/** Fan the current count out to every subscriber (same-tab writes). */
function notify(): void {
  const count = getQueue().length
  for (const cb of listeners) {
    try {
      cb(count)
    } catch {
      // a misbehaving subscriber must never break queue operations
    }
  }
}

// ── public queue API ─────────────────────────────────────────────────────────

/** Appends a mutation and persists it. Returns the new queue length. */
export function enqueueMutation(path: string, method: string, body: string | null): number {
  const item: QueuedMutation = { id: makeId(), path, method, body, queuedAt: Date.now() }
  const queue = getQueue()
  queue.push(item)
  persist(queue)
  notify()
  return queue.length
}

/** Drops a single item (used by the flush loop). No-op if already gone. */
export function removeById(id: string): void {
  const queue = getQueue()
  const next = queue.filter((it) => it.id !== id)
  if (next.length === queue.length) return
  persist(next)
  notify()
}

/**
 * Subscribe to queue-length changes. Same-tab mutations notify directly;
 * cross-tab writes arrive through the window "storage" event, so every open
 * tab's badge stays in sync. Returns an unsubscribe function.
 */
export function subscribe(cb: QueueListener): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    // key === null ⇒ storage.clear() wiped everything
    if (e.key === null || e.key === QUEUE_STORAGE_KEY) cb(getQueue().length)
  }
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage)
  }
  return () => {
    listeners.delete(cb)
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage)
    }
  }
}

// ── cross-tab flush lease ────────────────────────────────────────────────────
// Two open tabs both reacting to "online" would replay the same queue twice.
// A best-effort localStorage lease (TTL + per-item heartbeat) makes the second
// tab stand down; its badge and data stay honest via the storage-event sync.

const LOCK_KEY = "prime.offline-queue.lock"
const LOCK_TTL_MS = 12_000

function acquireFlushLease(): boolean {
  const storage = safeStorage()
  if (!storage) return true // no storage ⇒ no queue ⇒ nothing to race over
  try {
    const raw = storage.getItem(LOCK_KEY)
    if (raw) {
      const at = Number(raw)
      if (Number.isFinite(at) && Date.now() - at < LOCK_TTL_MS) return false // a live tab owns it
    }
    storage.setItem(LOCK_KEY, String(Date.now()))
    return true
  } catch {
    return true // storage broken — proceed as a single tab
  }
}

function heartbeatFlushLease(): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.setItem(LOCK_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function releaseFlushLease(): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.removeItem(LOCK_KEY)
  } catch {
    /* ignore */
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  let msg: string | null = null
  try {
    const body: unknown = await res.json()
    if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
      msg = (body as { error: string }).error
    }
  } catch {
    /* no parsable body */
  }
  return msg ?? `SERVER REJECTED (${res.status})`
}

/**
 * Replays the queue FIFO. Per item:
 *  - 2xx            → dropped (success, counted in `synced`)
 *  - 4xx            → dropped (server rejected it; message collected in `rejected`)
 *  - ≥500 or thrown → KEPT in the queue, flushing stops for this round
 * Item membership is re-checked before every send and a cross-tab lease guards
 * the whole round, so two tabs never double-replay an operation.
 */
export async function flushQueue(): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, rejected: [] }
  if (typeof window === "undefined") return result
  if (!acquireFlushLease()) return result // another tab is mid-flush

  try {
    const ids = getQueue().map((it) => it.id) // FIFO snapshot
    for (const id of ids) {
      const item = getQueue().find((it) => it.id === id)
      if (!item) continue // another tab already handled it
      heartbeatFlushLease()
      let res: Response
      try {
        res = await fetch(item.path, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: item.body,
        })
      } catch {
        break // network still down — keep the item, retry next round
      }
      if (res.ok) {
        removeById(item.id)
        result.synced += 1
      } else if (res.status >= 500) {
        break // server in trouble — keep the item, retry next round
      } else {
        removeById(item.id) // server rejected it — drop it, surface the reason
        result.rejected.push(await readErrorMessage(res))
      }
    }
  } finally {
    releaseFlushLease()
  }
  return result
}

/**
 * Thrown by the api() helper when a mutating request was parked in the queue
 * instead of sent. Callers surface `message` through their existing error
 * toasts; `queued` marks it as a deferred-success state, not a failure.
 */
export class OfflineQueuedError extends Error {
  readonly queued = true
  constructor(message = "OFFLINE — SAVED TO QUEUE, WILL AUTO-SYNC") {
    super(message)
    this.name = "OfflineQueuedError"
  }
}
