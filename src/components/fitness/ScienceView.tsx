'use client';

import { useState } from 'react';
import { BookOpen, FlaskConical, Lightbulb, ExternalLink, FileText, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAPERS, PRINCIPLES } from '@/lib/fitness/data/research';
import { SectionHeader, Tag } from './shared';
import type { ResearchTag } from '@/lib/fitness/data/research';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

const TAGS: { id: ResearchTag | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'training', label: 'Training' },
  { id: 'habits', label: 'Habits' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'steps', label: 'Steps / NEAT' },
];

export function ScienceView() {
  const [tag, setTag] = useState<ResearchTag | 'all'>('all');
  const list = tag === 'all' ? PAPERS : PAPERS.filter((p) => p.tag === tag);

  return (
    <div className="space-y-5">
      <div className={cn(card, 'relative overflow-hidden p-6')}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-950/70">
            <FlaskConical className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-50">The science library</h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              {PAPERS.length} landmark papers + {PRINCIPLES.length} field principles — the evidence behind every number in this app
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            { icon: <Database className="h-3.5 w-3.5 text-teal-400" />, text: 'Food data: USDA FoodData Central & IFCT 2017, per-100 g basis' },
            { icon: <FlaskConical className="h-3.5 w-3.5 text-amber-400" />, text: 'Exercise burns: 2011 Compendium METs × ACSM equation' },
            { icon: <BookOpen className="h-3.5 w-3.5 text-lime-400" />, text: 'Volume landmarks: Israetel & Hoffmann (RP) 2019, intermediate trainees' },
          ].map((x, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5 text-[11px] leading-snug text-zinc-400">
              {x.icon}
              {x.text}
            </div>
          ))}
        </div>
      </div>

      {/* filter */}
      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTag(t.id)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
              tag === t.id ? 'border-teal-600 bg-teal-950/60 text-teal-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* papers */}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((p) => (
          <article key={p.id} className={cn(card, 'p-5')}>
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-zinc-600" />
                {p.journal} · {p.year}
              </span>
              <Tag tone="emerald">{p.tag}</Tag>
            </div>
            <h3 className="text-sm font-bold leading-snug text-zinc-100">{p.title}</h3>
            <p className="mt-1 text-[11px] italic text-zinc-500">{p.authors}</p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">{p.finding}</p>
            <div className="mt-3 rounded-lg border-l-2 border-teal-500 bg-teal-950/20 px-3 py-2.5">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-teal-500">
                <Lightbulb className="h-3 w-3" /> How ASCEND uses it
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{p.takeaway}</p>
            </div>
          </article>
        ))}
      </div>

      {/* principles */}
      <div className={cn(card, 'p-5')}>
        <SectionHeader
          title="Field-tested principles"
          sub="consensus distilled from peer review + the evidence-based training community"
          right={<ExternalLink className="h-4 w-4 text-zinc-600" />}
        />
        <ol className="grid gap-3 md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-4">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-lg font-black text-teal-600/70">{String(i + 1).padStart(2, '0')}</span>
                <h4 className="text-sm font-bold text-zinc-100">{p.title}</h4>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{p.body}</p>
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[9px] font-semibold text-zinc-500">
                <BookOpen className="h-2.5 w-2.5" /> {p.source}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="pb-2 text-center text-[10px] leading-relaxed text-zinc-600">
        Summaries are faithful paraphrases for training guidance, not medical advice. Read the originals before making decisions that matter.
        <br />App data: USDA FoodData Central · IFCT 2017 · Ainsworth et al. 2011 Compendium · formulas as cited per card.
      </p>
    </div>
  );
}
