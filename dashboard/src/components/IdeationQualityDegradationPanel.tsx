import type { RunRecord } from '@/lib/types';
import { ideationQualityDegradationSignal, type IdeationQualityDegradationLevel } from '@/lib/aggregate';

const LEVEL_LABELS: Record<IdeationQualityDegradationLevel, string> = {
  critical: '警戒',
  watch: '注視',
  normal: '平常',
};

const LEVEL_STYLES: Record<IdeationQualityDegradationLevel, string> = {
  critical: 'text-rose-400',
  watch: 'text-amber-400',
  normal: 'text-emerald-400',
};

const LEVEL_DOT_STYLES: Record<IdeationQualityDegradationLevel, string> = {
  critical: 'bg-rose-400',
  watch: 'bg-amber-400',
  normal: 'bg-emerald-400',
};

export function IdeationQualityDegradationPanel({ runs }: { runs: RunRecord[] }) {
  const signal = ideationQualityDegradationSignal(runs);

  if (!signal) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Ideation提案品質低下の多面的早期検知</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="ideation-quality-degradation-panel"
      data-level={signal.level}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Ideation提案品質低下の多面的早期検知</span>
        <span
          data-testid="ideation-quality-degradation-level"
          className={`flex items-center gap-1.5 text-sm font-semibold ${LEVEL_STYLES[signal.level]}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${LEVEL_DOT_STYLES[signal.level]}`} />
          {LEVEL_LABELS[signal.level]}
        </span>
      </div>

      <p className="mt-2 text-xs opacity-60" data-testid="ideation-quality-degradation-counts">
        {signal.degradedCount}/{signal.availableCount} 面で悪化を検知（{signal.criticalThreshold}面以上でcritical）
      </p>

      <ul className="mt-4 space-y-1.5 text-xs">
        {signal.facets.map((facet) => (
          <li
            key={facet.key}
            data-testid={`ideation-quality-degradation-facet-${facet.key}`}
            data-available={facet.available}
            data-degraded={facet.degraded}
            className="flex items-center justify-between"
          >
            <span className="opacity-70">{facet.label}</span>
            <span
              className={
                !facet.available ? 'opacity-40' : facet.degraded ? 'font-semibold text-rose-400' : 'text-emerald-400'
              }
            >
              {!facet.available ? 'データ不足' : facet.degraded ? '悪化' : '正常'}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10px] opacity-50">
        性質の異なる4つの面（ドロップ連続・リードタイム悪化・早期abandonment悪化・規模とドロップ率の相関）を束ね、
        {signal.criticalThreshold}面以上が同時に悪化を示すとcriticalとして早期警戒する。
      </p>
    </div>
  );
}
