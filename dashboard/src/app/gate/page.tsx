import { loadRuns } from '@/lib/loadData';
import { GateReasonsPanel } from '@/components/GateReasonsPanel';
import { GateFailureTypesPanel } from '@/components/GateFailureTypesPanel';
import { GateReasonBurdenChart } from '@/components/GateReasonBurdenChart';
import { GateReasonCostPanel } from '@/components/GateReasonCostPanel';
import { GateReasonSeveritySpectrumPanel } from '@/components/GateReasonSeveritySpectrumPanel';
import { GateReasonTrendPanel } from '@/components/GateReasonTrendPanel';
import { GateReasonChainPanel } from '@/components/GateReasonChainPanel';
import { GateReasonCooccurrenceClusterPanel } from '@/components/GateReasonCooccurrenceClusterPanel';
import { GateReasonConsecutiveFailureChaosPanel } from '@/components/GateReasonConsecutiveFailureChaosPanel';
import { GateReasonUnificationPanel } from '@/components/GateReasonUnificationPanel';
import { GateReasonRecoveryPanel } from '@/components/GateReasonRecoveryPanel';
import { AdversaryReasonModelPanel } from '@/components/AdversaryReasonModelPanel';
import { AbandonedIterationsPanel } from '@/components/AbandonedIterationsPanel';
import { AbandonedReasonBreakdownPanel } from '@/components/AbandonedReasonBreakdownPanel';
import { ApprovedButBuilderFailedPanel } from '@/components/ApprovedButBuilderFailedPanel';
import { PausedDryRunSurvivalPanel } from '@/components/PausedDryRunSurvivalPanel';
import { GatePauseAbandonmentPanel } from '@/components/GatePauseAbandonmentPanel';
import { PausedDryRunResumeTrendPanel } from '@/components/PausedDryRunResumeTrendPanel';

export default function GatePage() {
  const { runs } = loadRuns();

  return (
    <main>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">ゲート・離脱</h1>
        <p className="mt-1 text-sm opacity-60">
          ゲート不通過理由の分類・コスト・時系列傾向と、abandoned/paused/dry-run など非マージ反復の離脱分析です。
        </p>
      </header>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <GateReasonsPanel runs={runs} />
          <GateFailureTypesPanel runs={runs} />
        </div>
        <GateReasonBurdenChart runs={runs} />
        <GateReasonCostPanel runs={runs} />
        <GateReasonSeveritySpectrumPanel runs={runs} />
        <GateReasonTrendPanel runs={runs} />
        <GateReasonChainPanel runs={runs} />
        <GateReasonCooccurrenceClusterPanel runs={runs} />
        <GateReasonConsecutiveFailureChaosPanel runs={runs} />
        <GateReasonUnificationPanel runs={runs} />
        <GateReasonRecoveryPanel runs={runs} />
        <AdversaryReasonModelPanel runs={runs} />
        <AbandonedIterationsPanel runs={runs} />
        <AbandonedReasonBreakdownPanel runs={runs} />
        <ApprovedButBuilderFailedPanel runs={runs} />
        <PausedDryRunSurvivalPanel runs={runs} />
        <GatePauseAbandonmentPanel runs={runs} />
        <PausedDryRunResumeTrendPanel runs={runs} />
      </div>
    </main>
  );
}
