import type { RunRecord } from '@/lib/types';
import { builderVolumeApprovalCoupling, type BuilderVolumeApprovalCouplingDirection } from '@/lib/aggregate';

const DIRECTION_LABELS: Record<BuilderVolumeApprovalCouplingDirection, string> = {
  direct: '連動（生成量と承認率が同方向に変化）',
  inverse: '逆連動（生成量と承認率が逆方向に変化）',
  flat: '横ばい（変化が小さく判定不能）',
};

const DIRECTION_STYLES: Record<BuilderVolumeApprovalCouplingDirection, string> = {
  direct: 'text-sky-400',
  inverse: 'text-amber-400',
  flat: 'text-slate-400',
};

const DIRECTION_DOT_STYLES: Record<BuilderVolumeApprovalCouplingDirection, string> = {
  direct: 'bg-sky-400',
  inverse: 'bg-amber-400',
  flat: 'bg-slate-400',
};

/**
 * Builderが1反復あたりに生成するコード量(changedLines)と、Adversary承認率が
 * ローリング窓（直近window反復 vs 直前window反復）で連動しているかを表示する。
 * 生成量の変化率(%)と承認率の変化幅(pt)が同方向なら「連動」、逆方向なら「逆連動」、
 * どちらかの変化が小さすぎれば「横ばい」と判定する。
 */
export function BuilderVolumeApprovalCouplingPanel({ runs }: { runs: RunRecord[] }) {
  const signal = builderVolumeApprovalCoupling(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Builder生成量と承認率のカップリング分析</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const volumeDeltaText =
    signal.volumeDeltaPct === null
      ? '直前ウィンドウの変更行数平均が0のため変化率は算出不可'
      : `生成量(変更行数)は直前ウィンドウ比 ${signal.volumeDeltaPct >= 0 ? '+' : ''}${signal.volumeDeltaPct.toFixed(1)}%`;

  const approvalDeltaPt = signal.approvalRateDelta * 100;
  const approvalDeltaText = `承認率は直前ウィンドウ比 ${approvalDeltaPt >= 0 ? '+' : ''}${approvalDeltaPt.toFixed(1)}pt`;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="builder-volume-approval-coupling-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Builder生成量と承認率のカップリング分析</span>
        <span className="text-sm tabular-nums opacity-80" data-testid="builder-volume-approval-coupling-coefficient">
          {signal.correlationCoefficient === null ? '算出不可' : `r = ${signal.correlationCoefficient.toFixed(2)}`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] opacity-60">直前{signal.windowSize}反復</div>
          <div
            className="mt-1 text-lg font-semibold tabular-nums"
            data-testid="builder-volume-approval-coupling-previous-volume"
          >
            {signal.previousAvgChangedLines.toFixed(1)}行
          </div>
          <div className="text-xs opacity-60" data-testid="builder-volume-approval-coupling-previous-approval">
            承認率 {(signal.previousApprovalRate * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">直近{signal.windowSize}反復</div>
          <div
            className="mt-1 text-lg font-semibold tabular-nums"
            data-testid="builder-volume-approval-coupling-recent-volume"
          >
            {signal.recentAvgChangedLines.toFixed(1)}行
          </div>
          <div className="text-xs opacity-60" data-testid="builder-volume-approval-coupling-recent-approval">
            承認率 {(signal.recentApprovalRate * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold"
        data-testid="builder-volume-approval-coupling-direction"
        data-direction={signal.direction}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${DIRECTION_DOT_STYLES[signal.direction]}`} />
        <span className={DIRECTION_STYLES[signal.direction]}>{DIRECTION_LABELS[signal.direction]}</span>
      </div>

      <p className="mt-2 text-xs opacity-60">
        {volumeDeltaText} / {approvalDeltaText}
      </p>

      <p className="mt-2 text-[10px] opacity-50" data-testid="builder-volume-approval-coupling-iterations">
        直近: {signal.recentIterations.join(', ')} / 直前: {signal.previousIterations.join(', ')}
        {signal.partial && '（データ不足のため window 未満の反復数で計算）'}
      </p>
    </div>
  );
}
