import type { RunRecord } from '@/lib/types';
import { gateReasonChains, type GateReasonCategory } from '@/lib/aggregate';

// GateReasonsPanel/GateReasonBurdenChart/GateReasonTrendPanel の CATEGORY_LABELS と
// 同じカテゴリ・同じ表示順（gates.py の evaluate_gate が理由を積む順）。同じカテゴリが
// どのパネルでも同じ呼称で見えるよう揃えている。
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

export function GateReasonChainPanel({ runs }: { runs: RunRecord[] }) {
  const chains = gateReasonChains(runs);

  if (chains.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-chain-panel">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由の連鎖（パス別）</div>
        <p className="mt-4 text-sm opacity-50">データなし（gateReasonsを持つ反復はありません）</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reason-chain-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由の連鎖（パス別）</span>
        <span className="text-sm tabular-nums opacity-80">{chains.length}パス</span>
      </div>

      <ul className="mt-4 space-y-3">
        {chains.map((chain) => (
          <li
            key={chain.iteration}
            data-testid={`gate-reason-chain-row-${chain.iteration}`}
            data-verdict={chain.verdict}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="opacity-80">
                #{chain.iteration} · issue #{chain.issueNumber}
              </span>
              <span className="shrink-0 tabular-nums opacity-50">{chain.verdict}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-70">
              {chain.categories.map((category, i) => (
                <span key={category} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">→</span>}
                  <span data-testid={`gate-reason-chain-category-${chain.iteration}-${category}`}>
                    {CATEGORY_LABELS[category]}
                  </span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
