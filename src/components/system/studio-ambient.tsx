"use client"

/**
 * R43 · MIRAGE STUDIO — ambient light.
 *
 * Replaces the retired R41 grove field (fireflies + falling leaves — the
 * nature feel the user asked to remove). studiomirage.io's signature texture
 * is monochrome smoke bleeding in from the edges with rim light on its
 * crests; this layer carries that cue as two fixed, ultra-soft white rim
 * gradients at the very top and bottom edges, breathing on a slow canon.
 * Pure CSS animation (transform/opacity only — GPU-composited, no JS per
 * frame); prefers-reduced-motion is honored centrally in globals.css
 * (.studio-rim animations stand still, opacity pinned at a whisper).
 *
 * Positions/durations are DETERMINISTIC constants (no Math.random at
 * render) so server and client markup always agree.
 */

export function StudioAmbient() {
  return (
    <div className="studio-rim-field" aria-hidden>
      {/* top rim — light cresting in from above the viewport */}
      <div className="studio-rim studio-rim-top" />
      {/* bottom rim — the softer counter-crest, offset in time */}
      <div className="studio-rim studio-rim-bottom" />
    </div>
  )
}
