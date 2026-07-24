import type { RunRecord } from '@/lib/types';
import { backlogFlowByIteration } from '@/lib/aggregate';

const TITLE = '反復ごとのバックログ増減フロー';

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function BacklogFlowPanel({ runs }: { runs: RunRecord[] }) {
  const points = backlogFlowByIteration(runs);

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const width = 640;
  const height = 200;
  const pad = 24;
  const plotHeight = height - pad * 2;
  const zeroY = pad + plotHeight / 2;
  const maxAbsNet = Math.max(1, ...points.map((p) => Math.abs(p.net)));
  const slotWidth = (width - pad * 2) / points.length;
  const barWidth = Math.min(32, slotWidth * 0.6);

  const totalInflow = points.reduce((sum, p) => sum + p.inflow, 0);
  const totalOutflow = points.reduce((sum, p) => sum + p.outflow, 0);
  const totalNet = totalInflow - totalOutflow;
  const currentBalance = points[points.length - 1].balance;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="backlog-flow-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span className="text-sm tabular-nums opacity-80">残量 {currentBalance}</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label={TITLE}>
        <line
          data-testid="backlog-flow-zero-line"
          x1={pad}
          x2={width - pad}
          y1={zeroY.toFixed(1)}
          y2={zeroY.toFixed(1)}
          stroke="currentColor"
          strokeWidth={1}
          className="text-white/30"
        />
        {points.map((p, i) => {
          const x = pad + slotWidth * i + (slotWidth - barWidth) / 2;
          const barHalfHeight = (Math.abs(p.net) / maxAbsNet) * (plotHeight / 2);
          const y = p.net >= 0 ? zeroY - barHalfHeight : zeroY;
          return (
            <rect
              key={p.iteration}
              data-testid={`backlog-flow-bar-${p.iteration}`}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barWidth.toFixed(1)}
              height={barHalfHeight.toFixed(1)}
              className={p.net >= 0 ? 'fill-emerald-400' : 'fill-rose-400'}
            />
          );
        })}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-[10px] opacity-60">生成合計(inflow)</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="backlog-flow-total-inflow"
          >
            {totalInflow}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">消費合計(outflow)</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="backlog-flow-total-outflow"
          >
            {totalOutflow}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">純増減合計</div>
          <div
            className={`mt-1 text-xl font-semibold tabular-nums ${totalNet < 0 ? 'text-rose-400' : totalNet > 0 ? 'text-emerald-400' : ''}`}
            data-testid="backlog-flow-total-net"
          >
            {signed(totalNet)}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">最新の相対残量</div>
          <div className="mt-1 text-xl font-semibold tabular-nums" data-testid="backlog-flow-balance">
            {currentBalance}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs opacity-60">
        各反復が ideation で生成した issue 数（inflow・緑）と、その反復が処理した issue
        1件（outflow）の差分を純増減として表示する。上に伸びる緑バーはバックログが増えた反復、下に伸びる赤バーは減った反復。
      </p>
      <p className="mt-1 text-[10px] opacity-50" data-testid="backlog-flow-iterations">
        対象iteration: {points.map((p) => p.iteration).join(', ')}
      </p>
    </div>
  );
}
