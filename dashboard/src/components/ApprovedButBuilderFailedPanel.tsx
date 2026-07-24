import type { RunRecord } from '@/lib/types';
import {
  approvedButBuilderFailedSummary,
  approvedButBuilderFailedIterations,
  type GateReasonCategory,
} from '@/lib/aggregate';

// AbandonedIterationsPanel と同じラベル集合（表示にのみ使う）。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  adversaryUnparseable: 'adversary出力解析不能',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

/**
 * adversary が approve したのに builder 側の要因（verify失敗・e2e失敗・変更なし等）で
 * ゲートを通過できなかった反復を検知するパネル。「承認したのにレビューの中身が
 * 実装の成否を保証していない」＝レビュー品質そのものの異常兆候として扱う。
 */
export function ApprovedButBuilderFailedPanel({ runs }: { runs: RunRecord[] }) {
  const summary = approvedButBuilderFailedSummary(runs);

  if (summary.count === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Adversary承認済みなのにBuilder実装失敗</div>
        <p className="mt-4 text-sm opacity-50">データなし（該当する反復はありません）</p>
      </div>
    );
  }

  const details = approvedButBuilderFailedIterations(runs);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="approved-builder-failed-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Adversary承認済みなのにBuilder実装失敗</span>
        <span data-testid="approved-builder-failed-count" className="text-sm tabular-nums opacity-80">
          {summary.count}件
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase opacity-50">検知率（承認件数比）</dt>
          <dd data-testid="approved-builder-failed-rate" className="tabular-nums">
            {summary.ratePct.toFixed(1)}%
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase opacity-50">浪費コスト</dt>
          <dd data-testid="approved-builder-failed-cost" className="tabular-nums">
            ${summary.totalCostUsd.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase opacity-50">最多の原因カテゴリ</dt>
          <dd data-testid="approved-builder-failed-top-category" className="tabular-nums">
            {summary.topCategory === null
              ? 'なし'
              : `${CATEGORY_LABELS[summary.topCategory]} (${summary.topCategoryCount}件)`}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-3">
        {details.map((d) => (
          <li
            key={d.iteration}
            data-testid={`approved-builder-failed-row-${d.iteration}`}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 opacity-80">
                #{d.iteration} · issue #{d.issueNumber} {d.issueTitle}
              </span>
              <span className="shrink-0 tabular-nums opacity-50">
                {d.verdict} · ${d.costUsd.toFixed(2)} · builder:{d.builderModel} / adversary:{d.adversaryModel}
              </span>
            </div>
            <p className="mt-1 text-xs opacity-60">
              {d.categories.map((c) => CATEGORY_LABELS[c]).join(', ')}
            </p>
            {d.gateReasons.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs opacity-50">
                {d.gateReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
