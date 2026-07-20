import type { TrendPoint } from '@/lib/aggregate';

export function TrendChart({
  title,
  points,
  unit,
}: {
  title: string;
  points: TrendPoint[];
  unit: string;
}) {
  const width = 640;
  const height = 160;
  const pad = 24;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{title}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const span = maxValue - minValue || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  const path = points
    .map((p, i) => {
      const x = pad + stepX * i;
      const y = height - pad - ((p.value - minValue) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // points.length === 1 のとき stepX は 0 にガード済みだが、path は "M x,y" のみの
  // moveto 単独になり、線分（L コマンド）が無いため stroke が実質何も描かれない。
  // 単一点でも「データがある」ことが視覚的にわかるよう circle で目印を描く。
  const singlePoint =
    points.length === 1
      ? {
          x: pad,
          y: height - pad - ((points[0].value - minValue) / span) * (height - pad * 2),
        }
      : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{title}</span>
        <span className="text-sm tabular-nums opacity-80">
          {values[values.length - 1].toFixed(1)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label={title}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-sky-400" />
        {singlePoint && (
          <circle
            cx={singlePoint.x.toFixed(1)}
            cy={singlePoint.y.toFixed(1)}
            r={3}
            fill="currentColor"
            className="text-sky-400"
          />
        )}
      </svg>
    </div>
  );
}
