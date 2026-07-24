import type { RunRecord } from '@/lib/types';
import { ideationGenerationDecaySignal, GENERATION_DECAY_STREAK_THRESHOLD } from '@/lib/aggregate';

const TITLE = 'Ideation生成本数の減衰開始点検出';

export function IdeationGenerationDecayPanel({ runs }: { runs: RunRecord[] }) {
  const signal = ideationGenerationDecaySignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  if (signal.peakIteration === null || signal.peakMovingAverage === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-generation-decay-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50" data-testid="ideation-generation-decay-status">
          データ不足のためピークを判定できません（移動平均の算出に必要な反復数が不足）。
        </p>
      </div>
    );
  }

  const statusLabel = signal.triggered ? '発報（減衰を検知）' : '未検出';
  const statusStyle = signal.triggered ? 'text-rose-400' : 'text-emerald-400';
  const dotStyle = signal.triggered ? 'bg-rose-400' : 'bg-emerald-400';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="ideation-generation-decay-panel"
      data-triggered={signal.triggered}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span
          data-testid="ideation-generation-decay-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs opacity-60">ピーク値（移動平均）</div>
          <div data-testid="ideation-generation-decay-peak" className="mt-1 text-xl font-semibold tabular-nums">
            {signal.peakMovingAverage.toFixed(2)}（iteration {signal.peakIteration}）
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">減衰開始iteration</div>
          <div
            data-testid="ideation-generation-decay-start"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.triggered ? 'text-rose-400' : ''}`}
          >
            {signal.decayStartIteration ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">現在の下降streak</div>
          <div
            data-testid="ideation-generation-decay-streak"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.currentStreak >= GENERATION_DECAY_STREAK_THRESHOLD ? 'text-rose-400' : ''}`}
          >
            {signal.currentStreak}
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">ピークからの下落率</div>
          <div data-testid="ideation-generation-decay-decline-pct" className="mt-1 text-xl font-semibold tabular-nums">
            {signal.declineFromPeakPct === null ? '—' : `${signal.declineFromPeakPct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs opacity-60">
        生成本数(nextIssues件数)の移動平均がピークを打った後、{GENERATION_DECAY_STREAK_THRESHOLD}
        反復連続で下降した最初の地点を「減衰開始点」として検出する。単発の下降はノイズとして無視し、
        連続した下降が確認できて初めて発報する。
      </p>
      {signal.triggered && (
        <p className="mt-1 text-[10px] opacity-50" data-testid="ideation-generation-decay-confirmed">
          発報点（streakが閾値に達したiteration）: {signal.decayConfirmedIteration}
        </p>
      )}
    </div>
  );
}
