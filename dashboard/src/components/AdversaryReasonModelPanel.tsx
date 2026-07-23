import type { RunRecord } from '@/lib/types';
import { adversaryApprovalByReasonAndModel, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonsPanel と同じラベル集合。`Record<GateReasonCategory, string>` が
// GateReasonCategory の全メンバーを要求するので、カテゴリが増えたときの追加漏れを
// typecheck で防ぐ。
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

export function AdversaryReasonModelPanel({ runs }: { runs: RunRecord[] }) {
  const rows = adversaryApprovalByReasonAndModel(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          ゲート不通過理由×モデル別 Adversary承認率
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="adversary-reason-model-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          ゲート不通過理由×モデル別 Adversary承認率
        </span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}区分</span>
      </div>

      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li key={row.category} data-testid={`adversary-reason-model-row-${row.category}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="opacity-80">{CATEGORY_LABELS[row.category]}</span>
              <span className="tabular-nums opacity-60">{row.total}件</span>
            </div>
            <ul className="mt-2 space-y-1.5 pl-3">
              {row.cells.map((cell) => (
                <li key={cell.model} data-testid={`adversary-reason-model-cell-${row.category}-${cell.model}`}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="opacity-70">{cell.model}</span>
                    <span
                      data-testid={`adversary-reason-model-rate-${row.category}-${cell.model}`}
                      className="tabular-nums opacity-60"
                    >
                      承認{cell.approvalRatePct.toFixed(0)}% ({cell.approvedCount}/{cell.count})
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      data-testid={`adversary-reason-model-bar-${row.category}-${cell.model}`}
                      className="h-full bg-sky-400"
                      style={{ width: `${cell.approvalRatePct.toFixed(2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] opacity-50">
              対象iteration: {row.cells.flatMap((cell) => cell.iterations).sort((a, b) => a - b).join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
