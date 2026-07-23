import type { RunRecord, Verdict } from '@/lib/types';

/**
 * verdict ごとの見出し・色・敵対的レビューの発言としての体裁。
 * `Record<Verdict, ...>` なので Verdict にメンバーが増えると typecheck が落ち、
 * ここへの追加漏れを構造的に防ぐ（IterationTimeline の VERDICT_STYLES と同じ狙い）。
 */
const VERDICT_PRESENTATION: Record<
  Verdict,
  { label: string; icon: string; tone: string; tail: string }
> = {
  merged: {
    label: 'マージ成功',
    icon: '✅',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    tail: 'border-t-emerald-500/40',
  },
  abandoned: {
    label: '見送り（自動）',
    icon: '🚫',
    tone: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    tail: 'border-t-orange-500/40',
  },
  'needs-human': {
    label: '人間対応が必要',
    icon: '🙋',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    tail: 'border-t-amber-500/40',
  },
  paused: {
    label: '一時停止',
    icon: '⏸',
    tone: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    tail: 'border-t-sky-500/40',
  },
  'dry-run': {
    label: 'ドライラン',
    icon: '🧪',
    tone: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
    tail: 'border-t-fuchsia-500/40',
  },
  failed: {
    label: '異常終了',
    icon: '💥',
    tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    tail: 'border-t-rose-500/40',
  },
};

/**
 * adversary.summary が空文字/空白のみの場合のフォールバック。
 * 0018.json のような「例外で審査に到達しなかった」run でも summary 自体は
 * 埋まっているのが実データの前提だが、契約上 summary は空文字も許容するため
 * 吹き出しが空白のまま表示される事故を防ぐ。
 */
function bubbleText(run: RunRecord): string {
  const summary = run.adversary.summary.trim();
  if (summary.length > 0) return summary;
  if (run.gateReasons.length > 0) return run.gateReasons.join(' / ');
  return '（この反復にはサマリーが記録されていません）';
}

export function VerdictSummaryBubble({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) {
    return (
      <div
        data-testid="verdict-summary-bubble"
        className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm opacity-50"
      >
        まだ反復がありません
      </div>
    );
  }

  const latest = [...runs].sort((a, b) => b.iteration - a.iteration)[0];
  const presentation = VERDICT_PRESENTATION[latest.verdict];

  return (
    <div
      data-testid="verdict-summary-bubble"
      data-verdict={latest.verdict}
      className="rounded-xl border border-white/10 bg-white/5 p-5"
    >
      <div className="text-xs uppercase tracking-wider opacity-60">直近の反復サマリー</div>
      <div className="mt-3 flex items-start gap-3">
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${presentation.tone}`}
        >
          {presentation.icon} {presentation.label}
        </span>
        <span className="pt-1 text-xs tabular-nums opacity-50">
          #{latest.iteration} · issue #{latest.issue.number}
        </span>
      </div>
      <div className="relative mt-3 ml-2">
        <div className={`absolute -top-2 left-4 h-0 w-0 border-x-8 border-x-transparent border-t-8 ${presentation.tail}`} />
        <div className={`rounded-lg rounded-tl-none border p-4 text-sm leading-relaxed ${presentation.tone}`}>
          {bubbleText(latest)}
        </div>
      </div>
      {latest.gateReasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs opacity-60">
          {latest.gateReasons.map((reason, i) => (
            <li key={i}>・{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
