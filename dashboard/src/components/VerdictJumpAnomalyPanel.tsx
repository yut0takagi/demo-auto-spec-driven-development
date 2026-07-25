import type { RunRecord } from '@/lib/types';
import {
  verdictJumpAnomalies,
  verdictJumpSummary,
  type VerdictJumpAnomaly,
  type VerdictJumpKind,
  type GateReasonCategory,
} from '@/lib/aggregate';

const KIND_LABELS: Record<VerdictJumpKind, string> = {
  spikeFailure: '安定成功中の孤立した不通過',
  spikeSuccess: '安定不通過中の孤立した通過',
};

// VerdictTransitionRootCausePanel/GateReasonsPanel と同じカテゴリ・同じ表示ラベルに揃えている。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  adversaryUnparseable: 'adversary出力解析不能',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

function categoryLabel(reason: string): string {
  return CATEGORY_LABELS[reason as GateReasonCategory] ?? reason;
}

export function VerdictJumpAnomalyPanel({ runs }: { runs: RunRecord[] }) {
  const summary = verdictJumpSummary(runs);

  if (summary.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Verdictジャンプ検知（非遷移型異常検知）</div>
        <p className="mt-4 text-sm opacity-50">
          データなし（前後の窓が安定して揃っている中で孤立したverdictの逸脱が見つかりません）
        </p>
      </div>
    );
  }

  const anomalies = verdictJumpAnomalies(runs);
  const anomaliesByKind = new Map<VerdictJumpKind, VerdictJumpAnomaly[]>();
  for (const anomaly of anomalies) {
    const list = anomaliesByKind.get(anomaly.kind);
    if (list) {
      list.push(anomaly);
    } else {
      anomaliesByKind.set(anomaly.kind, [anomaly]);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="verdict-jump-anomaly-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Verdictジャンプ検知（非遷移型異常検知）</span>
        <span className="text-sm tabular-nums opacity-80">{anomalies.length}件</span>
      </div>

      <ul className="mt-4 space-y-4">
        {summary.map((row) => (
          <li
            key={row.kind}
            data-testid={`verdict-jump-anomaly-row-${row.kind}`}
            className="rounded-lg border border-white/10 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="opacity-80">{KIND_LABELS[row.kind]}</span>
              <span data-testid={`verdict-jump-anomaly-count-${row.kind}`} className="tabular-nums opacity-60">
                {row.count}件 ({row.pct.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                data-testid={`verdict-jump-anomaly-bar-${row.kind}`}
                className="h-full bg-sky-400"
                style={{ width: `${row.pct.toFixed(2)}%` }}
              />
            </div>

            <ul className="mt-2 space-y-1 pl-3">
              {(anomaliesByKind.get(row.kind) ?? []).map((anomaly) => (
                <li
                  key={anomaly.iteration}
                  data-testid={`verdict-jump-anomaly-item-${row.kind}-${anomaly.iteration}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-xs opacity-70"
                >
                  <span>
                    iteration {anomaly.iteration}（{anomaly.verdict}）
                  </span>
                  {anomaly.gateReasons.length > 0 && (
                    <span data-testid={`verdict-jump-anomaly-reason-${row.kind}-${anomaly.iteration}`}>
                      {anomaly.gateReasons.map(categoryLabel).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
