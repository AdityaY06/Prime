import { NextResponse } from "next/server"

// POST /api/tts — { text } → audio/wav
// The voice of the System. Server-side only; announces rewards, ascensions
// and records with the "jam" persona (measured, British, inhumanly calm).

export const dynamic = "force-dynamic"

const MAX_CHARS = 400
const MAX_CACHE = 48

/** In-memory LRU-ish cache: announcement text → WAV buffer. */
const cache = new Map<string, Buffer>()

function audioHeaders(len: number): Record<string, string> {
  return {
    "Content-Type": "audio/wav",
    "Content-Length": String(len),
    "Cache-Control": "no-store",
  }
}

/** Keep only pronounceable characters — the System does not read emoji or runes. */
function sanitize(raw: string): string {
  return raw
    .replace(/[◈⛓×◇◆]/g, " ")
    .replace(/[^\w\s.,!?'"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const text = typeof body?.text === "string" ? sanitize(body.text) : ""
    if (!text) {
      return NextResponse.json({ error: "NOTHING TO SPEAK." }, { status: 400 })
    }

    const hit = cache.get(text)
    if (hit) {
      // refresh LRU position
      cache.delete(text)
      cache.set(text, hit)
      return new NextResponse(new Uint8Array(hit), { headers: audioHeaders(hit.length) })
    }

    const ZAI = (await import("z-ai-web-dev-sdk")).default
    const zai = await ZAI.create()

    const response = await zai.audio.tts.create({
      input: text,
      voice: "jam",
      speed: 1.0,
      response_format: "wav",
      stream: false,
    })

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(new Uint8Array(arrayBuffer))
    if (buffer.length < 100) {
      throw new Error("empty audio payload")
    }

    // evict oldest entry when full
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(text, buffer)

    return new NextResponse(new Uint8Array(buffer), { headers: audioHeaders(buffer.length) })
  } catch (e) {
    console.error("POST /api/tts", e)
    return NextResponse.json({ error: "THE SYSTEM IS MUTE. Try again." }, { status: 500 })
  }
}
