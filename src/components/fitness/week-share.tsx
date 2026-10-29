'use client';

/**
 * Feature ④ — Weekly report share-card export.
 * A 1080×1350 (4:5) social card hand-authored as an inline SVG using ONLY
 * generic system fonts (ui-monospace stack) so canvas serialization never
 * waits on webfont loading. Numbers arrive as props from ProgressView and
 * are computed by exactly the same helpers the on-screen report uses.
 * Export path: clone svg → XMLSerializer → data URL → <canvas> 1080×1350 →
 * canvas.toBlob → anchor download / clipboard write. No external deps.
 */

import { useRef, useState } from 'react';
import { Copy, Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface WeekShareStats {
  /** pretty-printed range, e.g. "Tue 22 Sept" */
  rangeStart: string;
  rangeEnd: string;
  sessions: number;
  strengthSessions: number;
  sets: number;
  tonnageKg: number;
  avgProtein: number;
  proteinTarget: number;
  adherentDays: number;
  waterDays: number;
  waterGoalL: number;
  xp: number;
  verdict: string;
  onTrack: boolean;
}

const W = 1080;
const H = 1350;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/* conservative monospace advance-width estimate: ≈ 0.62 em per char */
const CHAR_EM = 0.62;

/**
 * Wrap `text` to at most two lines of `maxChars` by greedy word packing;
 * anything beyond two lines is ellipsised (verdict sentences are short —
 * the wrap is a hard overflow guard, not the common path).
 */
function wrapTwoLines(text: string, maxChars: number): [string, string] {
  if (text.length <= maxChars) return [text, ''];
  let l1 = '';
  for (const w of text.split(/\s+/)) {
    const cand = l1 ? `${l1} ${w}` : w;
    if (cand.length > maxChars) break;
    l1 = cand;
  }
  if (!l1) l1 = `${text.slice(0, maxChars - 1)}…`;
  const rest = text.slice(l1.length).trim();
  if (rest.length <= maxChars) return [l1, rest];
  let l2 = '';
  for (const w of rest.split(/\s+/)) {
    const cand = l2 ? `${l2} ${w}` : w;
    if (cand.length > maxChars - 1) break;
    l2 = cand;
  }
  return [l1, l2 ? `${l2}…` : ''];
}

function StatCell({ x, y, label, value, sub, tone }: {
  x: number;
  y: number;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={456} height={158} rx={20} fill="#18181b" stroke="#27272a" strokeWidth={2} />
      <text x={x + 30} y={y + 52} fontFamily={MONO} fontSize={22} fontWeight={600} letterSpacing={3} fill="#71717a">
        {label}
      </text>
      <text x={x + 30} y={y + 114} fontFamily={MONO} fontSize={58} fontWeight={700} fill={tone}>
        {value}
      </text>
      <text x={x + 30} y={y + 146} fontFamily={MONO} fontSize={22} fill="#52525b">
        {sub}
      </text>
    </g>
  );
}

export function WeekShareDialog({ open, onOpenChange, stats }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stats: WeekShareStats;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState<'download' | 'copy' | null>(null);

  const emerald = stats.strengthSessions >= 2 || stats.avgProtein >= stats.proteinTarget * 0.9;
  const cells = [
    {
      label: 'SESSIONS', value: String(stats.sessions), sub: `${stats.strengthSessions} of 2 strength · WHO`,
      tone: stats.strengthSessions >= 2 ? '#34d399' : '#fafafa',
    },
    {
      label: 'VOLUME', value: String(stats.sets), sub: `sets · ${(stats.tonnageKg / 1000).toFixed(1)} t lifted`, tone: '#fafafa',
    },
    {
      label: 'AVG PROTEIN', value: `${Math.round(stats.avgProtein)}g`, sub: `of ${stats.proteinTarget}g daily`,
      tone: stats.avgProtein >= stats.proteinTarget * 0.9 ? '#34d399' : '#fafafa',
    },
    { label: 'ADHERENCE', value: `${stats.adherentDays} / 7`, sub: 'days ±150 kcal', tone: '#fafafa' },
    {
      label: 'WATER DAYS', value: `${stats.waterDays} / 7`, sub: `days ≥ ${stats.waterGoalL.toFixed(1)} L`,
      tone: stats.waterDays >= 4 ? '#34d399' : '#fafafa',
    },
    { label: 'XP EARNED', value: `+${stats.xp}`, sub: 'this week', tone: '#fbbf24' },
  ];

  // verdict area: x 196 → 984 usable ≈ 788 px at fs 28 ⇒ ≈ 45 chars per line
  const [vLine1, vLine2] = wrapTwoLines(stats.verdict, 45);
  const range = `${stats.rangeStart} – ${stats.rangeEnd}`;

  /** serialize the live preview SVG and rasterise it to a 1080×1350 PNG blob */
  const renderPng = async (): Promise<Blob | null> => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));
    clone.removeAttribute('style'); // drop preview scaling CSS before rasterising
    const xml = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('share-card svg rasterisation failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  const download = async () => {
    try {
      setBusy('download');
      const blob = await renderPng();
      if (!blob) throw new Error('render failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascend-weekly-report-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success('Share card downloaded', { description: '1080 × 1350 PNG · generated locally from your logs.' });
    } catch {
      toast.error('Could not render the share card');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof window === 'undefined' || typeof window.ClipboardItem === 'undefined') {
      toast.error('Clipboard image copy is unavailable here', { description: 'Use Download PNG instead.' });
      return;
    }
    try {
      setBusy('copy');
      // pass the Promise straight into ClipboardItem — keeps Safari's
      // user-gesture activation alive while the canvas renders
      const item = new ClipboardItem({ 'image/png': renderPng().then((b) => {
        if (!b) throw new Error('render failed');
        return b;
      }) });
      await navigator.clipboard.write([item]);
      toast.success('Share card copied to clipboard');
    } catch {
      toast.error('Copy failed', { description: 'Clipboard permission denied — use Download PNG instead.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nice-scroll max-h-[88vh] overflow-y-auto border-zinc-800 bg-zinc-900 p-4 sm:max-w-[420px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-50">
            <Share2 className="h-4 w-4 text-emerald-400" aria-hidden /> Share weekly report
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            A 4:5 PNG card rendered on-device from the same numbers as the report above.
          </DialogDescription>
        </DialogHeader>

        {/* scaled preview — 4:5 preserved, ≤360 px wide, fits the 16px-margin mobile dialog */}
        <div className="mt-2 flex justify-center">
          <div className="w-full max-w-[360px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              role="img"
              aria-label={`Weekly report share card, ${range}`}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            >
              <defs>
                <radialGradient id="wsGlow" cx="0.5" cy="0.12" r="0.75">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.16" />
                  <stop offset="55%" stopColor="#34d399" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width={W} height={H} fill="#09090b" />
              <rect x="0" y="0" width={W} height={H} fill="url(#wsGlow)" />
              <rect x="36" y="36" width={W - 72} height={H - 72} rx="28" fill="none" stroke="#27272a" strokeWidth="2" />

              {/* wordmark */}
              <rect x="72" y="84" width="60" height="60" rx="16" fill="#022c22" stroke="#10b981" strokeWidth="2" />
              <path d="M86 118 L102 102 L118 118" fill="none" stroke="#34d399" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M86 136 L102 120 L118 136" fill="none" stroke="#34d399" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
              <text x="156" y="118" fontFamily={MONO} fontSize="42" fontWeight="700" letterSpacing="8" fill="#fafafa">ASCEND</text>
              <text x="156" y="150" fontFamily={MONO} fontSize="19" letterSpacing="3" fill="#71717a">EVIDENCE-BASED FITNESS OS</text>

              {/* heading */}
              <text x="72" y="272" fontFamily={MONO} fontSize="66" fontWeight="800" letterSpacing="6" fill="#fafafa">WEEKLY REPORT</text>
              <line x1="74" y1="302" x2="380" y2="302" stroke="#34d399" strokeWidth="5" strokeLinecap="round" />
              <text x="72" y="352" fontFamily={MONO} fontSize="28" fill="#a1a1aa">{range}</text>
              <line x1="72" y1="392" x2="1008" y2="392" stroke="#27272a" strokeWidth="2" />

              {/* 2-col stat grid */}
              <StatCell x={72} y={424} {...cells[0]} />
              <StatCell x={552} y={424} {...cells[1]} />
              <StatCell x={72} y={602} {...cells[2]} />
              <StatCell x={552} y={602} {...cells[3]} />
              <StatCell x={72} y={780} {...cells[4]} />
              <StatCell x={552} y={780} {...cells[5]} />

              {/* honest verdict */}
              <rect x="72" y="974" width="936" height="164" rx="20" fill="#101013" stroke="#27272a" strokeWidth="2" />
              <circle
                cx="140" cy="1050" r="26"
                fill={stats.onTrack ? '#052e1b' : '#2a1a04'}
                stroke={stats.onTrack ? '#10b981' : '#f59e0b'}
                strokeWidth="2"
              />
              {stats.onTrack ? (
                <path d="M129 1051 L137 1059 L153 1041" fill="none" stroke="#34d399" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <g>
                  <line x1="140" y1="1036" x2="140" y2="1052" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="140" cy="1062" r="3.5" fill="#fbbf24" />
                </g>
              )}
              <text x="196" y="1010" fontFamily={MONO} fontSize="20" fontWeight="700" letterSpacing="4" fill="#71717a">VERDICT</text>
              <text x="196" y="1052" fontFamily={MONO} fontSize="28" fill="#d4d4d8">{vLine1}</text>
              {vLine2 && <text x="196" y="1094" fontFamily={MONO} fontSize="28" fill="#d4d4d8">{vLine2}</text>}

              {/* footer */}
              <line x1="72" y1="1186" x2="1008" y2="1186" stroke="#27272a" strokeWidth="2" />
              <text x="540" y="1256" textAnchor="middle" fontFamily={MONO} fontSize="22" fill="#52525b">
                evidence-based fitness OS · every number cites its research
              </text>
              {/* subtle completion dot row for visual balance */}
              <circle cx="524" cy="1224" r="4" fill={emerald ? '#34d399' : '#fbbf24'} />
              <circle cx="540" cy="1224" r="4" fill="#34d399" opacity="0.7" />
              <circle cx="556" cy="1224" r="4" fill="#a3e635" opacity="0.5" />
            </svg>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={download}
            disabled={busy !== null}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Download PNG
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={busy !== null}
            className={cn(
              'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-bold text-zinc-300',
              'transition hover:border-teal-700 hover:text-teal-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {busy === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            Copy PNG
          </button>
        </div>
        <p className="text-center text-[10px] leading-relaxed text-zinc-600">
          1080 × 1350 · 4:5 social format · rendered locally — nothing leaves your device
        </p>
      </DialogContent>
    </Dialog>
  );
}
