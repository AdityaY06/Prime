"use client"

import { motion } from "framer-motion"

// R43 · MIRAGE STUDIO — the boot moment is a studio being prepared for the
// session: professional, quiet, unhurried. Copy, type and motion still
// breathe; the line list still paces the profile fetch the same way.
const LINES = [
  "Loading your training log",
  "Reading today's targets",
  "Calibrating readiness",
  "Retrieving your directives",
  "Counting yesterday's sessions",
  "Reviewing your progress",
]

/** Shown while the initial profile fetch resolves. */
export function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center px-6" role="status" aria-label="Preparing your studio">
      <div className="w-full max-w-sm text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="grove-breathe mx-auto mb-5 inline-block"
          aria-hidden
        >
          <span className="block h-3 w-3 rounded-full bg-zinc-100" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="sys-label text-violet-300/80"
        >
          PRIME · TRAINING STUDIO
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 font-display text-4xl font-semibold text-glow-violet"
        >
          Preparing your studio
        </motion.h1>
        <div className="mt-8 space-y-2.5 text-left text-[12px] font-semibold text-zinc-400">
          {LINES.map((l, i) => (
            <motion.p
              key={l}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-between"
            >
              <span>{l}</span>
              <span className="text-violet-300" aria-hidden>
                ✦
              </span>
            </motion.p>
          ))}
        </div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
          className="grove-flow mt-7 h-[3px] rounded-full bg-gradient-to-r from-transparent via-violet-400 to-amber-400"
        />
      </div>
    </div>
  )
}
