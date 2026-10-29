"use client"

/**
 * R44 · PHASE C — the Gate centerpiece (brief §05, "The central 3D object").
 *
 * An original composition: an obsidian monolith — plinth, shaft, crown —
 * carrying a violet emissive seam, orbited by three sculptural rings
 * (violet identity ×2 + ONE teal data whisper), a seeded deterministic
 * particle field, and an additive violet aura plane. It responds only to
 * REAL application state:
 *
 *   ready   — the /api/hunter probe confirmed an awakened profile → the
 *             core IGNITES (seam, rings, key light and aura lerp up).
 *   entered — the user tapped ENTER → the camera pushes in, rings surge,
 *             the seam flares for the exit transition.
 *
 * No fabricated progression values. Pointer parallax is fed by the parent
 * (a ref of normalized -1..1 coords — window-level listener, so the Canvas
 * itself never captures events). Reduced-motion users never mount this
 * file: the gate renders its CSS composition instead. Loaded via
 * next/dynamic ssr:false — three.js never enters the server bundle and
 * never blocks first paint; disposal happens on unmount (texture +
 * geometry freed, brief §11).
 */

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { AdditiveBlending, CanvasTexture, MathUtils } from "three"
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Points } from "three"

export type GateSceneProps = {
  /** awakened profile confirmed — ignite the core */
  ready: boolean
  /** user tapped ENTER — camera push + energy surge */
  entered: boolean
  /** normalized pointer coords (-1..1), owned by the parent (LIVE ref) */
  pointer: RefObject<{ x: number; y: number }>
  /** fewer particles + dpr 1 on modest hardware */
  lowPower: boolean
}

