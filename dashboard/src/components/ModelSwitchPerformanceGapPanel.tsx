import type { RunRecord } from '@/lib/types';
import { builderModelSwitchPerformanceGaps, type ComparisonVerdict } from '@/lib/aggregate';

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

function formatMinutes(sec: number): string {
  return `${(sec / 60).toFixed(1)}分`;
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatDeltaMinutes(deltaSec: number): string {
  const deltaMin = deltaSec / 60;
  const sign = deltaMin > 0 ? '+' : '';
  return `${sign}${deltaMin.toFixed(1)}分`;
}

function formatDeltaUsd(deltaUsd: number): string {
  const sign = deltaUsd > 0 ? '+' : '';
  return `${sign}${deltaUsd.toFixed(2)}`;
}

/**
 * Builder に使われたモデルが切り替わった各タイミングを、切り替え直前/直後のパフォーマンス
 * （1反復あたりの平均所要時間・平均コスト）のギャップとして可視化する。
 * BuilderModelSwitchAbPanel が承認率/マージ率のA/Bを見るのに対し、こちらは
 * durationSec/cost.totalUsd の平均を比較し、モデル切り替え直後に処理速度やコストが
 * 悪化していないかを直接判定できるようにする。
 */
export function ModelSwitchPerformanceGapPanel({ runs }: { runs: RunRecord[] }) {
  const gaps = builderModelSwitchPerformanceGaps(runs);

  if (gaps.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Model切り替え直後のパフォーマンスギャップ</div>
        <p className="mt-4 text-sm opacity-50">
          データなし（builder モデルの切り替えが記録されておらず、パフォーマンスギャップを算出できません）
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-switch-perf-gap-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Model切り替え直後のパフォーマンスギャップ</span>
        <span className="text-sm tabular-nums opacity-80">{gaps.length}回の切り替え</span>
      </div>

      <ul className="mt-4 space-y-4">
        {gaps.map((g) => (
          <li
            key={g.switchIndex}
            data-testid={`model-switch-perf-row-${g.switchIndex}`}
            className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex items-baseline justify-between text-sm">
              <span className="opacity-80">
                {g.before.model} (iteration {g.before.fromIteration}〜{g.before.toIteration}) →{' '}
                {g.after.model} (iteration {g.after.fromIteration}〜{g.after.toIteration})
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="opacity-60">平均所要時間</span>
              <span data-testid={`model-switch-perf-duration-value-${g.switchIndex}`} className="tabular-nums opacity-80">
                {formatMinutes(g.before.avgDurationSec)} → {formatMinutes(g.after.avgDurationSec)}
              </span>
              <span
                data-testid={`model-switch-perf-duration-verdict-${g.switchIndex}`}
                className={`ml-3 w-32 shrink-0 text-right tabular-nums ${VERDICT_STYLES[g.durationVerdict]}`}
              >
                {formatDeltaMinutes(g.durationDeltaSec)} ({VERDICT_LABELS[g.durationVerdict]})
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="opacity-60">平均コスト</span>
              <span data-testid={`model-switch-perf-cost-value-${g.switchIndex}`} className="tabular-nums opacity-80">
                {formatUsd(g.before.avgCostUsd)} → {formatUsd(g.after.avgCostUsd)}
              </span>
              <span
                data-testid={`model-switch-perf-cost-verdict-${g.switchIndex}`}
                className={`ml-3 w-32 shrink-0 text-right tabular-nums ${VERDICT_STYLES[g.costVerdict]}`}
              >
                {formatDeltaUsd(g.costDeltaUsd)} ({VERDICT_LABELS[g.costVerdict]})
              </span>
            </div>

            <p className="mt-1 text-[10px] opacity-50">
              対象反復数: {g.before.model} {g.before.count}件 / {g.after.model} {g.after.count}件
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
