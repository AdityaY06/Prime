'use client';

// R43 studio data-viz register: positive trend / on-target chrome reads IVORY
// (#e4e4e7); goal / reward / close moments read GOLD (#fbbf24); danger stays
// rose; the 'emerald' tone NAME is a legacy contract — its values render amber.

import type { ReactNode } from 'react';
import { Beef, ChevronLeft, ChevronRight, Wheat } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ================= big calorie ring ================= */

export function CalorieRing({
  consumed,
  target,
  burned,
  size = 220,
}: {
  consumed: number;
  target: number;
  burned: number;
  size?: number;
}) {
  const r = 84;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1.15, consumed / target) : 0;
  const over = consumed > target * 1.05;
  const close = !over && consumed >= target * 0.9;
  const remaining = target - consumed;
  const stroke = over ? '#fb7185' : close ? '#fbbf24' : '#e4e4e7';
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} role="img" aria-label={`Consumed ${consumed} of ${target} kcal`}>
      <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="calGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e4e4e7" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={r} fill="none" stroke="#27272a" strokeWidth="13" />
        <circle
          cx="110"
          cy="110"
          r={r}
          fill="none"
          stroke={over ? '#fb7185' : 'url(#calGrad)'}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, pct))}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        {burned > 0 && (
          <circle
            cx="110"
            cy="110"
            r={r - 16}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * (r - 16)}
            strokeDashoffset={2 * Math.PI * (r - 16) * (1 - Math.min(1, burned / 600))}
            opacity="0.85"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-mono text-4xl font-bold tabular-nums', over ? 'text-rose-400' : 'text-zinc-50')}>
          {Math.abs(remaining) > 0 ? Math.abs(remaining) : 0}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
          {over ? 'kcal over' : 'kcal left'}
        </span>
        <span className="mt-1.5 font-mono text-xs text-zinc-400">
          {consumed.toLocaleString()} / {target.toLocaleString()}
        </span>
        {burned > 0 && (
          <span className="mt-0.5 font-mono text-[11px] text-amber-500/90">−{Math.round(burned)} burned</span>
        )}
      </div>
    </div>
  );
}

/* ================= small generic ring ================= */

export function MiniRing({
  pct,
  size = 56,
  stroke = 6,
  color = '#e4e4e7',
  track = '#27272a',
  children,
  className,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = 50 - stroke / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/* ================= macro / generic bars ================= */

export function MacroBar({
  label,
  value,
  target,
  unit = 'g',
  icon,
  color,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  icon?: ReactNode;
  color: 'emerald' | 'amber' | 'rose';
}) {
  const p = target > 0 ? Math.min(1, value / target) : 0;
  const over = target > 0 && value > target * 1.1;
  // 'emerald' is the legacy tone NAME (protein / positive macro) — it renders
  // gold in the studio register, same ramp as the amber tone.
  const bar =
    color === 'emerald' ? (over ? 'bg-amber-300' : 'bg-amber-400') : color === 'amber' ? (over ? 'bg-amber-300' : 'bg-amber-400') : over ? 'bg-rose-300' : 'bg-rose-400';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-zinc-300">
          {icon}
          {label}
        </span>
        <span className="font-mono tabular-nums text-zinc-400">
          <span className={over ? 'text-amber-400' : 'text-zinc-100'}>{Math.round(value)}</span> / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}

export function BarRow({
  label,
  value,
  max,
  unit,
  tone = 'emerald',
  sub,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  tone?: 'emerald' | 'amber' | 'rose' | 'zinc';
  sub?: string;
}) {
  const p = max > 0 ? Math.min(1, value / max) : 0;
  const bar = { emerald: 'bg-amber-400', amber: 'bg-amber-400', rose: 'bg-rose-400', zinc: 'bg-zinc-500' }[tone];
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs font-medium text-zinc-300">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${p * 100}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400">
        {Math.round(value * 10) / 10}
        {unit ? ` ${unit}` : ''}
        {sub ? <span className="text-zinc-600"> /{sub}</span> : ''}
      </span>
    </div>
  );
}

/* ================= line chart ================= */

export function LineChart({
  points,
  height = 180,
  unit = '',
  goal,
}: {
  points: { label: string; value: number }[];
  height?: number;
  unit?: string;
  goal?: number;
}) {
  const W = 600;
  const H = 200;
  const padL = 46;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  if (points.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-xs text-zinc-600">
        No data yet — start logging
      </div>
    );
  }
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals, goal ?? Infinity);
  const hi = Math.max(...vals, goal ?? -Infinity);
  const range = hi - lo || Math.max(1, hi * 0.1);
  const min = lo - range * 0.15;
  const max = hi + range * 0.15;
  const x = (i: number) => (points.length === 1 ? W / 2 : padL + (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * (1 - t));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="w-full" role="img" aria-label="trend chart">
      <defs>
        <linearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#27272a" strokeWidth="1" />
          <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#71717a" fontFamily="monospace">
            {Math.round(v * 10) / 10}
          </text>
        </g>
      ))}
      {goal != null && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(goal)} y2={y(goal)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="5 4" />
          <text x={W - padR} y={y(goal) - 4} textAnchor="end" fontSize="9" fill="#f59e0b">
            goal {goal}{unit}
          </text>
        </g>
      )}
      <path d={area} fill="url(#lcArea)" />
      <path d={line} fill="none" stroke="#e4e4e7" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill="#09090b" stroke="#e4e4e7" strokeWidth="2" />
      ))}
      <text x={padL} y={H - 8} fontSize="9" fill="#71717a">{points[0]?.label}</text>
      <text x={W - padR} y={H - 8} textAnchor="end" fontSize="9" fill="#71717a">{points[points.length - 1]?.label}</text>
    </svg>
  );
}

