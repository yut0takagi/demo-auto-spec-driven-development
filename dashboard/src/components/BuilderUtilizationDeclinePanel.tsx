import type { RunRecord } from '@/lib/types';
import { builderUtilizationDeclineSignal } from '@/lib/aggregate';

const toMinutes = (sec: number) => sec / 60;

export function BuilderUtilizationDeclinePanel({ runs }: { runs: RunRecord[] }) {
  const signal = builderUtilizationDeclineSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Builder稼働率低下検知（反復開始→PR作成のリードタイム逆転）
        </div>
        <p className="mt-4 text-sm opacity-50">
          データなし（PRが作られた反復が1件以下のため比較対象がありません）
        </p>
      </div>
    );
  }

  const statusText = signal.triggered ? '発報（連続逆転を検知）' : '未発報';
  const statusStyle = signal.triggered ? 'text-rose-400' : 'text-sky-400';
  const dotStyle = signal.triggered ? 'bg-rose-400' : 'bg-sky-400';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="builder-utilization-decline-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Builder稼働率低下検知（反復開始→PR作成のリードタイム逆転）
        </span>
        <span className="text-sm tabular-nums opacity-80">
          逆転 {signal.totalInversions}/{signal.totalComparisons}件
          {signal.inversionRatePct !== null && ` (${signal.inversionRatePct.toFixed(0)}%)`}
        </span>
      </div>

      <div data-testid="builder-utilization-decline-signal" data-triggered={signal.triggered}>
        <div className="mt-3 flex items-baseline justify-between">
          <span
            data-testid="builder-utilization-decline-status"
            className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
            {statusText}
          </span>
          <span className="text-xs opacity-60">
            連続逆転{' '}
            <span data-testid="builder-utilization-decline-streak" className="font-semibold tabular-nums">
              {signal.streak}
            </span>
            回
          </span>
        </div>

        {signal.streakInversions.length === 0 ? (
          <p className="mt-3 text-xs opacity-50">直近の反復ではリードタイムは逆転していません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {signal.streakInversions.map((inv) => (
              <li
                key={`${inv.previousIteration}-${inv.iteration}`}
                data-testid={`builder-utilization-decline-inversion-${inv.iteration}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/10 p-2 text-xs"
              >
                <span className="opacity-80">
                  #{inv.previousIteration} → #{inv.iteration}
                </span>
                <span className="tabular-nums opacity-70">
                  {toMinutes(inv.previousValue).toFixed(1)}分 → {toMinutes(inv.value).toFixed(1)}分
                  {inv.deltaPct !== null && ` (+${inv.deltaPct.toFixed(0)}%)`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
