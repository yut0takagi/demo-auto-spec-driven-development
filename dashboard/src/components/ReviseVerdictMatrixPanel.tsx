import type { RunRecord, Verdict } from '@/lib/types';
import { reviseVerdictMatrix, type ReviseVerdictBucketLabel } from '@/lib/aggregate';

// `Record<Verdict, string>` は Verdict の全メンバーをキーとして要求するので、契約に
// verdict が増えたときにここへの追加漏れを typecheck で防ぐ（ReviseCyclesByVerdictPanel /
// GateFailureTypesPanel / VerdictSummaryBubble と同じ狙い）。
const VERDICT_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};

const VERDICT_COLORS: Record<Verdict, string> = {
  merged: 'bg-emerald-400',
  abandoned: 'bg-orange-400',
  'needs-human': 'bg-amber-400',
  paused: 'bg-sky-400',
  'dry-run': 'bg-fuchsia-400',
  failed: 'bg-rose-500',
};

// 積み上げ帯の表示順。成功(merged)を左端に置き、右にいくほど非マージの深刻度が
// 上がる並びにすることで、bucketをまたいで「revise回数が増えるほど帯の左側(merged)が
// 縮んでいく」変化を目で追いやすくする。
const VERDICT_ORDER: readonly Verdict[] = ['merged', 'dry-run', 'paused', 'needs-human', 'abandoned', 'failed'];

const BUCKET_LABELS: Record<ReviseVerdictBucketLabel, string> = {
  '0': 'revise 0回',
  '1': 'revise 1回',
  '2': 'revise 2回',
  '3+': 'revise 3回以上',
};

export function ReviseVerdictMatrixPanel({ runs }: { runs: RunRecord[] }) {
  const rows = reviseVerdictMatrix(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">revise回数とverdictの関連図</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="revise-verdict-matrix-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">revise回数とverdictの関連図</span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}区分</span>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => {
          const mergedPct = row.total === 0 ? 0 : (row.byVerdict.merged / row.total) * 100;
          return (
            <li key={row.bucket} data-testid={`revise-verdict-matrix-row-${row.bucket}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{BUCKET_LABELS[row.bucket]}</span>
                <span
                  data-testid={`revise-verdict-matrix-merged-pct-${row.bucket}`}
                  className="tabular-nums opacity-60"
                >
                  merged {mergedPct.toFixed(0)}% ({row.total}件)
                </span>
              </div>
              <div className="mt-1 flex h-3 w-full overflow-hidden rounded-full bg-white/10">
                {VERDICT_ORDER.filter((verdict) => row.byVerdict[verdict] > 0).map((verdict) => {
                  const widthPct = (row.byVerdict[verdict] / row.total) * 100;
                  return (
                    <div
                      key={verdict}
                      data-testid={`revise-verdict-matrix-seg-${row.bucket}-${verdict}`}
                      className={VERDICT_COLORS[verdict]}
                      style={{ width: `${widthPct.toFixed(2)}%` }}
                      title={`${VERDICT_LABELS[verdict]}: ${row.byVerdict[verdict]}件`}
                    />
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {row.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] opacity-70">
        {VERDICT_ORDER.map((verdict) => (
          <li key={verdict} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-sm ${VERDICT_COLORS[verdict]}`} />
            {VERDICT_LABELS[verdict]}
          </li>
        ))}
      </ul>
    </div>
  );
}
