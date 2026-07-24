import type { RunRecord } from '@/lib/types';
import { ideationEarlyAbandonmentSignal } from '@/lib/aggregate';

const MAX_LISTED_RUNS = 10;

function formatRate(value: number | null): string {
  return value === null ? '対象なし' : `${(value * 100).toFixed(1)}%`;
}

export function IdeationEarlyAbandonmentPanel({ runs }: { runs: RunRecord[] }) {
  const signal = ideationEarlyAbandonmentSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Ideation生成Issueの早期abandonment率（着手後品質低下検知）
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const ratePct = signal.earlyAbandonmentRate * 100;
  const statusText = signal.triggered ? '発報（悪化傾向）' : '未発報';
  const statusStyle = signal.triggered ? 'text-rose-400' : 'text-sky-400';
  const dotStyle = signal.triggered ? 'bg-rose-400' : 'bg-sky-400';

  const shown = signal.runs.slice(Math.max(0, signal.runs.length - MAX_LISTED_RUNS)).reverse();
  const overflow = signal.runs.length - shown.length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-early-abandonment-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Ideation生成Issueの早期abandonment率（着手後品質低下検知）
        </span>
        <span className="text-sm tabular-nums opacity-80" data-testid="ideation-early-abandonment-counts">
          着手 {signal.startedTotal}件中 {signal.earlyAbandonedCount}件が早期abandonment
        </span>
      </div>

      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="ideation-early-abandonment-value">
        {ratePct.toFixed(1)}%
      </div>

      <p className="mt-2 text-[10px] opacity-50">
        revise {signal.maxReviseCycles}回以下でabandonedになった着手を「早期」とみなす。
        非ideation起源issueの早期abandonment率: {formatRate(signal.baselineEarlyAbandonmentRate)}
        （{signal.baselineEarlyAbandonedCount}/{signal.baselineStartedTotal}件）
      </p>

      <div data-testid="ideation-early-abandonment-signal" data-triggered={signal.triggered}>
        <div className="mt-3 flex items-baseline justify-between">
          <span
            data-testid="ideation-early-abandonment-status"
            className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
            {statusText}
          </span>
          {signal.recentRate !== null && signal.previousRate !== null && (
            <span className="text-xs opacity-60" data-testid="ideation-early-abandonment-trend">
              直近{signal.windowSize}件 {(signal.recentRate * 100).toFixed(0)}% vs 直前
              {(signal.previousRate * 100).toFixed(0)}%
            </span>
          )}
        </div>
        {signal.partial && (
          <p className="mt-1 text-[10px] opacity-50">データ不足のため window 未満の反復数で計算</p>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {shown.map((r) => (
          <li
            key={r.issueNumber}
            data-testid={`ideation-early-abandonment-issue-${r.issueNumber}`}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/10 p-2 text-xs"
          >
            <span className="opacity-80">
              #{r.issueNumber}（着手 iteration {r.startIteration}, revise {r.reviseCycles}回）
            </span>
            <span
              className={`tabular-nums ${r.isEarlyAbandonment ? 'text-rose-400' : 'opacity-70'}`}
              data-testid={`ideation-early-abandonment-verdict-${r.issueNumber}`}
            >
              {r.verdict}
            </span>
          </li>
        ))}
        {overflow > 0 && <li className="text-[10px] opacity-50">他{overflow}件</li>}
      </ul>
    </div>
  );
}
