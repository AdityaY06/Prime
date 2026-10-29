// ── Play Store graphics builder (R32) ────────────────────────────────────────
// Composes the AI art bases (play-assets/_art-*.png — generated text-free via
// the image-generation CLI) with crisp SVG typography overlays via sharp, so
// the store assets carry a pixel-perfect wordmark that AI never had to draw.
//
//   bun scripts/play-graphics.ts
//
// Outputs (Play Store exact specs):
//   play-assets/feature-graphic.png — 1024×500, 24-bit PNG, no alpha
//   play-assets/hi-res-icon.png     — 512×512, 32-bit PNG
//
// Palette discipline = the app's: charcoal zinc-950 base, violet/fuchsia/teal
// accents, zinc text ramp — NO indigo/blue anywhere (house rule).

import sharp from "sharp"

const C = {
  bg: "#09090b", // zinc-950
  white: "#fafafa",
  zinc300: "#d4d4d8",
  zinc500: "#71717a",
  violet: "#8b5cf6",
  fuchsia: "#d946ef",
  teal: "#2dd4bf",
} as const

const FONT = "Liberation Mono, DejaVu Sans Mono, FreeMono, monospace"

/** Three ascending rank bars — the app's rank/D-rank motif, shared by both assets. */
function rankChevrons(x: number, yBaseline: number, barW: number, gap: number): string {
  const heights = [16, 26, 36]
  const colors = [C.violet, C.fuchsia, C.teal]
  return heights
    .map((h, i) => {
      const bx = x + i * (barW + gap)
      return `<rect x="${bx}" y="${yBaseline - h}" width="${barW}" height="${h}" rx="1.5" fill="${colors[i]}"/>`
    })
    .join("")
}

async function buildFeatureGraphic(): Promise<void> {
  const W = 1024
  const H = 500

  // 1. Art resized to full canvas height, anchored at the right edge — the
  //    athlete silhouette survives uncropped (no vertical center-crop that
  //    would clip the jump apex).
  const artBuffer = await sharp("play-assets/_art-feature.png")
    .resize({ height: H, width: Math.round((1344 / 768) * H) })
    .toBuffer()
  const artW = Math.round((1344 / 768) * H) // 875

  // 2. Charcoal canvas + art + left scrim gradient (guarantees wordmark
  //    contrast regardless of how the generated art's left side came out).
  const scrim = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${C.bg}" stop-opacity="0.97"/>
        <stop offset="0.42" stop-color="${C.bg}" stop-opacity="0.88"/>
        <stop offset="0.72" stop-color="${C.bg}" stop-opacity="0"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`,
  )

  // 3. Typography overlay — wordmark, tagline, keyword row (mono terminal
  //    aesthetic, wide tracking, left-anchored inside the scrim zone).
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${rankChevrons(66, 178, 10, 6)}
      <text x="64" y="270" font-family="${FONT}" font-size="88" font-weight="bold"
            letter-spacing="14" fill="${C.white}">PRIME</text>
      <text x="66" y="314" font-family="${FONT}" font-size="17" font-weight="bold"
            letter-spacing="6" fill="${C.zinc300}">ADAPTIVE TRAINING SYSTEM</text>
      <text x="66" y="456" font-family="${FONT}" font-size="13"
            letter-spacing="5" fill="${C.zinc500}">SENSOR · ASCENT · FUEL · RECOVERY</text>
      <rect x="66" y="336" width="180" height="3" rx="1.5" fill="${C.violet}" fill-opacity="0.9"/>
    </svg>`,
  )

  await sharp({
    create: { width: W, height: H, channels: 4, background: C.bg },
  })
    .composite([
      { input: artBuffer, left: W - artW, top: 0 },
      { input: scrim },
      { input: overlay },
    ])
    .removeAlpha() // Play feature graphic = 24-bit PNG, no alpha
    .png({ compressionLevel: 9 })
    .toFile("play-assets/feature-graphic.png")

  const meta = await sharp("play-assets/feature-graphic.png").metadata()
  console.log(`feature-graphic.png: ${meta.width}x${meta.height} channels=${meta.channels}`)
}

async function buildHiResIcon(): Promise<void> {
  const S = 512

  // Soft scrim disc behind the glyph — contrast safety over the art's glow.
  const scrim = Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="256" cy="238" r="168" fill="${C.bg}" fill-opacity="0.5"/>
    </svg>`,
  )

  // Bold P monogram + the shared rank-bar motif. Cap-height of bold mono ≈
  // 0.72em → baseline at 256 + 0.72×300/2 ≈ 364 centers the glyph.
  const overlay = Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <text x="256" y="364" font-family="${FONT}" font-size="300" font-weight="bold"
            fill="${C.white}" text-anchor="middle">P</text>
      ${rankChevrons(195, 452, 34, 10)}
    </svg>`,
  )

  await sharp("play-assets/_art-icon.png")
    .resize(S, S)
    .composite([{ input: scrim }, { input: overlay }])
    .png({ compressionLevel: 9 })
    .toFile("play-assets/hi-res-icon.png")

  const meta = await sharp("play-assets/hi-res-icon.png").metadata()
  console.log(`hi-res-icon.png: ${meta.width}x${meta.height} channels=${meta.channels}`)
}

async function main(): Promise<void> {
  await buildFeatureGraphic()
  await buildHiResIcon()
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