/** Deterministic LCG — NO Math.random: particle positions are stable
 *  across mounts (and this module is client-only anyway). */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function Core({ ready, entered, pointer, lowPower }: GateSceneProps) {
  const outer = useRef<Group>(null!)
  const monolith = useRef<Group>(null!)
  const ringA = useRef<Group>(null!)
  const ringB = useRef<Group>(null!)
  const ringC = useRef<Group>(null!)
  const seamMat = useRef<MeshStandardMaterial>(null!)
  const ringAMat = useRef<MeshStandardMaterial>(null!)
  const auraMat = useRef<MeshBasicMaterial>(null!)
  const violetLight = useRef<PointLight>(null!)
  const particles = useRef<Points>(null!)

  /* aura texture — radial violet gradient on a canvas, additive-blended */
  const auraTexture = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 256
    const ctx = c.getContext("2d")
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126)
      g.addColorStop(0, "rgba(196,181,253,0.85)")
      g.addColorStop(0.32, "rgba(139,92,246,0.34)")
      g.addColorStop(1, "rgba(139,92,246,0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 256, 256)
    }
    return new CanvasTexture(c)
  }, [])
  useEffect(() => () => auraTexture.dispose(), [auraTexture])

  /* seeded particle shell around the monolith */
  const particlePositions = useMemo(() => {
    const rng = makeRng(1917)
    const n = lowPower ? 70 : 150
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2
      const r = 2.15 + rng() * 1.45
      arr[i * 3] = Math.cos(a) * r
      arr[i * 3 + 1] = (rng() - 0.5) * 4.4
      arr[i * 3 + 2] = Math.sin(a) * r * 0.72 - 0.5
    }
    return arr
  }, [lowPower])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const cam = state.camera
    const px = pointer.current.x
    const py = pointer.current.y

    /* parallax — the whole composition leans gently toward the pointer */
    if (outer.current) {
      outer.current.rotation.x = MathUtils.damp(outer.current.rotation.x, py * 0.085, 2.2, dt)
      outer.current.rotation.y = MathUtils.damp(outer.current.rotation.y, px * 0.16, 2.2, dt)
    }
    if (monolith.current) monolith.current.rotation.y += dt * 0.085
    if (ringA.current) ringA.current.rotation.z += dt * (entered ? 1.35 : 0.16)
    if (ringB.current) ringB.current.rotation.z -= dt * (entered ? 0.85 : 0.1)
    if (ringC.current) ringC.current.rotation.z += dt * 0.22
    if (particles.current) particles.current.rotation.y += dt * 0.028

    /* camera — slow float; ENTER pushes the viewer toward the core */
    cam.position.z = MathUtils.damp(cam.position.z, entered ? 4.55 : 6.2, 2.4, dt)
    cam.position.y = MathUtils.damp(cam.position.y, 0.55 + Math.sin(t * 0.35) * 0.06, 3, dt)
    cam.position.x = MathUtils.damp(cam.position.x, px * 0.3, 2.2, dt)
    cam.lookAt(0, 0.15, 0)

    /* ignition — dormant → awake; entered adds the flare */
    const glow = ready ? 1 : 0
    const surge = entered ? 1 : 0
    if (seamMat.current) {
      seamMat.current.emissiveIntensity = MathUtils.damp(
        seamMat.current.emissiveIntensity,
        0.55 + glow * 1.9 + surge * 2.6,
        3,
        dt,
      )
    }
    if (violetLight.current) {
      violetLight.current.intensity = MathUtils.damp(violetLight.current.intensity, 5 + glow * 9 + surge * 6, 3, dt)
    }
    if (ringAMat.current) {
      ringAMat.current.emissiveIntensity = MathUtils.damp(ringAMat.current.emissiveIntensity, 0.45 + glow * 1.15, 3, dt)
    }
    if (auraMat.current) {
      auraMat.current.opacity = MathUtils.damp(auraMat.current.opacity, 0.34 + glow * 0.3 + surge * 0.18, 3, dt)
    }
  })

  return (
    <>
      {/* lighting — cool white key, violet rim (the identity light), teal data whisper */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 4, 5]} intensity={0.85} color="#f4f4f8" />
      <pointLight ref={violetLight} position={[-3.2, 1.4, -2.4]} color="#8b5cf6" intensity={5} distance={10} decay={2} />
      <pointLight position={[2.6, -1.9, 1.6]} color="#2dd4bf" intensity={0.5} distance={7} decay={2} />

      <group ref={outer}>
        {/* the monolith — plinth, under-plinth, shaft, crown */}
        <group ref={monolith}>
          <mesh position={[0, -1.84, 0]}>
            <boxGeometry args={[1.9, 0.18, 1.18]} />
            <meshStandardMaterial color="#0c0c14" metalness={0.62} roughness={0.42} />
          </mesh>
          <mesh position={[0, -1.62, 0]}>
            <boxGeometry args={[1.6, 0.26, 1.0]} />
            <meshStandardMaterial color="#0e0e17" metalness={0.62} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1.05, 3.0, 0.66]} />
            <meshStandardMaterial color="#0e0e17" metalness={0.62} roughness={0.38} />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[0.46, 0.12, 0.3]} />
            <meshStandardMaterial color="#12121c" metalness={0.68} roughness={0.32} />
          </mesh>

          {/* the seam — the core's violet pulse line on the front face */}
          <mesh position={[0, 0, 0.342]}>
            <boxGeometry args={[0.045, 2.2, 0.018]} />
            <meshStandardMaterial
              ref={seamMat}
              color="#0e0e17"
              emissive="#a78bfa"
              emissiveIntensity={0.55}
              toneMapped={false}
            />
          </mesh>
          {/* architectural hairline ticks */}
          <mesh position={[0, 0.98, 0.342]}>
            <boxGeometry args={[0.3, 0.014, 0.016]} />
            <meshStandardMaterial color="#0e0e17" emissive="#c4b5fd" emissiveIntensity={0.7} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.98, 0.342]}>
            <boxGeometry args={[0.3, 0.014, 0.016]} />
            <meshStandardMaterial color="#0e0e17" emissive="#c4b5fd" emissiveIntensity={0.7} toneMapped={false} />
          </mesh>
        </group>

        {/* ring A — primary identity orbit */}
        <group ref={ringA} rotation={[1.18, 0, 0.35]}>
          <mesh>
            <torusGeometry args={[1.72, 0.013, 8, 128]} />
            <meshStandardMaterial
              ref={ringAMat}
              color="#141420"
              metalness={0.7}
              roughness={0.3}
              emissive="#8b5cf6"
              emissiveIntensity={0.45}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* ring B — the teal data whisper, counter-rotating */}
        <group ref={ringB} rotation={[-0.96, 0.4, -0.3]}>
          <mesh>
            <torusGeometry args={[2.12, 0.009, 8, 128]} />
            <meshStandardMaterial
              color="#141420"
              metalness={0.7}
              roughness={0.3}
              emissive="#2dd4bf"
              emissiveIntensity={0.38}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* ring C — inner fast orbit */}
        <group ref={ringC} rotation={[1.45, 0, -0.2]}>
          <mesh>
            <torusGeometry args={[1.32, 0.007, 8, 96]} />
            <meshStandardMaterial
              color="#141420"
              metalness={0.7}
              roughness={0.3}
              emissive="#c4b5fd"
              emissiveIntensity={0.55}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* particle shell — drifting motes in the void */}
        <points ref={particles}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.045}
            color="#c9b8ff"
            transparent
            opacity={0.5}
            sizeAttenuation
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>

      {/* the aura — additive violet breath behind everything */}
      <mesh position={[0, 0.2, -1.3]}>
        <planeGeometry args={[6.2, 6.2]} />
        <meshBasicMaterial
          ref={auraMat}
          map={auraTexture}
          transparent
          opacity={0.34}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}

export default function GateScene(props: GateSceneProps) {
  return (
    <Canvas
      dpr={props.lowPower ? 1 : [1, 1.75]}
      camera={{ position: [0, 0.55, 6.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <Core {...props} />
    </Canvas>
  )
}
