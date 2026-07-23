import { loadRuns, loadStatus } from '@/lib/loadData';
import {
  summarize,
  coverageTrend,
  costTrend,
  approvalRateTrend,
  mergeRateTrend,
  e2eFailureRateTrend,
  changedLinesTrend,
} from '@/lib/aggregate';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { MetricCards } from '@/components/MetricCards';
import { TrendChart } from '@/components/TrendChart';
import { ReviseCyclesChart } from '@/components/ReviseCyclesChart';
import { IterationTimeline } from '@/components/IterationTimeline';
import { BacklogPanel } from '@/components/BacklogPanel';
import { VerdictSummaryBubble } from '@/components/VerdictSummaryBubble';
import { ModelCostBreakdown } from '@/components/ModelCostBreakdown';
import { BuilderComparisonCard } from '@/components/BuilderComparisonCard';
import { EarlyWarningCard } from '@/components/EarlyWarningCard';
import { GateReasonsPanel } from '@/components/GateReasonsPanel';
import { GateFailureTypesPanel } from '@/components/GateFailureTypesPanel';
import { CostEfficiencyPanel } from '@/components/CostEfficiencyPanel';

const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ??
  'https://github.com/yut0takagi/demo-auto-spec-driven-development';

export default function Home() {
  // Task 4 の設計反転により loadRuns() は throw せず { runs, errors } を返す。
  // errors は LoadErrorBanner でダッシュボード上に明示する（状態バッジより上）。
  const { runs, errors } = loadRuns();
  const status = loadStatus();
  const summary = summarize(runs);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">自己観測ダッシュボード</h1>
        <p className="mt-1 text-sm opacity-60">
          このリポジトリを無人で開発し続けているループの稼働状況
        </p>
      </header>

      <div className="space-y-6">
        <LoadErrorBanner errors={errors} />
        <StatusBadge status={status} />
        <VerdictSummaryBubble runs={runs} />
        <EarlyWarningCard runs={runs} />
        <MetricCards summary={summary} />
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendChart title="カバレッジ推移" points={coverageTrend(runs)} unit="%" />
          <TrendChart title="累計コスト" points={costTrend(runs)} unit=" USD" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendChart title="承認率推移" points={approvalRateTrend(runs)} unit="%" />
          <TrendChart title="マージ率推移" points={mergeRateTrend(runs)} unit="%" />
        </div>
        <TrendChart title="E2E失敗率推移" points={e2eFailureRateTrend(runs)} unit="%" />
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendChart title="変更行数推移" points={changedLinesTrend(runs)} unit="行" />
          <BuilderComparisonCard runs={runs} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ModelCostBreakdown runs={runs} />
          <CostEfficiencyPanel runs={runs} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <GateReasonsPanel runs={runs} />
          <GateFailureTypesPanel runs={runs} />
        </div>
        <ReviseCyclesChart runs={runs} />
        <IterationTimeline runs={runs} />
        <BacklogPanel runs={runs} repoUrl={REPO_URL} />
      </div>
    </main>
  );
}
