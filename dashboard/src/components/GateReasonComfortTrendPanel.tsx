import type { RunRecord } from '@/lib/types';
import { gateReasonComfortTrendSignal, type GateReasonComfortTrendDirection } from '@/lib/aggregate';

// `Record<GateReasonComfortTrendDirection, string>` は3値全てをキーとして要求するので、
// 契約に方向が増えたときにここへの追加漏れを typecheck で防ぐ（GateReasonTrendPanel と同じ狙い）。
const DIRECTION_LABELS: Record<GateReasonComfortTrendDirection, string> = {
  improving: '快適化傾向',
  worsening: '悪化傾向',
  flat: '横ばい',
};

const DIRECTION_TEXT_STYLES: Record<GateReasonComfortTrendDirection, string> = {
  improving: 'text-emerald-400',
  worsening: 'text-rose-400',
  flat: 'text-slate-400',
};

const DIRECTION_DOT_STYLES: Record<GateReasonComfortTrendDirection, string> = {
  improving: 'bg-emerald-400',
  worsening: 'bg-rose-400',
  flat: 'bg-slate-400',
};

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function GateReasonComfortTrendPanel({ runs }: { runs: RunRecord[] }) {
  const signal = gateReasonComfortTrendSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-comfort-trend-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">Gate Reason 無発生の快適性トレンド</div>
        <p className="mt-4 text-sm opacity-50">
          反復数が少なく、傾向（直近ウィンドウと直前ウィンドウの比較）はまだ判定できません。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-comfort-trend-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Gate Reason 無発生の快適性トレンド</span>
        <span className="text-xs opacity-60">
          直近{signal.windowSize}反復 / 直前{signal.windowSize}反復 比較
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between text-sm" data-direction={signal.direction}>
        <span className="flex items-center gap-1.5 opacity-80">
          <span className={`inline-block h-2 w-2 rounded-full ${DIRECTION_DOT_STYLES[signal.direction]}`} />
          gateReasons が空だった反復の比率
        </span>
        <span
          data-testid="gate-reason-comfort-trend-delta"
          className={`tabular-nums font-semibold ${DIRECTION_TEXT_STYLES[signal.direction]}`}
        >
          {DIRECTION_LABELS[signal.direction]}（{formatPct(signal.previousComfortRatio)} → {formatPct(signal.recentComfortRatio)}）
        </span>
      </div>

      <p className="mt-3 text-[10px] opacity-50">
        直近: {signal.recentIterations.join(', ')} / 直前: {signal.previousIterations.join(', ')}
        {signal.partial && '（データ不足のため window 未満の反復数で計算）'}
      </p>
    </div>
  );
}
