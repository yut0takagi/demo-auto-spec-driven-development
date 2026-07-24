import type { RunRecord } from '@/lib/types';
import { modelConfidenceWeightedScores } from '@/lib/aggregate';

/** count がこの値未満のモデルは「少数サンプル」として注意書きを出す（priorWeight と揃える）。 */
const LOW_SAMPLE_THRESHOLD = 5;

export function ModelConfidenceWeightedScorePanel({ runs }: { runs: RunRecord[] }) {
  const scores = modelConfidenceWeightedScores(runs);

  if (scores.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          信頼度加重スコア（少数サンプルの暴れ対策）
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxScore = Math.max(...scores.map((s) => s.weightedScore)) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-confidence-weighted-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          信頼度加重スコア（少数サンプルの暴れ対策）
        </span>
        <span className="text-sm tabular-nums opacity-80">{scores.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-3">
        {scores.map((s) => {
          const barPct = (s.weightedScore / maxScore) * 100;
          const isLowSample = s.count < LOW_SAMPLE_THRESHOLD;
          return (
            <li key={s.model} data-testid={`model-confidence-weighted-row-${s.model}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">
                  {s.model}
                  {isLowSample && (
                    <span
                      data-testid={`model-confidence-weighted-lowsample-${s.model}`}
                      className="ml-2 text-[10px] text-amber-400"
                    >
                      少数サンプル注意
                    </span>
                  )}
                </span>
                <span
                  data-testid={`model-confidence-weighted-score-${s.model}`}
                  className="tabular-nums opacity-80"
                >
                  加重{(s.weightedScore * 100).toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`model-confidence-weighted-bar-${s.model}`}
                  className="h-full bg-sky-400"
                  style={{ width: `${barPct.toFixed(2)}%` }}
                />
              </div>
              <p
                data-testid={`model-confidence-weighted-raw-${s.model}`}
                className="mt-1 text-[10px] opacity-50"
              >
                生マージ率{(s.rawMergeRate * 100).toFixed(1)}% ({s.count}件) / 信頼度{(s.confidence * 100).toFixed(0)}%
              </p>
              <p className="mt-0.5 text-[10px] opacity-40">対象iteration: {s.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
