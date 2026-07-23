import type { RunRecord, Verdict } from '@/lib/types';
import { reviseCyclesByVerdict } from '@/lib/aggregate';

// `Record<Verdict, string>` は Verdict の全メンバーをキーとして要求するので、契約に
// verdict が増えたときにここへの追加漏れを typecheck で防ぐ（GateFailureTypesPanel /
// VerdictSummaryBubble / IterationTimeline と同じ狙い）。
const VERDICT_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};

const VERDICT_COLORS: Record<Verdict, string> = {
  merged: 'bg-emerald-400',
  abandoned: 'bg-orange-400',
  'needs-human': 'bg-amber-400',
  paused: 'bg-sky-400',
  'dry-run': 'bg-fuchsia-400',
  failed: 'bg-rose-500',
};

export function ReviseCyclesByVerdictPanel({ runs }: { runs: RunRecord[] }) {
  const summaries = reviseCyclesByVerdict(runs);

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Verdict別 revise回数の分布</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxMean = Math.max(...summaries.map((s) => s.mean)) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="revise-cycles-by-verdict-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Verdict別 revise回数の分布</span>
        <span className="text-sm tabular-nums opacity-80">{summaries.length}種類</span>
      </div>

      <ul className="mt-4 space-y-3">
        {summaries.map((s) => {
          const barPct = (s.mean / maxMean) * 100;
          return (
            <li key={s.verdict} data-testid={`revise-verdict-row-${s.verdict}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{VERDICT_LABELS[s.verdict]}</span>
                <span data-testid={`revise-verdict-stats-${s.verdict}`} className="tabular-nums opacity-60">
                  平均{s.mean.toFixed(1)} / 中央値{s.median.toFixed(1)} / {s.min}〜{s.max}回 ({s.count}件)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`revise-verdict-bar-${s.verdict}`}
                  className={`h-full ${VERDICT_COLORS[s.verdict]}`}
                  style={{ width: `${barPct.toFixed(2)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {s.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
