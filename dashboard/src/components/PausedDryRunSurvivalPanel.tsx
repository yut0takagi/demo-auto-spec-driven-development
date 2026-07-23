import type { RunRecord } from '@/lib/types';
import { pausedDryRunDetails, pausedDryRunSummary, type PausedDryRunStopReason } from '@/lib/aggregate';

// `Record<PausedDryRunStopReason, string>` は2値の網羅性をtypecheckに強制させ、
// Verdict側に将来値が増えても（このパネルの対象は変わらないので）ここへの追加は
// 不要だが、逆に PausedDryRunStopReason 自体を増減したときの直し忘れを防ぐ。
const STOP_REASON_LABELS: Record<PausedDryRunStopReason, string> = {
  paused: '一時停止（人間がキルスイッチで停止）',
  'dry-run': 'ドライラン（最初からマージしない設定）',
};

const toMinutes = (sec: number) => sec / 60;

export function PausedDryRunSurvivalPanel({ runs }: { runs: RunRecord[] }) {
  const summary = pausedDryRunSummary(runs);

  if (summary.count === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Paused/Dryrun反復の停止理由・生存時間分析
        </div>
        <p className="mt-4 text-sm opacity-50">データなし（pausedまたはdry-runになった反復はありません）</p>
      </div>
    );
  }

  const details = pausedDryRunDetails(runs);

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="paused-dryrun-survival-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Paused/Dryrun反復の停止理由・生存時間分析
        </span>
        <span data-testid="paused-dryrun-count" className="text-sm tabular-nums opacity-80">
          {summary.count}件
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {summary.reasons.map((r) => (
          <li
            key={r.stopReason}
            data-testid={`paused-dryrun-reason-${r.stopReason}`}
            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="opacity-80">{STOP_REASON_LABELS[r.stopReason]}</span>
            <span className="tabular-nums opacity-60">
              {r.count}件 · 平均生存{r.avgSurvivalIterations.toFixed(1)}反復 · 最長生存
              {r.maxSurvivalIterations}反復 · PR開設{r.openPrCount}件 · ${r.totalCostUsd.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      {summary.longestSurviving && (
        <p data-testid="paused-dryrun-longest" className="mt-3 text-xs opacity-50">
          最も長く放置: #{summary.longestSurviving.iteration} issue #{summary.longestSurviving.issueNumber}{' '}
          {summary.longestSurviving.issueTitle}（{summary.longestSurviving.survivalIterations}反復経過）
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {details.map((d) => (
          <li
            key={d.iteration}
            data-testid={`paused-dryrun-row-${d.iteration}`}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 opacity-80">
                #{d.iteration} · issue #{d.issueNumber} {d.issueTitle}
              </span>
              <span className="shrink-0 tabular-nums opacity-50">
                {STOP_REASON_LABELS[d.stopReason]} · {d.survivalIterations}反復経過 ·{' '}
                {toMinutes(d.durationSec).toFixed(1)}分 · ${d.costUsd.toFixed(2)} ·{' '}
                {d.prNumber !== null ? `PR #${d.prNumber}` : 'PRなし'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
