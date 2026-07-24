import type { RunRecord } from '@/lib/types';
import { builderModelGateReasonCorrelation, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonsPanel 等と同じラベル集合。`Record<GateReasonCategory, string>` が
// GateReasonCategory の全メンバーを要求するので、カテゴリが増えたときの追加漏れを typecheck で防ぐ。
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

/** この lift 以上は「全モデル平均より明確に多く起きている」とみなす目安値 */
const LIFT_OVER_THRESHOLD = 1.2;
/** この lift 以下は「全モデル平均より明確に少ない」とみなす目安値 */
const LIFT_UNDER_THRESHOLD = 0.8;

function liftColorClass(lift: number): string {
  if (lift >= LIFT_OVER_THRESHOLD) return 'bg-rose-400';
  if (lift <= LIFT_UNDER_THRESHOLD) return 'bg-emerald-400';
  return 'bg-sky-400';
}

// lift=2.0（全体平均の2倍）でバーが満タンになるよう50倍してpctへ変換し、100を超える分は切り詰める。
const LIFT_BAR_SCALE = 50;

export function BuilderModelGateReasonCorrelationPanel({ runs }: { runs: RunRecord[] }) {
  const rows = builderModelGateReasonCorrelation(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Builderモデル別×ゲート不通過理由 相関分析</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="builder-model-gate-reason-correlation-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Builderモデル別×ゲート不通過理由 相関分析</span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}モデル</span>
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        lift = そのモデル内での理由の占有率 ÷ 全モデル平均の占有率。1.0が「平均通り」で、大きいほど
        そのモデルで当該理由が過剰発生している（赤）。{LIFT_UNDER_THRESHOLD}以下は平均より明確に少ない（緑）。
      </p>

      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li
            key={row.model}
            data-testid={`builder-model-gate-reason-row-${row.model}`}
            className="rounded-lg border border-white/10 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="opacity-80">{row.model}</span>
              <span data-testid={`builder-model-gate-reason-total-${row.model}`} className="tabular-nums opacity-60">
                理由出現 {row.total}件
              </span>
            </div>

            <ul className="mt-2 space-y-1.5 pl-3">
              {row.cells.map((cell) => (
                <li
                  key={cell.category}
                  data-testid={`builder-model-gate-reason-cell-${row.model}-${cell.category}`}
                >
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="opacity-70">{CATEGORY_LABELS[cell.category]}</span>
                    <span
                      data-testid={`builder-model-gate-reason-lift-${row.model}-${cell.category}`}
                      className="tabular-nums opacity-60"
                    >
                      {`lift ${cell.lift.toFixed(2)}x（${cell.count}件, 自${cell.withinModelSharePct.toFixed(0)}% / 全${cell.baselineSharePct.toFixed(0)}%）`}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      data-testid={`builder-model-gate-reason-bar-${row.model}-${cell.category}`}
                      className={`h-full ${liftColorClass(cell.lift)}`}
                      style={{ width: `${Math.min(cell.lift * LIFT_BAR_SCALE, 100).toFixed(2)}%` }}
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
