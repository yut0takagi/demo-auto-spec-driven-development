import type { RunRecord } from '@/lib/types';
import { ideationDropRateSignal } from '@/lib/aggregate';

const MAX_LISTED_DROPS = 10;

export function IdeationDropRatePanel({ runs }: { runs: RunRecord[] }) {
  const signal = ideationDropRateSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Issue提案→初着手のドロップレート検知
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  if (signal.judgedTotal === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-drop-rate-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Issue提案→初着手のドロップレート検知
        </div>
        <p className="mt-4 text-sm opacity-50">
          提案 {signal.proposedTotal}件は全て提案から{signal.staleAfterIterations}反復未満のため、
          まだドロップ判定できません。
        </p>
      </div>
    );
  }

  const dropRatePct = (signal.dropRate ?? 0) * 100;
  const statusText = signal.triggered ? '発報（連続ドロップを検知）' : '未発報';
  const statusStyle = signal.triggered ? 'text-rose-400' : 'text-sky-400';
  const dotStyle = signal.triggered ? 'bg-rose-400' : 'bg-sky-400';

  const droppedShown = signal.droppedIssues.slice(0, MAX_LISTED_DROPS);
  const droppedOverflow = signal.droppedIssues.length - droppedShown.length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-drop-rate-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Issue提案→初着手のドロップレート検知
        </span>
        <span className="text-sm tabular-nums opacity-80" data-testid="ideation-drop-rate-counts">
          判定 {signal.judgedTotal}件中 {signal.droppedCount}件がドロップ
        </span>
      </div>

      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="ideation-drop-rate-value">
        {dropRatePct.toFixed(1)}%
      </div>

      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          data-testid="ideation-drop-rate-bar"
          className="h-full bg-rose-400"
          style={{ width: `${dropRatePct.toFixed(2)}%` }}
        />
      </div>

      <p className="mt-2 text-[10px] opacity-50">
        提案 {signal.proposedTotal}件中、提案から{signal.staleAfterIterations}反復以上経過して
        判定確定したのが{signal.judgedTotal}件（残り{signal.pendingCount}件は猶予期間中で未判定）
      </p>

      <div data-testid="ideation-drop-rate-signal" data-triggered={signal.triggered}>
        <div className="mt-3 flex items-baseline justify-between">
          <span
            data-testid="ideation-drop-rate-status"
            className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
            {statusText}
          </span>
          <span className="text-xs opacity-60">
            連続ドロップ{' '}
            <span data-testid="ideation-drop-rate-streak" className="font-semibold tabular-nums">
              {signal.streak}
            </span>
            回
          </span>
        </div>

        {droppedShown.length === 0 ? (
          <p className="mt-3 text-xs opacity-50">ドロップと判定されたissueはまだありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {droppedShown.map((d) => (
              <li
                key={d.issueNumber}
                data-testid={`ideation-drop-rate-issue-${d.issueNumber}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/10 p-2 text-xs"
              >
                <span className="opacity-80">#{d.issueNumber}（提案 iteration {d.proposedIteration}）</span>
                <span className="tabular-nums opacity-70">{d.ageIterations}反復未着手</span>
              </li>
            ))}
            {droppedOverflow > 0 && <li className="text-[10px] opacity-50">他{droppedOverflow}件</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
