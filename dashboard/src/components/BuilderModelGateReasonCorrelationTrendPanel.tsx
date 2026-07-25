import type { RunRecord } from '@/lib/types';
import {
  builderModelGateReasonCorrelationTrend,
  builderModelGateReasonCorrelationTrendSignal,
  BUILDER_MODEL_GATE_REASON_TREND_WINDOW,
  BUILDER_MODEL_GATE_REASON_TREND_MIN_COUNT,
  type BuilderModelGateReasonCorrelationTrendDirection,
  type GateReasonCategory,
} from '@/lib/aggregate';

// BuilderModelGateReasonCorrelationPanel 等と同じラベル集合。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗', e2eFailed: 'e2e失敗', adversaryNotApproved: 'adversary未承認',
  adversaryUnparseable: 'adversary出力解析不能', changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更', noChanges: '変更なし', crashed: '例外クラッシュ', other: 'その他',
};
const DIRECTION_LABELS: Record<BuilderModelGateReasonCorrelationTrendDirection, string> = {
  intensifying: '強まる', easing: '弱まる', flat: '横ばい',
};
const T = 'builder-model-gate-reason-correlation-trend';
const MIN_BAR_HEIGHT_PCT = 8;
function formatLift(value: number | null): string {
  return value === null ? '算出不可' : `${value.toFixed(2)}x`;
}

export function BuilderModelGateReasonCorrelationTrendPanel({ runs }: { runs: RunRecord[] }) {
  const trend = builderModelGateReasonCorrelationTrend(runs);
  if (trend.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Builderモデル×ゲート理由 相関トレンド</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }
  const signal = builderModelGateReasonCorrelationTrendSignal(runs);
  const latest = trend[trend.length - 1];
  const maxLiftAll = Math.max(0, ...trend.map((p) => p.maxLift ?? 0));
  const barHeightPct = (value: number | null) =>
    value === null || maxLiftAll <= 0 ? 0 : Math.max((value / maxLiftAll) * 100, MIN_BAR_HEIGHT_PCT);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid={`${T}-panel`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Builderモデル×ゲート理由 相関トレンド</span>
        {signal && (
          <span className="text-sm tabular-nums opacity-80" data-testid={`${T}-direction`}>
            {DIRECTION_LABELS[signal.direction]}
          </span>
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid={`${T}-value`}>
        {formatLift(latest.maxLift)}
        <span className="ml-1 text-sm font-normal opacity-50">
          {latest.model !== null && latest.category !== null
            ? `${latest.model} × ${CATEGORY_LABELS[latest.category]}（反復${latest.iteration}）`
            : `直近の最大lift（反復${latest.iteration}）`}
        </span>
      </div>
      <div className="mt-4 flex h-10 items-end gap-1" data-testid={`${T}-sparkline`} role="img" aria-label="最大liftの推移">
        {trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`${T}-bar-${p.iteration}`}
            className="flex-1 rounded-t bg-fuchsia-400"
            style={{ height: `${barHeightPct(p.maxLift)}%` }}
            title={`iteration ${p.iteration}: ${formatLift(p.maxLift)}`}
          />
        ))}
      </div>
      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            {['反復', 'モデル', '理由', 'lift', '件数'].map((h) => (
              <th key={h} className="pb-1 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.iteration} data-testid={`${T}-row-${p.iteration}`}>
              <td className="py-0.5 tabular-nums">{p.iteration}</td>
              <td className="py-0.5">{p.model ?? '—'}</td>
              <td className="py-0.5">{p.category !== null ? CATEGORY_LABELS[p.category] : '—'}</td>
              <td className="py-0.5 tabular-nums">{formatLift(p.maxLift)}</td>
              <td className="py-0.5 tabular-nums">{p.count ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] opacity-50">
        直近{BUILDER_MODEL_GATE_REASON_TREND_WINDOW}反復のスライド窓でliftを再計算し、出現件数{BUILDER_MODEL_GATE_REASON_TREND_MIN_COUNT}件以上のセルに限って最大liftのmodel×理由を1点とした推移。該当セルが無い窓は「算出不可」。
      </p>
    </div>
  );
}
