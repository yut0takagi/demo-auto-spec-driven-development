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
import { GateReasonBurdenChart } from '@/components/GateReasonBurdenChart';
import { GateReasonCostPanel } from '@/components/GateReasonCostPanel';
import { GateReasonSeveritySpectrumPanel } from '@/components/GateReasonSeveritySpectrumPanel';
import { GateReasonTrendPanel } from '@/components/GateReasonTrendPanel';
import { GateReasonChainPanel } from '@/components/GateReasonChainPanel';
import { GateReasonConsecutiveFailureChaosPanel } from '@/components/GateReasonConsecutiveFailureChaosPanel';
import { GateReasonUnificationPanel } from '@/components/GateReasonUnificationPanel';
import { AdversaryReasonModelPanel } from '@/components/AdversaryReasonModelPanel';
import { AbandonedIterationsPanel } from '@/components/AbandonedIterationsPanel';
import { PausedDryRunSurvivalPanel } from '@/components/PausedDryRunSurvivalPanel';
import { GatePauseAbandonmentPanel } from '@/components/GatePauseAbandonmentPanel';
import { CostEfficiencyPanel } from '@/components/CostEfficiencyPanel';
import { IdeationCostQualityPanel } from '@/components/IdeationCostQualityPanel';
import { ReviseCyclesByModelPanel } from '@/components/ReviseCyclesByModelPanel';
import { ReviseCyclesByVerdictPanel } from '@/components/ReviseCyclesByVerdictPanel';
import { ReviseVerdictMatrixPanel } from '@/components/ReviseVerdictMatrixPanel';
import { ReviseSizeSuccessPatternPanel } from '@/components/ReviseSizeSuccessPatternPanel';
import { RevisionSizeCurvePanel } from '@/components/RevisionSizeCurvePanel';
import { VerdictDurationComparisonPanel } from '@/components/VerdictDurationComparisonPanel';
import { VerdictTransitionPanel } from '@/components/VerdictTransitionPanel';
import { BreakerRunwayPanel } from '@/components/BreakerRunwayPanel';
import { ModelEffectivenessPanel } from '@/components/ModelEffectivenessPanel';
import { ModelConfidenceWeightedScorePanel } from '@/components/ModelConfidenceWeightedScorePanel';
import { ModelEfficiencyPanel } from '@/components/ModelEfficiencyPanel';
import { ModelApprovalMergeComparisonPanel } from '@/components/ModelApprovalMergeComparisonPanel';
import { AdversaryOutcomeDivergencePanel } from '@/components/AdversaryOutcomeDivergencePanel';
import { AdversaryModelVerdictMissMatrixPanel } from '@/components/AdversaryModelVerdictMissMatrixPanel';
import { BuilderModelSwitchAbPanel } from '@/components/BuilderModelSwitchAbPanel';
import { ModelApprovalRateTrendPanel } from '@/components/ModelApprovalRateTrendPanel';
import { ModelSkillStratificationPanel } from '@/components/ModelSkillStratificationPanel';
import { IdeationFailurePanel } from '@/components/IdeationFailurePanel';
import { E2eReviseCorrelationPanel } from '@/components/E2eReviseCorrelationPanel';
import { E2eDiffSizeCorrelationPanel } from '@/components/E2eDiffSizeCorrelationPanel';
import { CycleTimeTrendPanel } from '@/components/CycleTimeTrendPanel';
import { TimeToFirstPrTrendPanel } from '@/components/TimeToFirstPrTrendPanel';
import { BuilderUtilizationDeclinePanel } from '@/components/BuilderUtilizationDeclinePanel';
import { AdversaryCommentTrendPanel } from '@/components/AdversaryCommentTrendPanel';
import { IssueResolutionTimeTrendPanel } from '@/components/IssueResolutionTimeTrendPanel';
import { IssueLabelSuccessRatePanel } from '@/components/IssueLabelSuccessRatePanel';
import { IdeationToStartLeadTimePanel } from '@/components/IdeationToStartLeadTimePanel';
import { IdeationToStartLeadTimeDistributionPanel } from '@/components/IdeationToStartLeadTimeDistributionPanel';

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
        <AdversaryCommentTrendPanel runs={runs} />
        <EarlyWarningCard runs={runs} />
        <BreakerRunwayPanel runs={runs} />
        <MetricCards summary={summary} />
        <CycleTimeTrendPanel runs={runs} />
        <TimeToFirstPrTrendPanel runs={runs} />
        <BuilderUtilizationDeclinePanel runs={runs} />
        <IssueResolutionTimeTrendPanel runs={runs} />
        <IssueLabelSuccessRatePanel runs={runs} />
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
        <IdeationFailurePanel runs={runs} />
        <IdeationCostQualityPanel runs={runs} />
        <IdeationToStartLeadTimePanel runs={runs} />
        <IdeationToStartLeadTimeDistributionPanel runs={runs} />
        <div className="grid gap-6 lg:grid-cols-2">
          <GateReasonsPanel runs={runs} />
          <GateFailureTypesPanel runs={runs} />
        </div>
        <GateReasonBurdenChart runs={runs} />
        <GateReasonCostPanel runs={runs} />
        <GateReasonSeveritySpectrumPanel runs={runs} />
        <GateReasonTrendPanel runs={runs} />
        <GateReasonChainPanel runs={runs} />
        <GateReasonConsecutiveFailureChaosPanel runs={runs} />
        <GateReasonUnificationPanel runs={runs} />
        <AdversaryReasonModelPanel runs={runs} />
        <AbandonedIterationsPanel runs={runs} />
        <PausedDryRunSurvivalPanel runs={runs} />
        <GatePauseAbandonmentPanel runs={runs} />
        <ReviseCyclesChart runs={runs} />
        <ReviseCyclesByModelPanel runs={runs} />
        <ReviseCyclesByVerdictPanel runs={runs} />
        <ReviseVerdictMatrixPanel runs={runs} />
        <ReviseSizeSuccessPatternPanel runs={runs} />
        <RevisionSizeCurvePanel runs={runs} />
        <VerdictDurationComparisonPanel runs={runs} />
        <VerdictTransitionPanel runs={runs} />
        <E2eReviseCorrelationPanel runs={runs} />
        <E2eDiffSizeCorrelationPanel runs={runs} />
        <ModelEffectivenessPanel runs={runs} />
        <ModelConfidenceWeightedScorePanel runs={runs} />
        <ModelEfficiencyPanel runs={runs} />
        <ModelApprovalMergeComparisonPanel runs={runs} />
        <AdversaryOutcomeDivergencePanel runs={runs} />
        <AdversaryModelVerdictMissMatrixPanel runs={runs} />
        <BuilderModelSwitchAbPanel runs={runs} />
        <ModelApprovalRateTrendPanel runs={runs} />
        <ModelSkillStratificationPanel runs={runs} />
        <IterationTimeline runs={runs} />
        <BacklogPanel runs={runs} repoUrl={REPO_URL} />
      </div>
    </main>
  );
}
