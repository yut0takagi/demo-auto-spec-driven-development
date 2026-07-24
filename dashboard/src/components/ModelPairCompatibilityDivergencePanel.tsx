import type { RunRecord } from '@/lib/types';
import { modelPairCompatibilityDivergence } from '@/lib/aggregate';

function formatPt(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}pt`;
}

/**
 * builder × adversary の組み合わせごとに、実測マージ率が両モデルの単体成績から
 * 期待される水準（二元配置の加法モデル: builder単体率 + adversary単体率 - 全体平均）から
 * どれだけ乖離しているかを一覧表示する。ModelEffectivenessPanel や
 * AdversaryOutcomeDivergencePanel がモデルを単独の軸で評価するのに対し、こちらは
 * 「この2モデルの組み合わせ自体に単体成績では説明できない相性があるか」を検知する。
 * builder が常に同じ adversary としか組んだことが無い（交絡）ペアは乖離判定の対象外とし、
 * その旨を明示する。
 */
export function ModelPairCompatibilityDivergencePanel({ runs }: { runs: RunRecord[] }) {
  const rows = modelPairCompatibilityDivergence(runs);
  const divergentCount = rows.filter((r) => r.isDivergent).length;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Model ペア相性の乖離検知</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-pair-compatibility-divergence-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Model ペア相性の乖離検知</span>
        <span data-testid="model-pair-compatibility-divergent-count" className="text-sm tabular-nums opacity-80">
          {rows.length}組中 乖離{divergentCount}組
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => {
          const key = `${row.builder}__${row.adversary}`;
          return (
            <li
              key={key}
              data-testid={`model-pair-compatibility-row-${key}`}
              className="rounded-lg border border-white/10 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="opacity-80">
                  {row.builder} × {row.adversary}
                </span>
                <span className="tabular-nums opacity-60">{row.count}件 (merged {row.mergedCount})</span>
              </div>

              <div className="mt-1.5 flex items-baseline justify-between text-xs">
                <span className="opacity-60">
                  実測 {row.actualMergeRatePct.toFixed(1)}% / 期待 {row.expectedMergeRatePct.toFixed(1)}%
                </span>
                <span
                  data-testid={`model-pair-compatibility-divergence-${key}`}
                  className={`tabular-nums ${
                    row.divergencePt > 0 ? 'text-emerald-400' : row.divergencePt < 0 ? 'text-rose-400' : 'opacity-60'
                  }`}
                >
                  {formatPt(row.divergencePt)}
                </span>
              </div>

              {row.isDivergent ? (
                <p data-testid={`model-pair-compatibility-flag-${key}`} className="mt-1 text-[10px] text-amber-400">
                  乖離検知: 単体成績から想定される水準と{Math.abs(row.divergencePt).toFixed(1)}pt乖離
                </p>
              ) : !row.identifiable ? (
                <p className="mt-1 text-[10px] opacity-50">
                  このペアの組み合わせでしか記録が無いため、乖離判定の対象外（単体成績とペア実績が交絡する）
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
