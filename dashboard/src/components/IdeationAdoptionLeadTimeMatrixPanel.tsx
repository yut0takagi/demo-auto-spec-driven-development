import type { RunRecord } from '@/lib/types';
import {
  ideationAdoptionLeadTimeMatrix,
  IDEATION_ADOPTION_RATE_BUCKET_ORDER as ADOPTION_BUCKET_ORDER,
  IDEATION_LEAD_TIME_BUCKET_ORDER as LEAD_TIME_BUCKET_ORDER,
  type IdeationAdoptionRateBucketLabel,
  type IdeationLeadTimeBucketLabel,
} from '@/lib/aggregate';

const ADOPTION_BUCKET_LABELS: Record<IdeationAdoptionRateBucketLabel, string> = {
  low: '採用率 低',
  medium: '採用率 中',
  high: '採用率 高',
};

const LEAD_TIME_BUCKET_LABELS: Record<IdeationLeadTimeBucketLabel, string> = {
  fast: 'マージ迅速',
  medium: 'マージ中程度',
  slow: 'マージ遅い',
};

function formatLeadTime(sec: number): string {
  return `${(sec / 60).toFixed(1)}分`;
}

export function IdeationAdoptionLeadTimeMatrixPanel({ runs }: { runs: RunRecord[] }) {
  const matrix = ideationAdoptionLeadTimeMatrix(runs);
  const hasCells = matrix.cells.length > 0;
  const byKey = new Map(matrix.cells.map((c) => [`${c.adoptionBucket}|${c.leadTimeBucket}`, c]));

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid={hasCells ? 'ideation-adoption-lead-time-matrix-panel' : undefined}
    >
      <div className="text-xs uppercase tracking-wider opacity-60">Ideation提案採用率×マージまでのリードタイム</div>

      {!hasCells ? (
        <p className="mt-4 text-sm opacity-50">データなし</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr>
                <th className="pb-2 text-left font-normal opacity-60" />
                {LEAD_TIME_BUCKET_ORDER.map((leadTime) => (
                  <th key={leadTime} className="pb-2 text-left font-normal opacity-60">
                    {LEAD_TIME_BUCKET_LABELS[leadTime]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADOPTION_BUCKET_ORDER.map((adoption) => (
                <tr key={adoption} data-testid={`ideation-adoption-lead-time-row-${adoption}`}>
                  <td className="py-1 pr-3 opacity-80">{ADOPTION_BUCKET_LABELS[adoption]}</td>
                  {LEAD_TIME_BUCKET_ORDER.map((leadTime) => {
                    const cell = byKey.get(`${adoption}|${leadTime}`);
                    return (
                      <td
                        key={leadTime}
                        className="py-1 pr-3"
                        data-testid={`ideation-adoption-lead-time-cell-${adoption}-${leadTime}`}
                      >
                        {cell ? (
                          <span className="inline-block rounded bg-white/5 px-2 py-1 tabular-nums">
                            {cell.count}件 ・ 採用率{(cell.avgAdoptionRate * 100).toFixed(0)}% ・{' '}
                            {formatLeadTime(cell.avgLeadTimeToMergeSec)}
                          </span>
                        ) : (
                          <span className="text-xs opacity-30">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matrix.excludedZeroAdoptionCount > 0 && (
        <p className="mt-3 text-[10px] opacity-50" data-testid="ideation-adoption-lead-time-excluded">
          merged到達0件のため除外: {matrix.excludedZeroAdoptionCount}batch
        </p>
      )}
    </div>
  );
}
