import type { RunRecord } from '@/lib/types';
import { tokenEfficiencyTrend, tokenEfficiencyTrendSignal, type TokenEfficiencyTrendDirection } from '@/lib/aggregate';

const DIRECTION_LABELS: Record<TokenEfficiencyTrendDirection, string> = {
  improving: '改善傾向',
  degrading: '悪化傾向',
  flat: '横ばい',
};

const MIN_BAR_HEIGHT_PCT = 8;

export function TokenEfficiencyTrendPanel({ runs }: { runs: RunRecord[] }) {
  const trend = tokenEfficiencyTrend(runs);
  if (trend.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Token消費効率トレンド</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const signal = tokenEfficiencyTrendSignal(runs);
  const latest = trend[trend.length - 1];
  const byIteration = new Map(runs.map((r) => [r.iteration, r]));
  const maxValue = Math.max(0, ...trend.map((p) => p.value));
  const barHeightPct = (value: number) =>
    maxValue <= 0 ? 0 : Math.max((value / maxValue) * 100, MIN_BAR_HEIGHT_PCT);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="token-efficiency-trend-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Token消費効率トレンド</span>
        {signal && (
          <span className="text-sm tabular-nums opacity-80" data-testid="token-efficiency-trend-direction">
            {DIRECTION_LABELS[signal.direction]}
          </span>
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="token-efficiency-trend-value">
        ${latest.value.toFixed(4)}
        <span className="ml-1 text-sm font-normal opacity-50">/行（反復{latest.iteration}）</span>
      </div>
      <div
        className="mt-4 flex h-10 items-end gap-1"
        data-testid="token-efficiency-trend-bars"
        role="img"
        aria-label="Token消費効率（USD/行）の推移"
      >
        {trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`token-efficiency-trend-bar-${p.iteration}`}
            className="flex-1 rounded-t bg-amber-400"
            style={{ height: `${barHeightPct(p.value)}%` }}
            title={`iteration ${p.iteration}: $${p.value.toFixed(4)}/行`}
          />
        ))}
      </div>
      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            {['反復', 'コスト(USD, 代理指標)', '変更行数', 'USD/行'].map((h) => (
              <th key={h} className="pb-1 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => {
            const run = byIteration.get(p.iteration);
            return (
              <tr key={p.iteration} data-testid={`token-efficiency-trend-row-${p.iteration}`}>
                <td className="py-0.5 tabular-nums">{p.iteration}</td>
                <td className="py-0.5 tabular-nums">${(run?.cost.totalUsd ?? 0).toFixed(3)}</td>
                <td className="py-0.5 tabular-nums">{run?.changedLines ?? 0}</td>
                <td className="py-0.5 tabular-nums">{p.value.toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] opacity-50">
        RunRecordは生トークン数を記録していないため、cost.totalUsd（USD）をトークン消費量の代理指標として用い、
        変更行数(changedLines)で正規化している。verifyに到達しなかったrunは除外。
      </p>
    </div>
  );
}
