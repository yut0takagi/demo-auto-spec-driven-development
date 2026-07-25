import type { RunRecord } from '@/lib/types';
import { gateReasonCooccurrenceClusters, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonChainPanel等の CATEGORY_LABELS と同じカテゴリ・同じ表示順
// （gates.py の evaluate_gate が理由を積む順）。同じカテゴリがどのパネルでも
// 同じ呼称で見えるよう揃えている。
const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  adversaryUnparseable: 'adversary出力解析不能',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

export function GateReasonCooccurrenceClusterPanel({ runs }: { runs: RunRecord[] }) {
  const clusters = gateReasonCooccurrenceClusters(runs);

  if (clusters.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-cooccurrence-cluster-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由の共起クラスタ</div>
        <p className="mt-4 text-sm opacity-50">データなし（閾値以上で共起するカテゴリの組はありません）</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-cooccurrence-cluster-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由の共起クラスタ</span>
        <span className="text-sm tabular-nums opacity-80">{clusters.length}クラスタ</span>
      </div>

      <ul className="mt-4 space-y-3">
        {clusters.map((cluster, i) => (
          <li
            key={cluster.categories.join('|')}
            data-testid={`gate-reason-cooccurrence-cluster-${i}`}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-center gap-1 opacity-80">
                {cluster.categories.map((category, j) => (
                  <span key={category} className="flex items-center gap-1">
                    {j > 0 && <span aria-hidden="true">×</span>}
                    <span data-testid={`gate-reason-cooccurrence-cluster-${i}-category-${category}`}>
                      {CATEGORY_LABELS[category]}
                    </span>
                  </span>
                ))}
              </span>
              <span className="shrink-0 tabular-nums opacity-50">
                共起{cluster.totalCooccurrences}件・{cluster.iterations.length}反復
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-xs opacity-70">
              {cluster.pairs.map((pair) => (
                <li key={pair.categories.join('|')}>
                  {CATEGORY_LABELS[pair.categories[0]]} × {CATEGORY_LABELS[pair.categories[1]]}: {pair.count}件
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
