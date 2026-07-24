import type { RunRecord } from '@/lib/types';
import { plannerActivity } from '@/lib/aggregate';

export function PlannerActivityPanel({ runs }: { runs: RunRecord[] }) {
  const activity = plannerActivity(runs);

  if (activity.trackedCount === 0 || activity.activationRatePct === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Planner稼働とコスト効率</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const finiteUsd = activity.trend.map((p) => p.usd).filter((v) => Number.isFinite(v) && v > 0);
  const maxUsd = finiteUsd.length > 0 ? Math.max(...finiteUsd) : 0;
  // CostEfficiencyPanel と同じ理由: 正の値のバーは必ず視認できる最小高さを確保する。
  const MIN_BAR_HEIGHT_PCT = 8;
  const barHeightPct = (usd: number) => {
    if (!Number.isFinite(usd) || usd <= 0 || maxUsd <= 0) return 0;
    return Math.max((usd / maxUsd) * 100, MIN_BAR_HEIGHT_PCT);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="planner-activity-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Planner稼働とコスト効率</span>
        <span className="text-sm tabular-nums opacity-80" data-testid="planner-activity-count">
          計測対象 {activity.trackedCount}反復中 {activity.activeCount}反復が稼働
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-6">
        <div>
          <div className="text-3xl font-semibold tabular-nums" data-testid="planner-activity-rate">
            {activity.activationRatePct.toFixed(1)}%
          </div>
          <p className="text-[10px] opacity-50">稼働率</p>
        </div>
        <div>
          <div className="text-xl font-semibold tabular-nums" data-testid="planner-activity-avg-cost">
            {activity.avgUsdPerActiveRun === null ? '—' : `$${activity.avgUsdPerActiveRun.toFixed(2)}`}
          </div>
          <p className="text-[10px] opacity-50">アクティブ反復あたり平均コスト</p>
        </div>
        <div>
          <div className="text-xl font-semibold tabular-nums" data-testid="planner-activity-cost-share">
            {activity.pctOfTrackedCost === null ? '—' : `${activity.pctOfTrackedCost.toFixed(1)}%`}
          </div>
          <p className="text-[10px] opacity-50">計測対象コストに占める割合</p>
        </div>
      </div>

      <div
        className="mt-4 flex h-10 items-end gap-1"
        data-testid="planner-activity-trend"
        role="img"
        aria-label="Planner稼働の推移"
      >
        {activity.trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`planner-activity-bar-${p.iteration}`}
            className={`flex-1 rounded-t ${p.active ? 'bg-sky-400' : 'bg-white/15'}`}
            style={{ height: p.active ? `${barHeightPct(p.usd)}%` : '4%' }}
            title={`iteration ${p.iteration}: ${p.active ? `$${p.usd.toFixed(2)}` : '非稼働'}`}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        plannerUsd が記録されている反復のみが対象（着色バー=稼働、薄色バー=非稼働）
      </p>
    </div>
  );
}
