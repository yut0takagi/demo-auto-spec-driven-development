import type { RunRecord } from '@/lib/types';
import { reviseCyclesSizeCurve, type ChangeSizeBucketLabel, type ReviseSizeCurveShape } from '@/lib/aggregate';

const TITLE = '変更規模と修正サイクルの非線形カーブ';

const SIZE_BUCKET_LABELS: Record<ChangeSizeBucketLabel, string> = {
  small: '小(~100行)',
  medium: '中(101~300行)',
  large: '大(301行~)',
};

const SHAPE_LABELS: Record<ReviseSizeCurveShape, string> = {
  convex: '加速（非線形に悪化）',
  concave: '減速（伸びは頭打ち）',
  linear: 'ほぼ比例',
  'insufficient-data': 'データ不足',
};

const SHAPE_COLORS: Record<ReviseSizeCurveShape, string> = {
  convex: 'bg-rose-400/20 text-rose-300',
  concave: 'bg-emerald-400/20 text-emerald-300',
  linear: 'bg-sky-400/20 text-sky-300',
  'insufficient-data': 'bg-white/5 text-white/40',
};

const formatDelta = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

export function RevisionSizeCurvePanel({ runs }: { runs: RunRecord[] }) {
  const signal = reviseCyclesSizeCurve(runs);
  const { buckets } = signal;

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxAvg = Math.max(...buckets.map((b) => b.avgReviseCycles)) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="revision-size-curve-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span className={`rounded px-2 py-0.5 text-xs tabular-nums ${SHAPE_COLORS[signal.shape]}`} data-testid="revision-size-curve-shape">
          {SHAPE_LABELS[signal.shape]}
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {buckets.map((b) => (
          <li key={b.sizeBucket} data-testid={`revision-size-curve-row-${b.sizeBucket}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="opacity-80">{SIZE_BUCKET_LABELS[b.sizeBucket]}</span>
              <span data-testid={`revision-size-curve-stats-${b.sizeBucket}`} className="tabular-nums opacity-60">
                平均revise {b.avgReviseCycles.toFixed(2)}回 / 中央値 {b.medianReviseCycles.toFixed(2)}回 ({b.total}件, 平均{b.avgChangedLines.toFixed(0)}行)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                data-testid={`revision-size-curve-bar-${b.sizeBucket}`}
                className="h-full bg-indigo-400"
                style={{ width: `${((b.avgReviseCycles / maxAvg) * 100).toFixed(2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {signal.shape === 'insufficient-data' ? (
        <p className="mt-3 text-[10px] opacity-50">区分ごとの反復数が不足しているため、カーブ形状（加速/減速/比例）は未判定です。</p>
      ) : (
        <p className="mt-3 text-[10px] opacity-50" data-testid="revision-size-curve-deltas">
          小→中 {formatDelta(signal.smallToMediumDelta ?? 0)}回 ・ 中→大{' '}
          {formatDelta(signal.mediumToLargeDelta ?? 0)}回 ・ 傾き差{' '}
          {formatDelta(signal.accelerationDelta ?? 0)}回
        </p>
      )}
    </div>
  );
}
