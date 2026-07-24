import type { RunRecord } from '@/lib/types';
import { mergedStreak } from '@/lib/aggregate';

export function MergedStreakPanel({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">連続成功ストリーク</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const streak = mergedStreak(runs);
  const statusLabel = streak.current === 0 ? '途切れ中' : streak.isRecord ? '記録更新中' : '継続中';
  const statusStyle = streak.current === 0 ? 'opacity-50' : streak.isRecord ? 'text-emerald-400' : 'text-sky-400';
  const statusDotStyle = streak.current === 0 ? 'bg-white/30' : streak.isRecord ? 'bg-emerald-400' : 'bg-sky-400';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="merged-streak-panel"
      data-is-record={streak.isRecord}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">連続成功ストリーク</span>
        <span
          data-testid="merged-streak-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${statusDotStyle}`} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-6">
        <div>
          <span data-testid="merged-streak-current" className="text-3xl font-semibold tabular-nums">
            {streak.current}
          </span>
          <span className="ml-1 text-sm opacity-50">回連続</span>
        </div>
        <div>
          <span data-testid="merged-streak-longest" className="text-xl font-semibold tabular-nums opacity-80">
            {streak.longest}
          </span>
          <span className="ml-1 text-xs opacity-50">最長記録</span>
        </div>
      </div>

      <p className="mt-3 text-xs opacity-60">
        {streak.current === 0
          ? '直近の反復は merged ではないため、連続成功は途切れている。'
          : streak.isRecord
            ? `現在の連続成功（${streak.current}回）が過去最長記録に並んでいる、または更新中。`
            : `現在 ${streak.current} 回連続で成功中（過去最長は ${streak.longest} 回）。`}
      </p>

      {streak.currentIterations.length > 0 && (
        <p className="mt-1 text-[10px] opacity-50" data-testid="merged-streak-current-iterations">
          現在のストリーク対象iteration: {streak.currentIterations.join(', ')}
        </p>
      )}
      {streak.longestIterations.length > 0 && (
        <p className="mt-1 text-[10px] opacity-50" data-testid="merged-streak-longest-iterations">
          最長記録の対象iteration: {streak.longestIterations.join(', ')}
        </p>
      )}
    </div>
  );
}
