import type { RunRecord } from '@/lib/types';
import { modelCostRoleBias, type CostRoleBiasLevel } from '@/lib/aggregate';

const LEVEL_LABELS: Record<CostRoleBiasLevel, string> = {
  high: '高偏差',
  moderate: '中偏差',
  none: '偏差なし',
};

const LEVEL_STYLES: Record<CostRoleBiasLevel, string> = {
  high: 'text-rose-400',
  moderate: 'text-amber-400',
  none: 'text-emerald-400',
};

export function ModelCostRoleBiasPanel({ runs }: { runs: RunRecord[] }) {
  const entries = modelCostRoleBias(runs);
  const hasData = entries.some((e) => e.builderCount + e.adversaryCount > 0);

  if (!hasData) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">役割別コスト偏差（建築家 vs 破壊者）</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxAvgUsd = Math.max(...entries.flatMap((e) => [e.builderAvgUsd, e.adversaryAvgUsd])) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-cost-role-bias-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">役割別コスト偏差（建築家 vs 破壊者）</span>
        <span className="text-sm tabular-nums opacity-80">{entries.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-4">
        {entries.map((e) => {
          const comparable = e.builderCount > 0 && e.adversaryCount > 0;
          const statsText = comparable
            ? `比率${e.ratio === null ? '算出不可（0除算）' : `${e.ratio.toFixed(2)}倍`} / 差分$${Math.abs(e.deltaUsd).toFixed(2)}`
            : '比較不可（片方の役割のみで使用）';
          return (
            <li key={e.model} data-testid={`cost-role-bias-row-${e.model}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{e.model}</span>
                <span
                  data-testid={`cost-role-bias-level-${e.model}`}
                  className={`text-xs font-semibold ${LEVEL_STYLES[e.level]}`}
                >
                  {LEVEL_LABELS[e.level]}
                </span>
              </div>

              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-2 text-[10px] opacity-60">
                  <span className="w-16 shrink-0">建築家(builder)</span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-sky-400"
                      style={{ width: `${((e.builderAvgUsd / maxAvgUsd) * 100).toFixed(2)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums">
                    ${e.builderAvgUsd.toFixed(2)} ({e.builderCount}件)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] opacity-60">
                  <span className="w-16 shrink-0">破壊者(adversary)</span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-rose-400"
                      style={{ width: `${((e.adversaryAvgUsd / maxAvgUsd) * 100).toFixed(2)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums">
                    ${e.adversaryAvgUsd.toFixed(2)} ({e.adversaryCount}件)
                  </span>
                </div>
              </div>

              <p className="mt-1 text-[10px] opacity-50" data-testid={`cost-role-bias-stats-${e.model}`}>
                {statsText}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
