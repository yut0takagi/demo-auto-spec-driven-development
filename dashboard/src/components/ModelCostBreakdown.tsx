import type { RunRecord } from '@/lib/types';
import { costBreakdown, type CostRole } from '@/lib/aggregate';

const ROLE_LABELS: Record<CostRole, string> = {
  builder: 'Builder',
  adversary: 'Adversary',
  ideation: 'Ideation',
};

const ROLE_COLORS: Record<CostRole, string> = {
  builder: 'bg-sky-400',
  adversary: 'bg-rose-400',
  ideation: 'bg-amber-400',
};

export function ModelCostBreakdown({ runs }: { runs: RunRecord[] }) {
  const breakdown = costBreakdown(runs);

  if (breakdown.totalUsd === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">モデルコストの内訳</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-cost-breakdown">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">モデルコストの内訳</span>
        <span className="text-sm tabular-nums opacity-80">${breakdown.totalUsd.toFixed(2)}</span>
      </div>

      <div
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-white/10"
        data-testid="role-cost-bar"
        role="img"
        aria-label="役割別コスト内訳"
      >
        {breakdown.byRole
          .filter((r) => r.totalUsd > 0)
          .map((r) => (
            <div
              key={r.role}
              data-testid={`role-cost-segment-${r.role}`}
              className={ROLE_COLORS[r.role]}
              style={{ width: `${r.pct.toFixed(2)}%` }}
            />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
        {breakdown.byRole.map((r) => (
          <span key={r.role} data-testid={`role-cost-label-${r.role}`}>
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${ROLE_COLORS[r.role]}`} />
            {ROLE_LABELS[r.role]}: ${r.totalUsd.toFixed(2)} ({r.pct.toFixed(1)}%)
          </span>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {breakdown.byModel.map((m) => (
          <li key={m.model} data-testid={`model-cost-row-${m.model}`} className="text-sm">
            <div className="flex items-baseline justify-between">
              <span className="opacity-80">{m.model}</span>
              <span className="tabular-nums opacity-60">
                ${m.totalUsd.toFixed(2)} ({m.pct.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-sky-400" style={{ width: `${m.pct.toFixed(2)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
