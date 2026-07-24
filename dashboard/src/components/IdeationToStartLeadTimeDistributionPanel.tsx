import type { RunRecord } from '@/lib/types';
import {
  ideationToStartBottlenecks,
  ideationToStartLeadTimeDistribution,
  type IdeationToStartBottleneck,
  type IdeationToStartBottleneckKind,
} from '@/lib/aggregate';

const toMinutes = (sec: number) => sec / 60;

const KIND_LABELS: Record<IdeationToStartBottleneckKind, string> = {
  'started-late': '着手済みだが突出して遅い',
  'still-waiting': '未着手のまま滞留中',
};

const KIND_STYLES: Record<IdeationToStartBottleneckKind, string> = {
  'started-late': 'text-amber-400',
  'still-waiting': 'text-rose-400',
};

function bottleneckDetail(b: IdeationToStartBottleneck): string {
  if (b.kind === 'started-late' && b.leadTimeSec !== null) {
    return `リードタイム ${toMinutes(b.leadTimeSec).toFixed(1)}分`;
  }
  return `${b.waitingIterations}反復 放置`;
}

export function IdeationToStartLeadTimeDistributionPanel({ runs }: { runs: RunRecord[] }) {
  const distribution = ideationToStartLeadTimeDistribution(runs);

  if (distribution.sampleSize === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          着手リードタイムの分布とボトルネック検知
        </div>
        <p className="mt-4 text-sm opacity-50">データなし（着手済みissueがまだありません）</p>
      </div>
    );
  }

  const bottlenecks = ideationToStartBottlenecks(runs);
  const maxCount = Math.max(...distribution.buckets.map((b) => b.count), 1);

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="ideation-to-start-lead-time-distribution-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          着手リードタイムの分布とボトルネック検知
        </span>
        <span className="text-sm tabular-nums opacity-80" data-testid="ideation-to-start-distribution-sample-size">
          サンプル {distribution.sampleSize}件
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="opacity-50">最小</div>
          <div className="tabular-nums font-semibold" data-testid="ideation-to-start-distribution-min">
            {toMinutes(distribution.minSec).toFixed(1)}分
          </div>
        </div>
        <div>
          <div className="opacity-50">中央値</div>
          <div className="tabular-nums font-semibold" data-testid="ideation-to-start-distribution-median">
            {toMinutes(distribution.medianSec).toFixed(1)}分
          </div>
        </div>
        <div>
          <div className="opacity-50">p90</div>
          <div className="tabular-nums font-semibold" data-testid="ideation-to-start-distribution-p90">
            {toMinutes(distribution.p90Sec).toFixed(1)}分
          </div>
        </div>
        <div>
          <div className="opacity-50">最大</div>
          <div className="tabular-nums font-semibold" data-testid="ideation-to-start-distribution-max">
            {toMinutes(distribution.maxSec).toFixed(1)}分
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {distribution.buckets.map((bucket) => (
          <li key={bucket.label} data-testid={`ideation-to-start-distribution-bucket-${bucket.label}`}>
            <div className="flex items-baseline justify-between text-[11px] opacity-70">
              <span>{bucket.label}</span>
              <span className="tabular-nums">{bucket.count}件</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-violet-400"
                style={{ width: `${((bucket.count / maxCount) * 100).toFixed(2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-white/10 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider opacity-60">検知されたボトルネック</span>
          <span className="text-sm tabular-nums opacity-80" data-testid="ideation-to-start-bottleneck-count">
            {bottlenecks.length}件
          </span>
        </div>

        {bottlenecks.length === 0 ? (
          <p className="mt-2 text-xs opacity-50">
            現時点でボトルネックとみなせる突出した滞留・遅延は検出されていません。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {bottlenecks.map((b) => (
              <li
                key={`${b.kind}-${b.issueNumber}`}
                data-testid={`ideation-to-start-bottleneck-row-${b.kind}-${b.issueNumber}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
              >
                <span className={`font-semibold ${KIND_STYLES[b.kind]}`}>
                  {KIND_LABELS[b.kind]}
                </span>
                <span className="tabular-nums opacity-70">
                  issue #{b.issueNumber}（提案 iteration {b.proposedIteration}） · {bottleneckDetail(b)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
