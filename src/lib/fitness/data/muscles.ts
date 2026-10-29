import type { MuscleId } from '../types';

export interface MuscleMeta {
  id: MuscleId;
  label: string;
  region: 'upper' | 'arms' | 'core' | 'lower';
  /** weekly direct sets/week landmarks — approximate starting points, adjust by individual response
   *  Source: Israetel & Hoffmann, "Volume Landmarks" (Renaissance Periodization), 2019 —
   *  synthesised for intermediates; compound overlaps not double-counted here. */
  mev: number; // Minimum Effective Volume
  mav: number; // Maximum Adaptive Volume
  mrv: number; // Maximum Recoverable Volume
  blurb: string;
}

export const MUSCLES: MuscleMeta[] = [
  { id: 'chest', label: 'Chest', region: 'upper', mev: 10, mav: 20, mrv: 22, blurb: 'Pectorals — horizontal pressing & adduction' },
  { id: 'lats', label: 'Back · Lats', region: 'upper', mev: 14, mav: 22, mrv: 25, blurb: 'Latissimus dorsi — vertical & horizontal pulling' },
  { id: 'traps', label: 'Traps', region: 'upper', mev: 6, mav: 12, mrv: 20, blurb: 'Trapezius — scapular elevation, retraction & posture' },
  { id: 'shoulders', label: 'Shoulders', region: 'upper', mev: 12, mav: 20, mrv: 26, blurb: 'Deltoids — pressing & raising the upper arm' },
  { id: 'biceps', label: 'Biceps', region: 'arms', mev: 8, mav: 16, mrv: 24, blurb: 'Elbow flexors — curls & all pulling work' },
  { id: 'triceps', label: 'Triceps', region: 'arms', mev: 8, mav: 14, mrv: 18, blurb: 'Elbow extensors — pressing lockout & extensions' },
  { id: 'forearms', label: 'Forearms', region: 'arms', mev: 4, mav: 8, mrv: 14, blurb: 'Grip & wrist stabilisers — carries, climbs, curls' },
  { id: 'abs', label: 'Abs', region: 'core', mev: 6, mav: 12, mrv: 20, blurb: 'Rectus abdominis — spinal anti-extension & flexion' },
  { id: 'obliques', label: 'Obliques', region: 'core', mev: 4, mav: 8, mrv: 16, blurb: 'Lateral core — anti-rotation & rotation' },
  { id: 'glutes', label: 'Glutes', region: 'lower', mev: 4, mav: 12, mrv: 20, blurb: 'Gluteals — hip extension, abduction & power' },
  { id: 'quads', label: 'Quads', region: 'lower', mev: 12, mav: 18, mrv: 20, blurb: 'Knee extensors — squatting, lunging, extending' },
  { id: 'hamstrings', label: 'Hamstrings', region: 'lower', mev: 6, mav: 12, mrv: 20, blurb: 'Hip extensors / knee flexors — hinges & curls' },
  { id: 'calves', label: 'Calves', region: 'lower', mev: 8, mav: 14, mrv: 20, blurb: 'Triceps surae — ankle extension, spring & gait' },
  { id: 'lowerBack', label: 'Lower Back', region: 'core', mev: 4, mav: 10, mrv: 16, blurb: 'Erector spinae — spinal integrity under load' },
];

export const MUSCLE_MAP: Record<MuscleId, MuscleMeta> = Object.fromEntries(
  MUSCLES.map((m) => [m.id, m]),
) as Record<MuscleId, MuscleMeta>;

export const MUSCLE_IDS = MUSCLES.map((m) => m.id);
