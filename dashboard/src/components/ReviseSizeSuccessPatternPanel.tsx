import type { RunRecord } from '@/lib/types';
import {
  reviseSizeSuccessPatterns,
  type ChangeSizeBucketLabel,
  type ReviseVerdictBucketLabel,
  type SuccessPatternLabel,
} from '@/lib/aggregate';

const REVISE_BUCKET_LABELS: Record<ReviseVerdictBucketLabel, string> = {
  '0': 'revise 0回',
  '1': 'revise 1回',
  '2': 'revise 2回',
  '3+': 'revise 3回以上',
};

const REVISE_BUCKET_ORDER: readonly ReviseVerdictBucketLabel[] = ['0', '1', '2', '3+'];

const SIZE_BUCKET_LABELS: Record<ChangeSizeBucketLabel, string> = {
  small: '小(~100行)',
  medium: '中(101~300行)',
  large: '大(301行~)',
};

const SIZE_BUCKET_ORDER: readonly ChangeSizeBucketLabel[] = ['small', 'medium', 'large'];

// `Record<SuccessPatternLabel, string>` は SuccessPatternLabel の全メンバーをキーとして
// 要求するので、契約にパターンが増えたときにここへの追加漏れを typecheck で防ぐ
// （ReviseVerdictMatrixPanel の VERDICT_LABELS と同じ狙い）。
const PATTERN_LABELS: Record<SuccessPatternLabel, string> = {
  'high-success': '成功パターン',
  mixed: '混在',
  'low-success': '失敗パターン',
  'insufficient-data': 'データ不足',
};

const PATTERN_COLORS: Record<SuccessPatternLabel, string> = {
  'high-success': 'bg-emerald-400/20 text-emerald-300',
  mixed: 'bg-amber-400/20 text-amber-300',
  'low-success': 'bg-rose-400/20 text-rose-300',
  'insufficient-data': 'bg-white/5 text-white/40',
};

const PATTERN_ORDER: readonly SuccessPatternLabel[] = ['high-success', 'mixed', 'low-success', 'insufficient-data'];

export function ReviseSizeSuccessPatternPanel({ runs }: { runs: RunRecord[] }) {
  const cells = reviseSizeSuccessPatterns(runs);

  if (cells.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">revise回数×変更サイズ別の成功パターン分類</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const byKey = new Map(cells.map((c) => [`${c.reviseBucket}|${c.sizeBucket}`, c]));
  const highSuccessCount = cells.filter((c) => c.pattern === 'high-success').length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="revise-size-success-pattern-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">revise回数×変更サイズ別の成功パターン分類</span>
        <span className="text-sm tabular-nums opacity-80" data-testid="revise-size-success-high-count">
          成功パターン {highSuccessCount}区分
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr>
              <th className="pb-2 text-left font-normal opacity-60" />
              {SIZE_BUCKET_ORDER.map((size) => (
                <th key={size} className="pb-2 text-left font-normal opacity-60">
                  {SIZE_BUCKET_LABELS[size]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REVISE_BUCKET_ORDER.map((revise) => (
              <tr key={revise} data-testid={`revise-size-success-row-${revise}`}>
                <td className="py-1 pr-3 opacity-80">{REVISE_BUCKET_LABELS[revise]}</td>
                {SIZE_BUCKET_ORDER.map((size) => {
                  const cell = byKey.get(`${revise}|${size}`);
                  return (
                    <td
                      key={size}
                      className="py-1 pr-3"
                      data-testid={`revise-size-success-cell-${revise}-${size}`}
                    >
                      {cell ? (
                        <span
                          className={`inline-block rounded px-2 py-1 tabular-nums ${PATTERN_COLORS[cell.pattern]}`}
                        >
                          {(cell.mergeRate * 100).toFixed(0)}% ({cell.total}件) ・ {PATTERN_LABELS[cell.pattern]}
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

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] opacity-70">
        {PATTERN_ORDER.map((pattern) => (
          <li key={pattern} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-sm ${PATTERN_COLORS[pattern].split(' ')[0]}`} />
            {PATTERN_LABELS[pattern]}
          </li>
        ))}
      </ul>
    </div>
  );
}
