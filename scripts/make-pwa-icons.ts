// One-off R2-c script: derive PWA icons from the generated 1024 master.
// NOT part of src/ — run once with: bun scripts/make-pwa-icons.ts
import sharp from "sharp"
import { mkdirSync, existsSync, unlinkSync } from "node:fs"

const RAW = "/tmp/r2c-icons/prime-raw.png"
const OUT_ICONS = "public/icons"
const OUT_APPLE = "public/apple-touch-icon.png"

mkdirSync(OUT_ICONS, { recursive: true })

// ── helpers ───────────────────────────────────────────────────────────────────
async function extract(src: string, size: number) {
  // Crop to a centered square, then resize.
  const img = sharp(src)
  const meta = await img.metadata()
  const side = Math.min(meta.width ?? size, meta.height ?? size)
  const left = Math.round(((meta.width ?? size) - side) / 2)
  const top = Math.round(((meta.height ?? size) - side) / 2)
  return sharp(src)
    .extract({ left, top, width: side, height: side })
    .resize(size, size, { fit: "cover", position: "centre" })
}

async function makeRegular(src: string, size: number, out: string) {
  // Regular "any purpose" icon: emblem fills the canvas.
  await (await extract(src, size)).png({ compressionLevel: 9 }).toFile(out)
  console.log(`✓ ${out} (${size}×${size})`)
}

async function makeMaskable(src: string, size: number, out: string) {
  // Maskable icon: full-bleed background with the emblem scaled into the
  // ~78% safe zone (maskable safe zone is a centered circle of 80% diameter;
  // 78% linear scale keeps the emblem inside it with margin).
  const emblemSide = Math.round(size * 0.78)
  const emblem = await (await extract(src, emblemSide)).png().toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      // match the zinc-950-ish art background so the bleed is seamless
      background: { r: 10, g: 10, b: 15, alpha: 1 },
    },
  })
    .composite([{ input: emblem, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`✓ ${out} (${size}×${size}, emblem @78%)`)
}

// ── build ─────────────────────────────────────────────────────────────────────
await makeRegular(RAW, 192, `${OUT_ICONS}/icon-192.png`)
await makeRegular(RAW, 512, `${OUT_ICONS}/icon-512.png`)
await makeMaskable(RAW, 512, `${OUT_ICONS}/icon-maskable-512.png`)
await makeRegular(RAW, 180, OUT_APPLE)

// verify dimensions
for (const f of [
  `${OUT_ICONS}/icon-192.png`,
  `${OUT_ICONS}/icon-512.png`,
  `${OUT_ICONS}/icon-maskable-512.png`,
  OUT_APPLE,
]) {
  const m = await sharp(f).metadata()
  console.log(`${f}: ${m.width}×${m.height}`)
}

// raw master is not referenced by the app — remove it
if (existsSync(RAW)) {
  unlinkSync(RAW)
  console.log("✓ raw 1024 master deleted")
}
