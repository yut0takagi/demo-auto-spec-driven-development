import type { RunRecord } from '@/lib/types';

// `Record<RunRecord['verdict'], string>` は Verdict の全メンバーをキーとして要求する。
// 契約に `dry-run` が増えたので、ここに追加しないと typecheck が落ちる（レビューでの修正）。
const VERDICT_STYLES: Record<RunRecord['verdict'], string> = {
  merged: 'text-emerald-400',
  abandoned: 'text-orange-400',
  'needs-human': 'text-amber-400',
  paused: 'text-sky-400',
  'dry-run': 'text-fuchsia-400',
  failed: 'text-rose-400',
};

export function IterationTimeline({ runs }: { runs: RunRecord[] }) {
  const recent = [...runs].sort((a, b) => b.iteration - a.iteration).slice(0, 20);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-wider opacity-60">直近の反復</div>
      <ul className="mt-4 divide-y divide-white/5">
        {recent.map((run) => (
          <li key={run.id} className="flex items-center gap-4 py-3 text-sm">
            <span className="w-10 shrink-0 tabular-nums opacity-50">#{run.iteration}</span>
            <span className={`w-28 shrink-0 font-medium ${VERDICT_STYLES[run.verdict]}`}>
              {run.verdict}
            </span>
            <span className="min-w-0 flex-1 truncate">{run.issue.title}</span>
            <span className="shrink-0 tabular-nums opacity-50">
              revise {run.reviseCycles} / ${run.cost.totalUsd.toFixed(2)}
            </span>
          </li>
        ))}
        {recent.length === 0 && <li className="py-3 text-sm opacity-50">まだ反復がありません</li>}
      </ul>
    </div>
  );
}
