import { createHash, timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// ─── R56 · POST /api/admin/curate — the guarded curation path ────────────────
// WHY THIS EXISTS: early dev rounds left throwaway profiles on this device's
// DB ("Kael" the empty duplicate, "sdfgh", "sdfghj") that pollute the WORLD
// standings. The doctrine is HONEST DATA ONLY — but the fix must not be a
// manual `sqlite` write either: every mutation goes through a route with an
// auditable, narrow contract. This is that route.
//
// THE GUARD (server-side only, never shipped to any client):
//   • db/admin-token.txt holds a random secret (gitignored; chmod 600).
//   • The request must carry it in the x-admin-token header.
//   • Comparison is hash-then-timingSafeEqual (no early-exit string compare).
//   • If the token file does not exist the route answers 404 — to an
//     unauthenticated prober there is no such endpoint at all.
//
// THE CONTRACT (deliberately minimal — ONE flag, ONE hunter, per call):
//   body: { name: string, leaderboardOptOut: boolean }
//   • Resolves the hunter by NAME (globally unique in the schema).
//   • Writes ONLY leaderboardOptOut — no XP, no essence, no deletion. The
//     profile and all its data stay intact; it just leaves the boards.
//   • Responds { ok, name, leaderboardOptOut } so the caller can verify.
//
// The hunter's own eye-toggle (PATCH /api/hunter) is the self-service path;
// this route exists for profiles whose device no longer drives them.

const TOKEN_PATH = path.join(process.cwd(), "db", "admin-token.txt")

/** Hash-then-timing-safe compare — constant-time on the digest. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  try {
    // the guard — no token file, no endpoint (404, not 401)
    let secret: string
    try {
      secret = (await readFile(TOKEN_PATH, "utf8")).trim()
    } catch {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
    }
    if (!secret) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

    const provided = req.headers.get("x-admin-token") ?? ""
    if (!provided || !tokenMatches(provided, secret)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    if (name.length < 2 || name.length > 24) {
      return NextResponse.json({ error: "Name must be 2–24 characters." }, { status: 400 })
    }
    if (typeof body?.leaderboardOptOut !== "boolean") {
      return NextResponse.json(
        { error: "leaderboardOptOut must be a boolean." },
        { status: 400 },
      )
    }

    const hunter = await db.hunter.update({
      where: { name },
      data: { leaderboardOptOut: body.leaderboardOptOut },
      select: { id: true, name: true, leaderboardOptOut: true },
    })

    return NextResponse.json({
      ok: true,
      name: hunter.name,
      leaderboardOptOut: hunter.leaderboardOptOut,
    })
  } catch (e) {
    // unknown name → Prisma P2025; surface it as a plain 404-style miss
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "No hunter by that name." }, { status: 404 })
    }
    console.error("POST /api/admin/curate", e?.constructor?.name)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
