import type { RunRecord } from '@/lib/types';
import { modelIssueLabelSuccessMatrix } from '@/lib/aggregate';

export function ModelIssueLabelSuccessMatrixPanel({ runs }: { runs: RunRecord[] }) {
  const rows = modelIssueLabelSuccessMatrix(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">モデル別×Issue課題型別 成功率マトリクス</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="model-issue-label-success-matrix-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">モデル別×Issue課題型別 成功率マトリクス</span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li
            key={row.model}
            data-testid={`model-issue-label-success-row-${row.model}`}
            className="rounded-lg border border-white/10 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="opacity-80">{row.model}</span>
              <span data-testid={`model-issue-label-success-total-${row.model}`} className="tabular-nums opacity-60">
                ラベル付きissue {row.totalCount}件
              </span>
            </div>

            <ul className="mt-2 space-y-1.5 pl-3">
              {row.cells.map((cell) => (
                <li key={cell.label} data-testid={`model-issue-label-success-cell-${row.model}-${cell.label}`}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="opacity-70">{cell.label}</span>
                    <span
                      data-testid={`model-issue-label-success-rate-${row.model}-${cell.label}`}
                      className="tabular-nums opacity-60"
                    >
                      成功率{(cell.successRate * 100).toFixed(1)}% ({cell.mergedCount}/{cell.count})
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      data-testid={`model-issue-label-success-bar-${row.model}-${cell.label}`}
                      className="h-full bg-emerald-400"
                      style={{ width: `${(cell.successRate * 100).toFixed(2)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] opacity-50">{`対象iteration: ${cell.iterations.join(', ')}`}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
