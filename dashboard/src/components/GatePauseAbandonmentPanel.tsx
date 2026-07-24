import type { RunRecord } from '@/lib/types';
import {
  gatePauseClassifications,
  gatePauseSummary,
  type GatePauseAbandonmentStatus,
  type GatePausePattern,
} from '@/lib/aggregate';

// `Record<...,string>` は網羅性をtypecheckに強制させ、GatePausePattern/GatePauseAbandonmentStatus
// 自体が増減したときにここへの追加漏れを防ぐ（PausedDryRunSurvivalPanelのSTOP_REASON_LABELSと同じ狙い）。
const PATTERN_LABELS: Record<GatePausePattern, string> = {
  'clean-pause': '即承認・reviseなしでの一時停止',
  'contested-pause': 'revise後に承認されての一時停止',
};

const ABANDONMENT_STATUS_LABELS: Record<GatePauseAbandonmentStatus, string> = {
  reattempted: '再挑戦済み（同issueが後続反復で再実行された＝離脱）',
  stalled: '放置中（離脱の疑い）',
  pending: '経過観察中（停止から日が浅い）',
};

const toMinutes = (sec: number) => sec / 60;

export function GatePauseAbandonmentPanel({ runs }: { runs: RunRecord[] }) {
  const summary = gatePauseSummary(runs);

  if (summary.count === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Gate通過後Pauseパターン分類・離脱検知
        </div>
        <p className="mt-4 text-sm opacity-50">データなし（pausedになった反復はありません）</p>
      </div>
    );
  }

  const details = gatePauseClassifications(runs);

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="gate-pause-abandonment-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Gate通過後Pauseパターン分類・離脱検知
        </span>
        <span data-testid="gate-pause-count" className="text-sm tabular-nums opacity-80">
          {summary.count}件
        </span>
      </div>

      <p className="mt-2 text-xs opacity-50">停止のされ方</p>
      <ul className="mt-1 space-y-2">
        {summary.patterns.map((p) => (
          <li
            key={p.pattern}
            data-testid={`gate-pause-pattern-${p.pattern}`}
            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="opacity-80">{PATTERN_LABELS[p.pattern]}</span>
            <span className="tabular-nums opacity-60">{p.count}件</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs opacity-50">その後の状態（離脱検知）</p>
      <ul className="mt-1 space-y-2">
        {summary.abandonment.map((a) => (
          <li
            key={a.status}
            data-testid={`gate-pause-status-${a.status}`}
            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
          >
            <span className="opacity-80">{ABANDONMENT_STATUS_LABELS[a.status]}</span>
            <span className="tabular-nums opacity-60">{a.count}件</span>
          </li>
        ))}
      </ul>

      {summary.mostAtRisk && (
        <p data-testid="gate-pause-most-at-risk" className="mt-3 text-xs opacity-50">
          最も離脱リスクが高い: #{summary.mostAtRisk.iteration} issue #{summary.mostAtRisk.issueNumber}{' '}
          {summary.mostAtRisk.issueTitle}（{summary.mostAtRisk.survivalIterations}反復経過）
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {details.map((d) => (
          <li
            key={d.iteration}
            data-testid={`gate-pause-row-${d.iteration}`}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 opacity-80">
                #{d.iteration} · issue #{d.issueNumber} {d.issueTitle}
              </span>
              <span className="shrink-0 tabular-nums opacity-50">
                {PATTERN_LABELS[d.pattern]} · {ABANDONMENT_STATUS_LABELS[d.abandonmentStatus]} ·{' '}
                {d.survivalIterations}反復経過 · {toMinutes(d.durationSec).toFixed(1)}分 · ${d.costUsd.toFixed(2)}{' '}
                · {d.prNumber !== null ? `PR #${d.prNumber}` : 'PRなし'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
