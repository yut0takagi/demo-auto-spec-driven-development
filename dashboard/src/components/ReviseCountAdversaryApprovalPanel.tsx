import type { RunRecord } from '@/lib/types';
import { reviseCountAdversaryComparison, type ReviseVerdictBucketLabel } from '@/lib/aggregate';

const BUCKET_LABELS: Record<ReviseVerdictBucketLabel, string> = {
  '0': 'revise 0回',
  '1': 'revise 1回',
  '2': 'revise 2回',
  '3+': 'revise 3回以上',
};

export function ReviseCountAdversaryApprovalPanel({ runs }: { runs: RunRecord[] }) {
  const buckets = reviseCountAdversaryComparison(runs);

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Revise回数別 Adversary承認率・レビュー文字数比較
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxMeanSummaryLength = Math.max(...buckets.map((b) => b.meanSummaryLength)) || 1;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="revise-count-adversary-approval-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Revise回数別 Adversary承認率・レビュー文字数比較
        </span>
        <span className="text-sm tabular-nums opacity-80">{buckets.length}区分</span>
      </div>

      <ul className="mt-4 space-y-4">
        {buckets.map((b) => {
          const approvalPct = b.approvalRate * 100;
          const lengthBarPct = (b.meanSummaryLength / maxMeanSummaryLength) * 100;
          const statsText = `平均${b.meanSummaryLength.toFixed(0)}文字 / 中央値${b.medianSummaryLength.toFixed(0)}文字（${b.count}件）`;
          return (
            <li key={b.bucket} data-testid={`revise-count-adversary-row-${b.bucket}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{BUCKET_LABELS[b.bucket]}</span>
                <span
                  data-testid={`revise-count-adversary-approval-rate-${b.bucket}`}
                  className="tabular-nums opacity-60"
                >
                  承認{approvalPct.toFixed(0)}%（{b.approvedCount}/{b.count}）
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`revise-count-adversary-approval-bar-${b.bucket}`}
                  className="h-full bg-emerald-400"
                  style={{ width: `${approvalPct.toFixed(2)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    data-testid={`revise-count-adversary-length-bar-${b.bucket}`}
                    className="h-full bg-sky-400"
                    style={{ width: `${lengthBarPct.toFixed(2)}%` }}
                  />
                </div>
                <span
                  data-testid={`revise-count-adversary-length-stats-${b.bucket}`}
                  className="shrink-0 text-[10px] tabular-nums opacity-50"
                >
                  {statsText}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[10px] opacity-50">
        各区分は reachedVerify（verifyまで到達した反復のみ、failed run のsentinelレビューは除外）の
        adversary承認率とレビューコメント文字数(adversary.summary)の分布。
        revise回数が増えるほど承認率が下がる／レビューが長文化するかを比較する。
      </p>
    </div>
  );
}
