import type { RunRecord } from '@/lib/types';
import { breakerRunway } from '@/lib/aggregate';

/**
 * スロットごとの色。「消費済み（連続非マージ）」は rose、「残っている runway」は
 * 発火まで残り1回なら amber、まだ余裕があれば emerald（EarlyWarningCard の
 * critical/watch/normal 配色と揃えている）。
 */
function slotClassName(consumed: boolean, remaining: number): string {
  if (consumed) return 'bg-rose-400';
  return remaining <= 1 ? 'bg-amber-400/40' : 'bg-emerald-400/40';
}

export function BreakerRunwayPanel({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          ブレーカ発火までのランウェイ
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const runway = breakerRunway(runs);
  const statusLabel = runway.tripped ? '発火条件成立' : runway.remaining <= 1 ? '残り僅か' : '平常';
  const statusStyle = runway.tripped
    ? 'text-rose-400'
    : runway.remaining <= 1
      ? 'text-amber-400'
      : 'text-emerald-400';
  const statusDotStyle = runway.tripped
    ? 'bg-rose-400'
    : runway.remaining <= 1
      ? 'bg-amber-400'
      : 'bg-emerald-400';

  const slots = Array.from(
    { length: runway.threshold },
    (_, i) => i >= runway.threshold - runway.streak,
  );

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="breaker-runway-panel"
      data-tripped={runway.tripped}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          ブレーカ発火までのランウェイ
        </span>
        <span
          data-testid="breaker-runway-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${statusDotStyle}`} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          data-testid="breaker-runway-remaining"
          className={`text-3xl font-semibold tabular-nums ${runway.tripped ? 'text-rose-400' : ''}`}
        >
          {runway.remaining}
        </span>
        <span className="text-sm opacity-50">/ {runway.threshold} 回 残り</span>
      </div>

      <div className="mt-3 flex gap-1.5" data-testid="breaker-runway-slots">
        {slots.map((consumed, i) => (
          <div
            key={i}
            data-testid={`breaker-runway-slot-${i}`}
            data-consumed={consumed}
            className={`h-3 flex-1 rounded-full ${slotClassName(consumed, runway.remaining)}`}
          />
        ))}
      </div>

      <p className="mt-3 text-xs opacity-60">
        連続非マージ {runway.streak}/{runway.threshold} 回。
        {runway.tripped
          ? 'この時点でブレーカが発火し、ループは自動停止する。'
          : `あと${runway.remaining}回連続で非マージが続くと発火する。`}
      </p>

      {runway.iterations.length > 0 && (
        <p className="mt-1 text-[10px] opacity-50">
          対象iteration: {runway.iterations.join(', ')}
        </p>
      )}
    </div>
  );
}
