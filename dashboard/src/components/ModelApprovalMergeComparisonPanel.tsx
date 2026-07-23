import type { RunRecord } from '@/lib/types';
import { modelEffectiveness } from '@/lib/aggregate';

/**
 * ModelEffectivenessPanel は「マージ率が高いモデルから並べる」意思決定用の総合パネルだが、
 * こちらはモデル名の昇順で固定し、承認率とマージ率を同じ横棒スケールで並べて直接見比べる
 * ことに特化する。承認されたのにマージ率が伸びていない（承認後に paused/dry-run 等で
 * 止まっている）ギャップを可視化するのがこのパネル固有の役割。
 */
export function ModelApprovalMergeComparisonPanel({ runs }: { runs: RunRecord[] }) {
  const summaries = modelEffectiveness(runs);

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">モデル別 承認率・マージ率比較</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const rows = [...summaries].sort((a, b) => a.model.localeCompare(b.model));
  const maxRatePct = Math.max(...rows.flatMap((s) => [s.approvalRate * 100, s.mergeRate * 100])) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-approval-merge-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">モデル別 承認率・マージ率比較</span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-4">
        {rows.map((s) => {
          const approvalPct = s.approvalRate * 100;
          const mergePct = s.mergeRate * 100;
          const gapPct = approvalPct - mergePct;
          const approvalBarPct = (approvalPct / maxRatePct) * 100;
          const mergeBarPct = (mergePct / maxRatePct) * 100;

          return (
            <li key={s.model} data-testid={`model-approval-merge-row-${s.model}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{s.model}</span>
                <span className="tabular-nums opacity-60">
                  {s.count}件 / 対象iteration: {s.iterations.join(', ')}
                </span>
              </div>

              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[10px] opacity-60">
                  <span>承認率</span>
                  <span data-testid={`model-approval-merge-approval-value-${s.model}`}>
                    {approvalPct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    data-testid={`model-approval-merge-approval-bar-${s.model}`}
                    className="h-full bg-emerald-400"
                    style={{ width: `${approvalBarPct.toFixed(2)}%` }}
                  />
                </div>
              </div>

              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[10px] opacity-60">
                  <span>マージ率</span>
                  <span data-testid={`model-approval-merge-merge-value-${s.model}`}>{mergePct.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    data-testid={`model-approval-merge-merge-bar-${s.model}`}
                    className="h-full bg-sky-400"
                    style={{ width: `${mergeBarPct.toFixed(2)}%` }}
                  />
                </div>
              </div>

              <p data-testid={`model-approval-merge-gap-${s.model}`} className="mt-1 text-[10px] opacity-50">
                {`承認→マージのギャップ: ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}pt`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
