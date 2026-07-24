import type { RunRecord } from '@/lib/types';
import { e2eFailureBuilderWorkloadSeparation, type E2eBuilderWorkloadSeparationVerdict } from '@/lib/aggregate';

const VERDICT_LABELS: Record<E2eBuilderWorkloadSeparationVerdict, string> = {
  independent: 'diff sizeはBuilder稼働量と独立にe2e失敗と関係している',
  confounded: 'diff sizeの相関はBuilder稼働量による見かけ上のもの(交絡)の疑いが強い',
  undetermined: '判定不能',
};

const VERDICT_DOT_STYLES: Record<E2eBuilderWorkloadSeparationVerdict, string> = {
  independent: 'bg-sky-400',
  confounded: 'bg-amber-400',
  undetermined: 'bg-slate-400',
};

function fmt(r: number | null): string {
  if (r === null) return '算出不可';
  // 浮動小数点誤差で理論値0が僅かな負の値になり"-0.00"と表示されるのを防ぐ(-0 || 0 は 0)。
  const rounded = Math.round(r * 100) / 100 || 0;
  return `r = ${rounded.toFixed(2)}`;
}

export function E2eBuilderWorkloadSeparationPanel({ runs }: { runs: RunRecord[] }) {
  const stats = e2eFailureBuilderWorkloadSeparation(runs);
  const title = 'E2E失敗相関のBuilder稼働量分離(偏相関分析)';

  if (stats.sampleSize === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{title}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const cells: { label: string; testId: string; value: number | null }[] = [
    { label: 'diff size 単純相関', testId: 'e2e-builder-workload-diffsize-raw', value: stats.diffSizeCorrelation },
    { label: 'Builder稼働量 単純相関', testId: 'e2e-builder-workload-workload-raw', value: stats.builderWorkloadCorrelation },
    { label: 'diff size × 稼働量', testId: 'e2e-builder-workload-diffsize-workload', value: stats.diffSizeWorkloadCorrelation },
    { label: 'diff size 偏相関（稼働量固定）', testId: 'e2e-builder-workload-diffsize-partial', value: stats.diffSizePartialCorrelation },
    { label: '稼働量 偏相関（diff size固定）', testId: 'e2e-builder-workload-workload-partial', value: stats.builderWorkloadPartialCorrelation },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="e2e-builder-workload-separation-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{title}</span>
        <span className="text-sm tabular-nums opacity-80">{stats.sampleSize}件</span>
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        diff sizeとe2e失敗の単純相関が、Builder稼働量(cost.builderUsd)という別軸と連動していることに
        よる見かけ上の関係でないかを、偏相関係数（もう一方を統計的に固定した相関）で切り分ける。
      </p>

      <div className="mt-4 grid grid-cols-5 gap-3 text-xs">
        {cells.map((cell) => (
          <div key={cell.testId}>
            <div className="opacity-60">{cell.label}</div>
            <div className="mt-1 font-semibold tabular-nums" data-testid={cell.testId}>
              {fmt(cell.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold" data-testid="e2e-builder-workload-verdict" data-verdict={stats.verdict}>
        <span className={`inline-block h-2 w-2 rounded-full ${VERDICT_DOT_STYLES[stats.verdict]}`} />
        <span>{VERDICT_LABELS[stats.verdict]}</span>
      </div>
    </div>
  );
}
