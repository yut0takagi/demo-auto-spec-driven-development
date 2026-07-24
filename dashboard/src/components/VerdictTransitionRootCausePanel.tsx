import type { RunRecord } from '@/lib/types';
import { verdictTransitionRootCausePatterns, type VerdictTransitionKind, type GateReasonCategory } from '@/lib/aggregate';

// VerdictTransitionPanel と同じラベル・同じ表示順の前提に揃えている。sustainedSuccess は
// gateReasonsが常に空のため実際にはrowとして現れないが、Record<VerdictTransitionKind, string>
// が全水準を要求するのでtypecheckで追加漏れを防ぐために埋めている。
const KIND_LABELS: Record<VerdictTransitionKind, string> = {
  sustainedSuccess: '連続成功',
  recovered: '回復',
  repeatedFailure: '同型で足踏み',
  shiftedFailure: '不通過の型が変化',
  regressed: '悪化',
};

// GateReasonsPanel/GateReasonUnificationPanel と同じカテゴリ・同じ表示ラベルに揃えている。
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

export function VerdictTransitionRootCausePanel({ runs }: { runs: RunRecord[] }) {
  const rows = verdictTransitionRootCausePatterns(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Verdict遷移の根本原因パターン化</div>
        <p className="mt-4 text-sm opacity-50">
          データなし（根本原因(gateReasons)を特定できるverdict遷移がありません）
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="verdict-transition-root-cause-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Verdict遷移の根本原因パターン化</span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}種別</span>
      </div>

      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li
            key={row.kind}
            data-testid={`verdict-transition-root-cause-row-${row.kind}`}
            className="rounded-lg border border-white/10 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="opacity-80">{KIND_LABELS[row.kind]}</span>
              <span
                data-testid={`verdict-transition-root-cause-total-${row.kind}`}
                className="tabular-nums opacity-60"
              >
                {row.total}件
              </span>
            </div>

            <ul className="mt-2 space-y-1.5 pl-3">
              {row.cells.map((cell) => (
                <li
                  key={cell.rootCause}
                  data-testid={`verdict-transition-root-cause-cell-${row.kind}-${cell.rootCause}`}
                >
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="opacity-70">{CATEGORY_LABELS[cell.rootCause]}</span>
                    <span
                      data-testid={`verdict-transition-root-cause-rate-${row.kind}-${cell.rootCause}`}
                      className="tabular-nums opacity-60"
                    >
                      {cell.count}件 ({cell.pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      data-testid={`verdict-transition-root-cause-bar-${row.kind}-${cell.rootCause}`}
                      className="h-full bg-sky-400"
                      style={{ width: `${cell.pct.toFixed(2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
