import type { LoopStatus } from '@/lib/types';

const STATE_STYLES: Record<LoopStatus['state'], string> = {
  RUNNING: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  PAUSED: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  HALTED: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
};

/**
 * `loadStatus` は `updatedAt` が string であることしか検証しない。
 * 不正な日付文字列（例: 壊れた Python 側の出力）が来ると
 * `new Date(...).toISOString()` は `RangeError` を投げ、static export の
 * ビルドごと落ちてしまう。まさに異常時に人間が状態を見られなくなる、という
 * このダッシュボードが最も避けたい失敗モードなのでガードする。
 */
function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return `不明な日時 (${updatedAt})`;
  }
  return date.toISOString();
}

export function StatusBadge({ status }: { status: LoopStatus }) {
  return (
    <section
      data-testid="status-badge"
      data-state={status.state}
      className={`rounded-xl border p-6 ${STATE_STYLES[status.state]}`}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-3xl font-bold tracking-tight">{status.state}</span>
        <span className="text-sm opacity-70">updated {formatUpdatedAt(status.updatedAt)}</span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 opacity-60">理由</dt>
          <dd>{status.reason}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 opacity-60">停止主体</dt>
          <dd>{status.actor}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 opacity-60">再開手順</dt>
          <dd className="font-mono text-xs">{status.resumeHint}</dd>
        </div>
      </dl>
    </section>
  );
}
