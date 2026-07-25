import type { RunRecord } from '@/lib/types';
import { operatingHourSpectrum, operatingHourCategorySummary, type OperatingHourCategory } from '@/lib/aggregate';

const CATEGORY_LABELS: Record<OperatingHourCategory, string> = {
  business: '営業時間内（平日9-18時）',
  night: '夜間（平日夜間・早朝・土日）',
};

const CATEGORY_COLORS: Record<OperatingHourCategory, string> = {
  business: 'bg-sky-400',
  night: 'bg-indigo-400',
};

export function OperatingHourSpectrumPanel({ runs }: { runs: RunRecord[] }) {
  const spectrum = operatingHourSpectrum(runs);
  const summary = operatingHourCategorySummary(runs);

  if (summary.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          反復の稼働時間帯スペクトラム（JST営業時間内 vs 夜間）
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const totalCount = spectrum.reduce((sum, b) => sum + b.businessCount + b.nightCount, 0);
  const maxCount = Math.max(...spectrum.map((b) => b.businessCount + b.nightCount));

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="operating-hour-spectrum-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          反復の稼働時間帯スペクトラム（JST営業時間内 vs 夜間）
        </span>
        <span className="text-sm tabular-nums opacity-80">{totalCount}反復</span>
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        各反復の開始時刻(startedAt)をJST(UTC+9)に変換し、平日9:00-18:00を営業時間内、それ以外
        （平日夜間・早朝・土日全時間帯）を夜間として時間帯ごとの件数を積み上げ棒で並べたもの。
      </p>

      <ul className="mt-4 flex h-24 items-end gap-0.5" data-testid="operating-hour-bars">
        {spectrum.map((b) => {
          const count = b.businessCount + b.nightCount;
          return (
            <li
              key={b.hour}
              data-testid={`operating-hour-bar-${b.hour}`}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${b.hour}時 / ${count}反復（${CATEGORY_LABELS.business}${b.businessCount} / ${CATEGORY_LABELS.night}${b.nightCount}）`}
            >
              <div
                className={`w-full ${CATEGORY_COLORS.night}`}
                style={{ height: `${maxCount === 0 ? 0 : (b.nightCount / maxCount) * 100}%` }}
              />
              <div
                className={`w-full ${CATEGORY_COLORS.business}`}
                style={{ height: `${maxCount === 0 ? 0 : (b.businessCount / maxCount) * 100}%` }}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex justify-between text-[10px] opacity-40">
        <span>0時</span>
        <span>12時</span>
        <span>23時</span>
      </div>

      <ul className="mt-4 space-y-2">
        {summary.map((s) => (
          <li
            key={s.category}
            data-testid={`operating-hour-category-${s.category}`}
            className="flex items-baseline justify-between text-sm"
          >
            <span className="opacity-80">{CATEGORY_LABELS[s.category]}</span>
            <span data-testid={`operating-hour-category-stats-${s.category}`} className="tabular-nums opacity-60">
              {s.count}反復 / マージ率{(s.mergedRate * 100).toFixed(1)}% / 平均${s.avgCostUsd.toFixed(2)} / 平均
              {Math.round(s.avgDurationSec / 60)}分
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
