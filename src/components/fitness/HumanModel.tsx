'use client';

import { createContext, useContext, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { MuscleId } from '@/lib/fitness/types';
import { MUSCLE_MAP } from '@/lib/fitness/data/muscles';

/* ---------- heat colour: 0 sets → zinc, ramp to emerald at MAV ---------- */
function heatColor(sets: number, mav: number): string {
  if (sets <= 0) return '#52525b';
  const t = Math.min(1, sets / Math.max(1, mav));
  const mix = (a: string, b: string, k: number) => {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
    return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  return t < 0.55 ? mix('#52525b', '#b45309', t / 0.55) : mix('#b45309', '#fbbf24', (t - 0.55) / 0.45);
}

/* ---------- material context ---------- */
interface MatSpec {
  color: string;
  emissive: string;
  emissiveIntensity: number;
}
const MatCtx = createContext<MatSpec>({ color: '#52525b', emissive: '#000000', emissiveIntensity: 0 });

type Vec = [number, number, number];

function Shape({
  as = 'capsule',
  args,
  position,
  rotation,
  scale,
}: {
  as?: 'capsule' | 'sphere' | 'box';
  args: number[];
  position: Vec;
  rotation?: Vec;
  scale?: Vec;
}) {
  const m = useContext(MatCtx);
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      {as === 'capsule' ? (
        <capsuleGeometry args={[args[0], args[1], 6, 12]} />
      ) : as === 'sphere' ? (
        <sphereGeometry args={[args[0], 24, 18]} />
      ) : (
        <boxGeometry args={[args[0], args[1], args[2]]} />
      )}
      <meshStandardMaterial
        color={m.color}
        emissive={m.emissive}
        emissiveIntensity={m.emissiveIntensity}
        roughness={0.5}
        metalness={0.2}
      />
    </mesh>
  );
}

function MuscleGroup({
  id,
  sets,
  selected,
  hover,
  onSelect,
  onHover,
  children,
}: {
  id: MuscleId;
  sets: number;
  selected: boolean;
  hover: boolean;
  onSelect: (m: MuscleId) => void;
  onHover: (m: MuscleId | null, e?: { clientX: number; clientY: number }) => void;
  children: React.ReactNode;
}) {
  const meta = MUSCLE_MAP[id];
  const color = selected ? '#fbbf24' : hover ? '#84e1bc' : heatColor(sets, meta.mav);
  const spec: MatSpec = {
    color,
    emissive: selected ? '#f59e0b' : hover ? '#fbbf24' : '#000000',
    emissiveIntensity: selected ? 0.4 : hover ? 0.3 : 0,
  };
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(id, { clientX: e.clientX, clientY: e.clientY });
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (hover) onHover(id, { clientX: e.clientX, clientY: e.clientY });
      }}
      onPointerOut={() => onHover(null)}
    >
      <MatCtx.Provider value={spec}>{children}</MatCtx.Provider>
    </group>
  );
}

/* ---------- non-interactive base skeleton (sex-aware proportions) ---------- */
function BaseParts({ sex = 'male' }: { sex?: 'male' | 'female' }) {
  const spec: MatSpec = { color: '#3f3f46', emissive: '#000000', emissiveIntensity: 0 };
  const hair: MatSpec = { color: '#27272a', emissive: '#000000', emissiveIntensity: 0 };
  const f = sex === 'female';
  return (
    <MatCtx.Provider value={spec}>
      {/* head + neck */}
      <Shape as="sphere" args={[0.115]} position={[0, 1.66, 0]} />
      <Shape as="capsule" args={[0.055, 0.09]} position={[0, 1.52, 0]} />
      {/* torso + pelvis — female: wider pelvis */}
      <Shape as="capsule" args={[0.15, 0.28]} position={[0, 1.25, 0]} />
      <Shape as="sphere" args={[0.13]} position={[0, 0.95, 0]} scale={f ? [1.15, 0.85, 0.85] : [1, 0.85, 0.85]} />
      {f && (
        <>
          {/* subtle bust hint — base geometry, deliberately NOT an interactive muscle */}
          <Shape as="sphere" args={[0.055]} position={[-0.05, 1.3, 0.125]} scale={[1, 0.9, 0.75]} />
          <Shape as="sphere" args={[0.055]} position={[0.05, 1.3, 0.125]} scale={[1, 0.9, 0.75]} />
        </>
      )}
      {/* hands — female: inset to track the narrower arms */}
      <Shape as="sphere" args={[0.055]} position={f ? [-0.253, 0.75, 0] : [-0.275, 0.75, 0]} />
      <Shape as="sphere" args={[0.055]} position={f ? [0.253, 0.75, 0] : [0.275, 0.75, 0]} />
      {/* feet */}
      <Shape as="box" args={[0.09, 0.06, 0.19]} position={[-0.085, 0.03, 0.05]} />
      <Shape as="box" args={[0.09, 0.06, 0.19]} position={[0.085, 0.03, 0.05]} />
      {/* hair hint — female only, non-interactive, kept inside the head silhouette */}
      {f && (
        <MatCtx.Provider value={hair}>
          <Shape as="sphere" args={[0.12]} position={[0, 1.665, -0.018]} scale={[1, 0.95, 1.08]} />
          <Shape as="capsule" args={[0.07, 0.09]} position={[0, 1.575, -0.055]} />
        </MatCtx.Provider>
      )}
    </MatCtx.Provider>
  );
}

