import type { RunRecord } from '@/lib/types';
import { earlyWarningSignal, type EarlyWarningLevel } from '@/lib/aggregate';

const LEVEL_LABELS: Record<EarlyWarningLevel, string> = {
  critical: '警戒',
  watch: '注視',
  normal: '平常',
};

const LEVEL_STYLES: Record<EarlyWarningLevel, string> = {
  critical: 'text-rose-400',
  watch: 'text-amber-400',
  normal: 'text-emerald-400',
};

const LEVEL_DOT_STYLES: Record<EarlyWarningLevel, string> = {
  critical: 'bg-rose-400',
  watch: 'bg-amber-400',
  normal: 'bg-emerald-400',
};

const LEVEL_DESCRIPTIONS: Record<EarlyWarningLevel, string> = {
  critical: 'revise回数が多いのに承認が付いていない。builderが迷走している可能性があります。',
  watch: 'revise回数か承認率のどちらかに予兆が出ています。次の反復を注視してください。',
  normal: 'revise回数・承認率ともに目立った予兆はありません。',
};

export function EarlyWarningCard({ runs }: { runs: RunRecord[] }) {
  const signal = earlyWarningSignal(runs);

  if (!signal) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          高revise + 低承認率の前兆検知
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="early-warning-card"
      data-level={signal.level}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          高revise + 低承認率の前兆検知
        </span>
        <span
          data-testid="early-warning-level"
          className={`flex items-center gap-1.5 text-sm font-semibold ${LEVEL_STYLES[signal.level]}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${LEVEL_DOT_STYLES[signal.level]}`} />
          {LEVEL_LABELS[signal.level]}
        </span>
      </div>

      <p className="mt-2 text-xs opacity-60">{LEVEL_DESCRIPTIONS[signal.level]}</p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs opacity-60">直近{signal.windowSize}反復の平均revise</div>
          <div
            data-testid="early-warning-revise-value"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.highRevise ? 'text-rose-400' : ''}`}
          >
            {signal.windowAvgReviseCycles.toFixed(1)}回
          </div>
          <div className="text-[10px] opacity-50">閾値 &gt;{signal.reviseCyclesThreshold}回</div>
        </div>
        <div>
          <div className="text-xs opacity-60">直近{signal.windowSize}反復の承認率</div>
          <div
            data-testid="early-warning-approval-value"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.lowApproval ? 'text-rose-400' : ''}`}
          >
            {(signal.windowApprovalRate * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] opacity-50">
            閾値 &lt;{(signal.approvalRateThreshold * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] opacity-50">
        対象iteration: {signal.iterations.join(', ')}
        {signal.partial && '（データ不足のため window 未満の反復数で計算）'}
      </p>
    </div>
  );
}
