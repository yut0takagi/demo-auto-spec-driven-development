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
import { IterationTimeline } from '@/components/IterationTimeline';
import { BacklogPanel } from '@/components/BacklogPanel';
import { VerdictSummaryBubble } from '@/components/VerdictSummaryBubble';
import { ModelCostBreakdown } from '@/components/ModelCostBreakdown';
import { BuilderComparisonCard } from '@/components/BuilderComparisonCard';
import { EarlyWarningCard } from '@/components/EarlyWarningCard';
import { CostEfficiencyPanel } from '@/components/CostEfficiencyPanel';
import { BreakerRunwayPanel } from '@/components/BreakerRunwayPanel';
import { MergedStreakPanel } from '@/components/MergedStreakPanel';
import { CycleTimeTrendPanel } from '@/components/CycleTimeTrendPanel';
import { TimeToFirstPrTrendPanel } from '@/components/TimeToFirstPrTrendPanel';
import { BuilderUtilizationDeclinePanel } from '@/components/BuilderUtilizationDeclinePanel';
import { AdversaryCommentTrendPanel } from '@/components/AdversaryCommentTrendPanel';
import { IssueResolutionTimeTrendPanel } from '@/components/IssueResolutionTimeTrendPanel';
import { IssueLabelSuccessRatePanel } from '@/components/IssueLabelSuccessRatePanel';
import { IssueLabelQualityRecoveryMatrixPanel } from '@/components/IssueLabelQualityRecoveryMatrixPanel';

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
    <main>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">自己観測ダッシュボード</h1>
        <p className="mt-1 text-sm opacity-60">
          このリポジトリを無人で開発し続けているループの稼働状況。詳細はナビの各ページで確認できます。
        </p>
      </header>

      <div className="space-y-6">
        <LoadErrorBanner errors={errors} />
        <StatusBadge status={status} />
        <VerdictSummaryBubble runs={runs} />
        <AdversaryCommentTrendPanel runs={runs} />
        <EarlyWarningCard runs={runs} />
        <BreakerRunwayPanel runs={runs} />
        <MergedStreakPanel runs={runs} />
        <MetricCards summary={summary} />
        <CycleTimeTrendPanel runs={runs} />
        <TimeToFirstPrTrendPanel runs={runs} />
        <BuilderUtilizationDeclinePanel runs={runs} />
        <IssueResolutionTimeTrendPanel runs={runs} />
        <IssueLabelSuccessRatePanel runs={runs} />
        <IssueLabelQualityRecoveryMatrixPanel runs={runs} />
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
        <IterationTimeline runs={runs} />
        <BacklogPanel runs={runs} repoUrl={REPO_URL} />
      </div>
    </main>
  );
}
