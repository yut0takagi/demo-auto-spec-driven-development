import type { RunRecord, Verdict } from '@/lib/types';
import { adversaryModelVerdictMissMatrix } from '@/lib/aggregate';

// `Record<Verdict, string>` が Verdict の全メンバーをキーとして要求するので、verdict が
// 増えたときにここへの追加漏れを typecheck で防ぐ（ReviseVerdictMatrixPanel と同じ狙い）。
// 実際にセルとして描画されるのは merged/failed を除いた非マージ系のみ。
const VERDICT_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};

export function AdversaryModelVerdictMissMatrixPanel({ runs }: { runs: RunRecord[] }) {
  const rows = adversaryModelVerdictMissMatrix(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Adversaryモデル別×Verdict別 見落とし率マトリクス
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="adversary-model-verdict-miss-matrix-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Adversaryモデル別×Verdict別 見落とし率マトリクス
        </span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li
            key={row.model}
            data-testid={`adversary-model-verdict-miss-row-${row.model}`}
            className="rounded-lg border border-white/10 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="opacity-80">{row.model}</span>
              <span
                data-testid={`adversary-model-verdict-miss-overall-${row.model}`}
                className="tabular-nums opacity-60"
              >
                {`非マージ${row.nonMergedCount}件中 見落とし${row.totalMissCount}件（${row.overallMissRatePct.toFixed(1)}%）`}
              </span>
            </div>

            {row.cells.length === 0 ? (
              <p className="mt-2 text-xs opacity-50">非マージ反復なし（見落とし発生の余地なし）</p>
            ) : (
              <ul className="mt-2 space-y-1.5 pl-3">
                {row.cells.map((cell) => (
                  <li key={cell.verdict} data-testid={`adversary-model-verdict-miss-cell-${row.model}-${cell.verdict}`}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="opacity-70">{VERDICT_LABELS[cell.verdict]}</span>
                      <span
                        data-testid={`adversary-model-verdict-miss-rate-${row.model}-${cell.verdict}`}
                        className="tabular-nums opacity-60"
                      >
                        見落とし{cell.missRatePct.toFixed(0)}% ({cell.missCount}/{cell.count})
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        data-testid={`adversary-model-verdict-miss-bar-${row.model}-${cell.verdict}`}
                        className={`h-full ${cell.missRatePct > 0 ? 'bg-rose-400' : 'bg-emerald-400'}`}
                        style={{ width: `${cell.missRatePct.toFixed(2)}%` }}
                      />
                    </div>
                    {cell.iterations.length > 0 && (
                      <p className="mt-0.5 text-[10px] opacity-50">
                        {`見落とし発生反復: ${cell.iterations.map((n) => `#${n}`).join(', ')}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
