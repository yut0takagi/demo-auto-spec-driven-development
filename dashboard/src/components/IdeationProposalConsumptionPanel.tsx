import type { RunRecord, Verdict } from '@/lib/types';
import { ideationProposalConsumption } from '@/lib/aggregate';

// `Record<Verdict, string>` は Verdict の全メンバーをキーとして要求するので、
// 契約に verdict が増えたときにここへの追加漏れを typecheck で防ぐ
// （GateFailureTypesPanel の VERDICT_LABELS と同じ狙い）。
const VERDICT_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};

function formatRatio(value: number | null): string {
  return value === null ? '算出不可' : `${value.toFixed(1)}倍`;
}

export function IdeationProposalConsumptionPanel({ runs }: { runs: RunRecord[] }) {
  const stats = ideationProposalConsumption(runs);

  if (stats.proposedCount === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Ideation提案と実消費の対応関係</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="ideation-proposal-consumption-panel"
    >
      <div className="text-xs uppercase tracking-wider opacity-60">Ideation提案と実消費の対応関係</div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-[10px] opacity-60">提案件数</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-proposal-consumption-proposed-count"
          >
            {stats.proposedCount}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">着手件数</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-proposal-consumption-started-count"
          >
            {stats.startedCount}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">提案時点コスト合計</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-proposal-consumption-proposed-total"
          >
            ${stats.proposedTotalUsd.toFixed(3)}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">実消費コスト合計（着手済み）</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-proposal-consumption-actual-total"
          >
            ${stats.actualConsumedTotalUsd.toFixed(3)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[10px] opacity-60">実消費 ÷ 提案時点コスト（着手済みissueのみ）</div>
        <div className="mt-1 text-lg font-semibold tabular-nums" data-testid="ideation-proposal-consumption-ratio">
          {formatRatio(stats.consumptionRatio)}
        </div>
      </div>

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            <th className="pb-1 font-normal">issue</th>
            <th className="pb-1 font-normal">提案(反復)</th>
            <th className="pb-1 font-normal">提案時点単価</th>
            <th className="pb-1 font-normal">着手(反復)</th>
            <th className="pb-1 font-normal">実消費</th>
            <th className="pb-1 font-normal">結果</th>
          </tr>
        </thead>
        <tbody>
          {stats.rows.map((r) => (
            <tr key={r.issueNumber} data-testid={`ideation-proposal-consumption-row-${r.issueNumber}`}>
              <td className="py-0.5 tabular-nums">#{r.issueNumber}</td>
              <td className="py-0.5 tabular-nums">{r.proposedIteration}</td>
              <td className="py-0.5 tabular-nums">${r.proposedCostUsd.toFixed(3)}</td>
              <td className="py-0.5 tabular-nums">{r.startIteration ?? '未着手'}</td>
              <td className="py-0.5 tabular-nums">
                {r.actualCostUsd === null ? '-' : `$${r.actualCostUsd.toFixed(3)}`}
              </td>
              <td className="py-0.5">{r.verdict === null ? '-' : VERDICT_LABELS[r.verdict]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-[10px] opacity-50">
        Ideationが提案したissue1件ごとに、提案時点のコスト単価(ideationUsd÷提案件数)と、実際に着手された反復が消費した総コスト(cost.totalUsd)を対応付ける。未着手の提案issueは「未着手」と表示し、実消費合計・倍率の集計対象から除く。
      </p>
    </div>
  );
}
