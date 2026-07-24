import type { RunRecord } from '@/lib/types';
import { gateReasonRecoverySteps, type GateReasonCategory } from '@/lib/aggregate';

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

export function GateReasonRecoveryPanel({ runs }: { runs: RunRecord[] }) {
  const steps = gateReasonRecoverySteps(runs);

  if (steps.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-recovery-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">
          ゲート回復分析（同一理由の再試行から成功までのステップ）
        </div>
        <p className="mt-4 text-sm opacity-50">
          データなし（同一理由の不通過が2回以上連続した区間はありません）
        </p>
      </div>
    );
  }

  const recoveredSteps = steps.filter((s) => s.recovered);
  const avgSteps =
    recoveredSteps.length === 0
      ? null
      : recoveredSteps.reduce((sum, s) => sum + (s.stepsToSuccess as number), 0) / recoveredSteps.length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-recovery-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          ゲート回復分析（同一理由の再試行から成功までのステップ）
        </span>
        <span className="text-sm tabular-nums opacity-80">
          {`${steps.length}件中${recoveredSteps.length}件が回復${
            avgSteps !== null ? `・平均${avgSteps.toFixed(1)}ステップ` : ''
          }`}
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {steps.map((step) => {
          const firstIteration = step.iterations[0];
          const lastIteration = step.iterations[step.iterations.length - 1];
          const outcomeText = step.recovered
            ? `#${step.nextIteration}で回復（${step.stepsToSuccess}ステップ）`
            : step.nextIteration === null
              ? '未回復（データ終端。継続中）'
              : `未回復（#${step.nextIteration}も${step.nextVerdict}）`;

          return (
            <li
              key={`${step.reasonCategory}-${firstIteration}`}
              data-testid={`gate-reason-recovery-row-${firstIteration}-${lastIteration}`}
              data-recovered={step.recovered}
              className="rounded-lg border border-white/10 p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="opacity-80">
                  {`${CATEGORY_LABELS[step.reasonCategory]}が#${firstIteration}〜#${lastIteration}で${step.retryCount}回連続`}
                </span>
                <span
                  data-testid={`gate-reason-recovery-outcome-${firstIteration}`}
                  className={`shrink-0 font-semibold ${step.recovered ? 'text-emerald-400' : 'text-rose-400'}`}
                >
                  {outcomeText}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
