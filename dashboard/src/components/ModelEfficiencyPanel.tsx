import type { RunRecord } from '@/lib/types';
import { modelEfficiencyByRole, type CostRole } from '@/lib/aggregate';

const ROLE_LABELS: Record<CostRole, string> = {
  builder: 'Builder',
  adversary: 'Adversary',
  ideation: 'Ideation',
  // planner は modelEfficiencyByRole の対象外（モデル未記録）だが、CostRole の網羅のため定義する。
  planner: 'Planner',
};

export function ModelEfficiencyPanel({ runs }: { runs: RunRecord[] }) {
  const roles = modelEfficiencyByRole(runs);

  if (roles.length === 0 || roles.every((r) => r.entries.length === 0)) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Model効率分析（コスト×成功率の役割別分解）</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-efficiency-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Model効率分析（コスト×成功率の役割別分解）</span>
        <span className="text-sm tabular-nums opacity-80">{roles.length}役割</span>
      </div>

      <div className="mt-4 space-y-5">
        {roles.map((role) => {
          if (role.entries.length === 0) return null;
          const maxMergeRate = Math.max(...role.entries.map((e) => e.mergeRate)) || 1;
          return (
            <div key={role.role} data-testid={`model-efficiency-role-${role.role}`}>
              <div className="text-xs font-semibold opacity-70">{ROLE_LABELS[role.role]}</div>
              <ul className="mt-2 space-y-3">
                {role.entries.map((e) => {
                  const barPct = (e.mergeRate / maxMergeRate) * 100;
                  const perMergedRunText =
                    e.costPerMergedRunUsd === null ? '算出不可（マージ0件）' : `$${e.costPerMergedRunUsd.toFixed(2)}`;
                  const statsText = `コスト$${e.totalCostUsd.toFixed(2)}（平均$${e.avgCostUsd.toFixed(2)}/件）/ マージ1件あたり${perMergedRunText}`;
                  return (
                    <li key={e.model} data-testid={`model-efficiency-entry-${role.role}-${e.model}`}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="opacity-80">{e.model}</span>
                        <span
                          data-testid={`model-efficiency-merge-${role.role}-${e.model}`}
                          className="tabular-nums opacity-80"
                        >
                          マージ率{(e.mergeRate * 100).toFixed(1)}% ({e.count}件)
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          data-testid={`model-efficiency-bar-${role.role}-${e.model}`}
                          className="h-full bg-sky-400"
                          style={{ width: `${barPct.toFixed(2)}%` }}
                        />
                      </div>
                      <p
                        data-testid={`model-efficiency-stats-${role.role}-${e.model}`}
                        className="mt-1 text-[10px] opacity-50"
                      >
                        {statsText}
                      </p>
                      <p className="mt-0.5 text-[10px] opacity-40">対象iteration: {e.iterations.join(', ')}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
