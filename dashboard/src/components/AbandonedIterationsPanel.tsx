import type { RunRecord } from '@/lib/types';
import {
  abandonedSummary,
  abandonedRateTrend,
  abandonedIterationDetails,
  type GateReasonCategory,
} from '@/lib/aggregate';

// GateReasonsPanel と同じラベル集合（ここでは topGateReasonCategory の表示にのみ使う）。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

const toMinutes = (sec: number) => sec / 60;

export function AbandonedIterationsPanel({ runs }: { runs: RunRecord[] }) {
  const summary = abandonedSummary(runs);

  if (summary.count === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Abandoned反復の追跡・分析</div>
        <p className="mt-4 text-sm opacity-50">データなし（abandonedになった反復はありません）</p>
      </div>
    );
  }

  const details = abandonedIterationDetails(runs);
  const trend = abandonedRateTrend(runs);
  const latestRatePct = trend.length === 0 ? 0 : trend[trend.length - 1].value;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="abandoned-iterations-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Abandoned反復の追跡・分析</span>
        <span data-testid="abandoned-count" className="text-sm tabular-nums opacity-80">
          {summary.count}件
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase opacity-50">累積見送り率</dt>
          <dd data-testid="abandoned-latest-rate" className="tabular-nums">
            {latestRatePct.toFixed(1)}%
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase opacity-50">浪費コスト</dt>
          <dd data-testid="abandoned-total-cost" className="tabular-nums">
            ${summary.totalCostUsd.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase opacity-50">平均revise回数</dt>
          <dd data-testid="abandoned-avg-revise" className="tabular-nums">
            {summary.avgReviseCycles.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase opacity-50">最多不通過理由</dt>
          <dd data-testid="abandoned-top-reason" className="tabular-nums">
            {summary.topGateReasonCategory === null
              ? 'なし'
              : `${CATEGORY_LABELS[summary.topGateReasonCategory]} (${summary.topGateReasonCount}件)`}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-3">
        {details.map((d) => (
          <li
            key={d.iteration}
            data-testid={`abandoned-row-${d.iteration}`}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 opacity-80">
                #{d.iteration} · issue #{d.issueNumber} {d.issueTitle}
              </span>
              <span className="shrink-0 tabular-nums opacity-50">
                revise {d.reviseCycles}回 · ${d.costUsd.toFixed(2)} · {toMinutes(d.durationSec).toFixed(1)}分 ·{' '}
                {d.builderModel}
              </span>
            </div>
            {d.gateReasons.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs opacity-60">
                {d.gateReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
