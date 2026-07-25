import type { RunRecord, Verdict } from '@/lib/types';
import { costBreakdownByRoleAndStage, type CostRole } from '@/lib/aggregate';

// ModelCostBreakdown / ModelCostRoleBiasPanel と役割ラベル・色を揃える。
const ROLE_LABELS: Record<CostRole, string> = {
  builder: 'Builder',
  adversary: 'Adversary',
  ideation: 'Ideation',
  planner: 'Planner',
};
const ROLE_COLORS: Record<CostRole, string> = {
  builder: 'bg-sky-400',
  adversary: 'bg-rose-400',
  ideation: 'bg-amber-400',
  planner: 'bg-violet-400',
};
const ROLE_ORDER: readonly CostRole[] = ['builder', 'adversary', 'ideation', 'planner'];

// `Record<Verdict, string>` は Verdict の全メンバーをキーとして要求するので、契約に
// verdict が増えたときにここへの追加漏れを typecheck で防ぐ（ReviseVerdictMatrixPanel と同じ狙い）。
const STAGE_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};
// 成功(merged)を左端に、右にいくほど深刻度が上がる並び（ReviseVerdictMatrixPanel と同じ順序）。
const STAGE_ORDER: readonly Verdict[] = ['merged', 'dry-run', 'paused', 'needs-human', 'abandoned', 'failed'];

function formatUsdPct(v: { totalUsd: number; pct: number } | undefined): string {
  return `$${(v?.totalUsd ?? 0).toFixed(2)} (${(v?.pct ?? 0).toFixed(1)}%)`;
}

export function CostRoleStageBreakdownPanel({ runs }: { runs: RunRecord[] }) {
  const breakdown = costBreakdownByRoleAndStage(runs);

  if (breakdown.totalUsd === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">コスト内訳（役割×ステージ）</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const stages = STAGE_ORDER.filter((stage) => breakdown.stageTotals.some((s) => s.stage === stage));
  const cellByKey = new Map(breakdown.cells.map((c) => [`${c.role}|${c.stage}`, c]));
  const roleTotalByRole = new Map(breakdown.roleTotals.map((r) => [r.role, r]));
  const stageTotalByStage = new Map(breakdown.stageTotals.map((s) => [s.stage, s]));

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="cost-role-stage-breakdown-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">コスト内訳（役割×ステージ）</span>
        <span className="text-sm tabular-nums opacity-80">${breakdown.totalUsd.toFixed(2)}</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th className="pb-2 text-left font-normal opacity-60" />
              {stages.map((stage) => (
                <th key={stage} className="pb-2 text-left font-normal opacity-60">
                  {STAGE_LABELS[stage]}
                </th>
              ))}
              <th className="pb-2 text-left font-normal opacity-60">合計</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_ORDER.map((role) => (
              <tr key={role}>
                <td className="py-1 pr-3 opacity-80">
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full ${ROLE_COLORS[role]}`} />
                  {ROLE_LABELS[role]}
                </td>
                {stages.map((stage) => (
                  <td key={stage} className="py-1 pr-3" data-testid={`cost-role-stage-cell-${role}-${stage}`}>
                    <span className="inline-block rounded bg-white/5 px-2 py-1 tabular-nums">
                      {formatUsdPct(cellByKey.get(`${role}|${stage}`))}
                    </span>
                  </td>
                ))}
                <td className="py-1 pr-3 tabular-nums opacity-80" data-testid={`cost-role-stage-role-total-${role}`}>
                  {formatUsdPct(roleTotalByRole.get(role))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td className="pt-2 pr-3 opacity-60">合計</td>
              {stages.map((stage) => (
                <td
                  key={stage}
                  className="pt-2 pr-3 tabular-nums opacity-60"
                  data-testid={`cost-role-stage-stage-total-${stage}`}
                >
                  {formatUsdPct(stageTotalByStage.get(stage))}
                </td>
              ))}
              <td className="pt-2 pr-3 tabular-nums opacity-60">
                {formatUsdPct({ totalUsd: breakdown.totalUsd, pct: 100 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
