"use client"

/**
 * R41 · THE GROVE — ambient life.
 *
 * A fixed, pointer-transparent field of warm fireflies and slowly falling
 * leaves that sits above the aurora and behind all content. The whole field
 * is pure CSS animation (transform/opacity only — GPU-composited, no JS per
 * frame). prefers-reduced-motion is honored centrally in globals.css:
 * fireflies fall still at a whisper opacity and leaves are removed outright.
 *
 * Positions/durations are DETERMINISTIC constants (no Math.random at render)
 * so server and client markup always agree.
 */

const FIREFLIES: {
  left: string
  top: string
  size: number
  dur: string
  delay: string
}[] = [
  { left: "7%", top: "16%", size: 5, dur: "7.5s", delay: "0s" },
  { left: "21%", top: "64%", size: 4, dur: "9.2s", delay: "1.4s" },
  { left: "34%", top: "29%", size: 6, dur: "8.1s", delay: "3.1s" },
  { left: "47%", top: "78%", size: 4, dur: "10.4s", delay: "0.8s" },
  { left: "58%", top: "12%", size: 5, dur: "8.8s", delay: "2.2s" },
  { left: "69%", top: "52%", size: 4, dur: "9.7s", delay: "4.6s" },
  { left: "78%", top: "24%", size: 6, dur: "7.9s", delay: "1.9s" },
  { left: "86%", top: "68%", size: 5, dur: "11.2s", delay: "3.7s" },
  { left: "13%", top: "41%", size: 4, dur: "10.1s", delay: "5.3s" },
  { left: "91%", top: "38%", size: 4, dur: "9.4s", delay: "2.8s" },
  { left: "28%", top: "87%", size: 5, dur: "8.4s", delay: "6.2s" },
  { left: "63%", top: "33%", size: 4, dur: "11.8s", delay: "5.7s" },
]

const LEAVES: {
  left: string
  size: number
  dur: string
  delay: string
  opacity: number
  hue: "fern" | "amber" | "sage"
}[] = [
  { left: "12%", size: 13, dur: "29s", delay: "0s", opacity: 0.3, hue: "fern" },
  { left: "31%", size: 10, dur: "37s", delay: "8s", opacity: 0.24, hue: "amber" },
  { left: "52%", size: 15, dur: "33s", delay: "16s", opacity: 0.26, hue: "fern" },
  { left: "68%", size: 11, dur: "41s", delay: "4s", opacity: 0.22, hue: "sage" },
  { left: "84%", size: 13, dur: "35s", delay: "21s", opacity: 0.28, hue: "amber" },
  { left: "44%", size: 9, dur: "44s", delay: "12s", opacity: 0.2, hue: "sage" },
]

const LEAF_FILL: Record<"fern" | "amber" | "sage", string> = {
  fern: "rgba(110, 231, 183, 0.85)",
  amber: "rgba(251, 191, 36, 0.8)",
  sage: "rgba(167, 243, 208, 0.7)",
}

function LeafGlyph({ size, hue }: { size: number; hue: "fern" | "amber" | "sage" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      {/* a simple soft leaf: teardrop blade + center vein */}
      <path
        d="M12 21.5c4.6-3.7 7.4-7.6 7.4-11.4 0-3.9-2.9-6.8-7.4-8.6-4.5 1.8-7.4 4.7-7.4 8.6 0 3.8 2.8 7.7 7.4 11.4z"
        fill={LEAF_FILL[hue]}
      />
      <path
        d="M12 21.5V3.5"
        stroke="rgba(7, 17, 13, 0.55)"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function GroveAmbient() {
  return (
    <div className="grove-field" aria-hidden>
      {LEAVES.map((leaf, i) => (
        <span
          key={`leaf-${i}`}
          className="grove-leaf"
          style={
            {
              left: leaf.left,
              "--leaf-dur": leaf.dur,
              "--leaf-delay": leaf.delay,
              "--leaf-opacity": leaf.opacity,
            } as React.CSSProperties
          }
        >
          <LeafGlyph size={leaf.size} hue={leaf.hue} />
        </span>
      ))}
      {FIREFLIES.map((ff, i) => (
        <span
          key={`ff-${i}`}
          className="firefly"
          style={
            {
              left: ff.left,
              top: ff.top,
              width: ff.size,
              height: ff.size,
              "--ff-dur": ff.dur,
              "--ff-delay": ff.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
