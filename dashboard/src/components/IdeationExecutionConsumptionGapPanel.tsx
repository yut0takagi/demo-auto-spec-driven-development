import type { RunRecord } from '@/lib/types';
import { ideationExecutionConsumptionGapSignal, type IdeationExecutionConsumptionGapDirection } from '@/lib/aggregate';

const TITLE = 'Ideation実行と消費のタイミングのズレ検知';

const DIRECTION_META: Record<IdeationExecutionConsumptionGapDirection, { label: string; text: string; dot: string }> = {
  'execution-ahead': { label: '発報（実行が消費より先行＝バックログ増加方向）', text: 'text-rose-400', dot: 'bg-rose-400' },
  'consumption-ahead': { label: '発報（消費が実行より先行＝在庫枯渇方向）', text: 'text-amber-400', dot: 'bg-amber-400' },
  aligned: { label: '未発報（ペースは一致）', text: 'text-sky-400', dot: 'bg-sky-400' },
};

const fmt = (n: number) => `${n.toFixed(1)}反復`;

export function IdeationExecutionConsumptionGapPanel({ runs }: { runs: RunRecord[] }) {
  const signal = ideationExecutionConsumptionGapSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">実行・着手のいずれかがまだ2件未満のため、間隔を比較できません。</p>
      </div>
    );
  }

  const meta = DIRECTION_META[signal.direction];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-execution-consumption-gap-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span className="text-sm tabular-nums opacity-80" data-testid="ideation-execution-consumption-gap-counts">
          実行 {signal.executionCount}件 / 着手 {signal.consumptionCount}件
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-[10px] opacity-60">実行間隔（平均）</div>
          <div className="mt-1 text-xl font-semibold tabular-nums" data-testid="ideation-execution-consumption-gap-execution-interval">
            {fmt(signal.avgExecutionIntervalIterations)}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">着手間隔（平均）</div>
          <div className="mt-1 text-xl font-semibold tabular-nums" data-testid="ideation-execution-consumption-gap-consumption-interval">
            {fmt(signal.avgConsumptionIntervalIterations)}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">着手間隔 ÷ 実行間隔</div>
          <div className="mt-1 text-xl font-semibold tabular-nums" data-testid="ideation-execution-consumption-gap-ratio">
            {signal.ratio.toFixed(2)}倍
          </div>
        </div>
      </div>

      <div
        className="mt-4"
        data-testid="ideation-execution-consumption-gap-signal"
        data-direction={signal.direction}
        data-triggered={signal.triggered}
      >
        <span
          data-testid="ideation-execution-consumption-gap-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${meta.text}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      <p className="mt-2 text-[10px] opacity-50" data-testid="ideation-execution-consumption-gap-iterations">
        実行iteration: {signal.executionIterations.join(', ')} / 着手iteration: {signal.consumptionIterations.join(', ')}
      </p>
    </div>
  );
}