export function MuscleFigure({
  sets,
  selected,
  onSelect,
  className,
  sex = 'male',
}: {
  sets: Record<MuscleId, number>;
  selected: MuscleId | null;
  onSelect: (m: MuscleId | null) => void;
  className?: string;
  sex?: 'male' | 'female';
}) {
  const [hover, setHover] = useState<{ id: MuscleId; x: number; y: number } | null>(null);
  const [auto, setAuto] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x0: 0, y0: 0, dist: 0 });
  const f = sex === 'female';

  const onHover = (m: MuscleId | null, e?: { clientX: number; clientY: number }) => {
    if (!m || !e) {
      setHover(null);
      return;
    }
    const rect = wrap.current?.getBoundingClientRect();
    setHover({ id: m, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
  };

  const guard = (fn: () => void) => () => {
    if (drag.current.dist < 8) fn();
  };

  const S = (id: MuscleId, children: React.ReactNode) => (
    <MuscleGroup
      id={id}
      sets={sets[id] ?? 0}
      selected={selected === id}
      hover={hover?.id === id}
      onSelect={guard(() => onSelect(selected === id ? null : id))}
      onHover={onHover}
    >
      {children}
    </MuscleGroup>
  );

  return (
    <div
      ref={wrap}
      data-sex={sex}
      className={className}
      style={{ cursor: hover ? 'pointer' : 'grab' }}
      onPointerDown={(e) => {
        drag.current = { down: true, x0: e.clientX, y0: e.clientY, dist: 0 };
        setAuto(false);
      }}
      onPointerMove={(e) => {
        if (drag.current.down)
          drag.current.dist = Math.hypot(e.clientX - drag.current.x0, e.clientY - drag.current.y0);
      }}
      onPointerUp={() => {
        drag.current.down = false;
        window.setTimeout(() => setAuto(true), 2500);
      }}
    >
      <Canvas
        camera={{ position: [0.35, 1.3, 2.95], fov: 32 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => guard(() => onSelect(null))()}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[2.5, 3, 4]} intensity={1.15} color="#fefce8" />
        <directionalLight position={[-3, 2, -4]} intensity={0.65} color="#fbbf24" />
        <directionalLight position={[0, -2, 2]} intensity={0.25} color="#ffffff" />

        <group position={[0, -0.9, 0]}>
          <BaseParts sex={sex} />

          {S('traps', (
            /* female: narrower shoulder shelf */
            <group scale={f ? [0.9, 1, 1] : undefined}>
              <Shape as="box" args={[0.1, 0.055, 0.055]} position={[-0.085, 1.43, -0.015]} rotation={[0, 0, 0.3]} />
              <Shape as="box" args={[0.1, 0.055, 0.055]} position={[0.085, 1.43, -0.015]} rotation={[0, 0, -0.3]} />
            </group>
          ))}
          {S('shoulders', (
            /* female: narrower delts, pulled in (x-only group scale so y-positions stay put) */
            <group scale={f ? [0.9, 1, 1] : undefined}>
              <Shape as="sphere" args={[0.075]} position={[-0.215, 1.43, 0]} scale={f ? [1, 0.95, 0.95] : undefined} />
              <Shape as="sphere" args={[0.075]} position={[0.215, 1.43, 0]} scale={f ? [1, 0.95, 0.95] : undefined} />
            </group>
          ))}
          {S('chest', (
            /* female: slightly smaller pec boxes (bust hint lives in BaseParts) */
            <group scale={f ? [0.88, 1, 1] : undefined}>
              <Shape as="box" args={[0.15, 0.095, 0.055]} position={[-0.082, 1.335, 0.125]} scale={f ? [1, 0.92, 0.95] : undefined} />
              <Shape as="box" args={[0.15, 0.095, 0.055]} position={[0.082, 1.335, 0.125]} scale={f ? [1, 0.92, 0.95] : undefined} />
            </group>
          ))}
          {S('abs', <Shape as="box" args={[0.165, 0.21, 0.05]} position={[0, 1.12, 0.125]} />)}
          {S('obliques', (
            <>
              <Shape as="box" args={[0.055, 0.2, 0.05]} position={[-0.108, 1.12, 0.09]} />
              <Shape as="box" args={[0.055, 0.2, 0.05]} position={[0.108, 1.12, 0.09]} />
            </>
          ))}
          {S('lats', (
            <>
              <Shape as="box" args={[0.1, 0.22, 0.055]} position={[-0.098, 1.27, -0.125]} rotation={[0, 0, 0.1]} />
              <Shape as="box" args={[0.1, 0.22, 0.055]} position={[0.098, 1.27, -0.125]} rotation={[0, 0, -0.1]} />
            </>
          ))}
          {S('lowerBack', <Shape as="box" args={[0.15, 0.23, 0.05]} position={[0, 1.16, -0.125]} />)}
          {S('biceps', (
            /* female: narrower arms */
            <group scale={f ? [0.92, 1, 1] : undefined}>
              <Shape as="capsule" args={[0.055, 0.16]} position={[-0.245, 1.22, 0.02]} rotation={[0, 0, 0.08]} />
              <Shape as="capsule" args={[0.055, 0.16]} position={[0.245, 1.22, 0.02]} rotation={[0, 0, -0.08]} />
            </group>
          ))}
          {S('triceps', (
            <group scale={f ? [0.92, 1, 1] : undefined}>
              <Shape as="capsule" args={[0.05, 0.16]} position={[-0.25, 1.21, -0.035]} rotation={[0, 0, 0.08]} />
              <Shape as="capsule" args={[0.05, 0.16]} position={[0.25, 1.21, -0.035]} rotation={[0, 0, -0.08]} />
            </group>
          ))}
          {S('forearms', (
            <group scale={f ? [0.92, 1, 1] : undefined}>
              <Shape as="capsule" args={[0.048, 0.14]} position={[-0.272, 0.93, 0]} rotation={[0, 0, 0.05]} />
              <Shape as="capsule" args={[0.048, 0.14]} position={[0.272, 0.93, 0]} rotation={[0, 0, -0.05]} />
            </group>
          ))}
          {S('glutes', (
            /* female: wider, rounder glutes */
            <group scale={f ? [1.15, 1, 1] : undefined}>
              <Shape as="sphere" args={[0.085]} position={[-0.062, 0.93, -0.07]} scale={f ? [1, 1.05, 1.1] : undefined} />
              <Shape as="sphere" args={[0.085]} position={[0.062, 0.93, -0.07]} scale={f ? [1, 1.05, 1.1] : undefined} />
            </group>
          ))}
          {S('quads', (
            /* female: slightly thicker legs */
            <group scale={f ? [1.05, 1, 1] : undefined}>
              <Shape as="capsule" args={[0.075, 0.2]} position={[-0.088, 0.66, 0.02]} scale={f ? [1, 1, 1.05] : undefined} />
              <Shape as="capsule" args={[0.075, 0.2]} position={[0.088, 0.66, 0.02]} scale={f ? [1, 1, 1.05] : undefined} />
            </group>
          ))}
          {S('hamstrings', (
            <group scale={f ? [1.05, 1, 1] : undefined}>
              <Shape as="capsule" args={[0.062, 0.19]} position={[-0.088, 0.65, -0.05]} scale={f ? [1, 1, 1.05] : undefined} />
              <Shape as="capsule" args={[0.062, 0.19]} position={[0.088, 0.65, -0.05]} scale={f ? [1, 1, 1.05] : undefined} />
            </group>
          ))}
          {S('calves', (
            <>
              <Shape as="capsule" args={[0.058, 0.15]} position={[-0.088, 0.33, -0.015]} />
              <Shape as="capsule" args={[0.058, 0.15]} position={[0.088, 0.33, -0.015]} />
            </>
          ))}
        </group>

        <OrbitControls
          target={[0, 0.05, 0]}
          enablePan={false}
          minDistance={1.7}
          maxDistance={4.5}
          minPolarAngle={Math.PI * 0.22}
          maxPolarAngle={Math.PI * 0.72}
          autoRotate={auto && !hover}
          autoRotateSpeed={0.9}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-lg border border-amber-800/60 bg-zinc-950/95 px-2.5 py-1.5 text-center shadow-xl"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="text-xs font-bold text-amber-300">{MUSCLE_MAP[hover.id].label}</div>
          <div className="font-mono text-[10px] text-zinc-400">
            {Math.round(sets[hover.id] ?? 0)} sets this week
          </div>
        </div>
      )}
    </div>
  );
}
