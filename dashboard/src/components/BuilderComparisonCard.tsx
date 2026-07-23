import type { RunRecord } from '@/lib/types';
import { builderComparison, type BuilderMetricKey, type ComparisonVerdict } from '@/lib/aggregate';

const VERDICT_LABELS: Record<ComparisonVerdict, string> = {
  improved: '改善',
  regressed: '悪化',
  unchanged: '変化なし',
};

const VERDICT_STYLES: Record<ComparisonVerdict, string> = {
  improved: 'text-emerald-400',
  regressed: 'text-rose-400',
  unchanged: 'text-white/50',
};

function formatValue(key: BuilderMetricKey, value: number): string {
  switch (key) {
    case 'coveragePct':
      return `${value.toFixed(1)}%`;
    case 'builderUsd':
      return `$${value.toFixed(2)}`;
    case 'reviseCycles':
      return `${value}回`;
    case 'changedLines':
      return `${value}行`;
  }
}

function formatDelta(key: BuilderMetricKey, delta: number): string {
  const sign = delta > 0 ? '+' : '';
  switch (key) {
    case 'coveragePct':
      return `${sign}${delta.toFixed(1)}pt`;
    case 'builderUsd':
      return `${sign}$${delta.toFixed(2)}`;
    case 'reviseCycles':
      return `${sign}${delta}回`;
    case 'changedLines':
      return `${sign}${delta}行`;
  }
}

export function BuilderComparisonCard({ runs }: { runs: RunRecord[] }) {
  const comparison = builderComparison(runs);

  if (!comparison) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Builder改善の前反復比較</div>
        <p className="mt-4 text-sm opacity-50">データなし（比較には2反復以上の測定データが必要です）</p>
      </div>
    );
  }

  const improvedCount = comparison.metrics.filter((m) => m.verdict === 'improved').length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="builder-comparison">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Builder改善の前反復比較</span>
        <span className="text-sm tabular-nums opacity-80">
          iteration {comparison.previousIteration} → {comparison.currentIteration}
        </span>
      </div>
      <p className="mt-2 text-xs opacity-60">{comparison.metrics.length}項目中 {improvedCount}項目が改善</p>

      <ul className="mt-4 space-y-2">
        {comparison.metrics.map((m) => (
          <li
            key={m.key}
            data-testid={`builder-metric-${m.key}`}
            className="flex items-center justify-between text-sm"
          >
            <span className="opacity-80">{m.label}</span>
            <span data-testid={`builder-metric-value-${m.key}`} className="tabular-nums opacity-60">
              {formatValue(m.key, m.previous)} → {formatValue(m.key, m.current)}
            </span>
            <span
              data-testid={`builder-metric-verdict-${m.key}`}
              className={`ml-3 w-28 shrink-0 text-right tabular-nums ${VERDICT_STYLES[m.verdict]}`}
            >
              {formatDelta(m.key, m.delta)} ({VERDICT_LABELS[m.verdict]})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