/* ================= consistency heatmap (12 weeks) ================= */

export function Heatmap({ data }: { data: { date: string; score: number }[] }) {
  const map = new Map(data.map((d) => [d.date, d.score]));
  const today = new Date();
  const cells: { date: string; score: number }[] = [];
  // 84 days ending today, aligned to weeks (columns start Monday)
  const start = new Date(today);
  start.setDate(start.getDate() - 83);
  const dow = (start.getDay() + 6) % 7; // Monday=0
  start.setDate(start.getDate() - dow);
  for (let i = 0; i < 84 + dow; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({ date: ds, score: map.get(ds) ?? -1 });
  }
  const color = (s: number) => {
    if (s < 0) return 'bg-zinc-900/60';
    if (s === 0) return 'bg-zinc-800';
    // R43 ramp — dim zinc floor, then ascending gold with consistency
    if (s < 40) return 'bg-zinc-800';
    if (s < 60) return 'bg-amber-900';
    if (s < 80) return 'bg-amber-600';
    return 'bg-amber-400';
  };
  const weeks: { date: string; score: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {w.map((c) => (
            <div
              key={c.date}
              title={`${c.date} · ${c.score < 0 ? 'no data' : `score ${c.score}`}`}
              className={cn('h-3 w-3 shrink-0 rounded-[3px]', color(c.score))}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ================= radar chart ================= */

export function Radar({ axes }: { axes: { label: string; value: number }[] }) {
  const n = axes.length;
  const cx = 110;
  const cy = 105;
  const R = 72;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const poly = axes.map((a, i) => pt(i, (Math.max(3, a.value) / 100) * R).join(',')).join(' ');
  return (
    <svg viewBox="0 0 220 210" className="w-full" role="img" aria-label="attribute radar">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <polygon
          key={t}
          points={axes.map((_, i) => pt(i, R * t).join(',')).join(' ')}
          fill="none"
          stroke="#27272a"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#27272a" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="rgba(228,228,231,0.14)" stroke="#e4e4e7" strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, (Math.max(3, a.value) / 100) * R);
        return <circle key={a.label} cx={x} cy={y} r="3" fill="#e4e4e7" />;
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 18);
        return (
          <text
            key={a.label}
            x={x}
            y={y}
            textAnchor={x > cx + 4 ? 'start' : x < cx - 4 ? 'end' : 'middle'}
            dominantBaseline="middle"
            fontSize="9.5"
            fontWeight="600"
            fill="#a1a1aa"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ================= stat tile / section header ================= */

export function StatTile({
  icon,
  label,
  value,
  sub,
  tone = 'zinc',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'zinc' | 'emerald' | 'amber' | 'rose';
}) {
  const tones = {
    zinc: 'text-zinc-200',
    emerald: 'text-amber-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
  };
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-xl font-bold tabular-nums', tones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{sub}</div>}
    </div>
  );
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-100">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const isToday = date === new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-1">
      <button
        aria-label="Previous day"
        onClick={() => onChange(shiftDate(date, -1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[110px] text-center font-mono text-xs text-zinc-300">{fmtDate(date)}</span>
      <button
        aria-label="Next day"
        disabled={isToday}
        onClick={() => onChange(shiftDate(date, 1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function shiftDate(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ================= misc ================= */

export function Tag({ children, tone = 'zinc' }: { children: ReactNode; tone?: 'zinc' | 'emerald' | 'amber' | 'rose' }) {
  const tones = {
    zinc: 'border-zinc-700/60 bg-zinc-800/50 text-zinc-400',
    emerald: 'border-amber-800/60 bg-amber-950/60 text-amber-400',
    amber: 'border-amber-800/60 bg-amber-950/60 text-amber-400',
    rose: 'border-rose-800/60 bg-rose-950/60 text-rose-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function ProteinIcon() {
  return <Beef className="h-3.5 w-3.5 text-amber-400" aria-hidden />;
}
export function CarbIcon() {
  return <Wheat className="h-3.5 w-3.5 text-amber-500" aria-hidden />;
}
export function FatIcon() {
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400/80" aria-hidden />;
}

export function XpBadge({ xp }: { xp: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-950/70 px-2 py-1 font-mono text-xs font-bold text-amber-400 tabular-nums">
      +{xp} XP
    </span>
  );
}
