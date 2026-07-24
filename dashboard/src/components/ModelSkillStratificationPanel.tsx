import type { RunRecord } from '@/lib/types';
import {
  modelSkillStratification,
  type ModelSkillPressureVerdict,
  type ReviseVerdictBucketLabel,
} from '@/lib/aggregate';

const BUCKET_LABELS: Record<ReviseVerdictBucketLabel, string> = {
  '0': 'revise 0回',
  '1': 'revise 1回',
  '2': 'revise 2回',
  '3+': 'revise 3回以上',
};

const VERDICT_LABELS: Record<ModelSkillPressureVerdict, string> = {
  degrades: '負荷に弱い',
  improves: '負荷でむしろ改善',
  resilient: '負荷耐性あり',
  'insufficient-data': 'データ不足',
};

const VERDICT_COLORS: Record<ModelSkillPressureVerdict, string> = {
  degrades: 'text-rose-400',
  improves: 'text-emerald-400',
  resilient: 'text-sky-400',
  'insufficient-data': 'opacity-50',
};

export function ModelSkillStratificationPanel({ runs }: { runs: RunRecord[] }) {
  const stratification = modelSkillStratification(runs);

  if (stratification.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Modelスキル階層分析（revise-cycle pressure耐性）
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-skill-stratification-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Modelスキル階層分析（revise-cycle pressure耐性）
        </span>
        <span className="text-sm tabular-nums opacity-80">{stratification.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-4">
        {stratification.map((s) => (
          <li key={s.model} data-testid={`model-skill-stratification-model-${s.model}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="opacity-80">{s.model}</span>
              <span
                data-testid={`model-skill-stratification-verdict-${s.model}`}
                className={`tabular-nums ${VERDICT_COLORS[s.verdict]}`}
              >
                {VERDICT_LABELS[s.verdict]}
                {s.pressureDeltaPct !== null && ` (${s.pressureDeltaPct >= 0 ? '+' : ''}${s.pressureDeltaPct.toFixed(1)}pt)`}
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-3">
              {s.cells.map((cell) => (
                <li
                  key={cell.bucket}
                  data-testid={`model-skill-stratification-cell-${s.model}-${cell.bucket}`}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px]"
                >
                  <span className="opacity-70">{BUCKET_LABELS[cell.bucket]}</span>
                  <span
                    data-testid={`model-skill-stratification-rate-${s.model}-${cell.bucket}`}
                    className="ml-2 tabular-nums opacity-90"
                  >
                    {(cell.mergeRate * 100).toFixed(0)}% ({cell.mergedCount}/{cell.count}件)
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
