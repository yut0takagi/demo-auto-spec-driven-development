import { loadRuns } from '@/lib/loadData';
import { ReviseCyclesChart } from '@/components/ReviseCyclesChart';
import { ReviseCyclesByModelPanel } from '@/components/ReviseCyclesByModelPanel';
import { ReviseStopPatternByModelPanel } from '@/components/ReviseStopPatternByModelPanel';
import { ReviseCyclesByVerdictPanel } from '@/components/ReviseCyclesByVerdictPanel';
import { ReviseVerdictMatrixPanel } from '@/components/ReviseVerdictMatrixPanel';
import { ReviseCycleCostRecoveryPanel } from '@/components/ReviseCycleCostRecoveryPanel';
import { ReviseSizeSuccessPatternPanel } from '@/components/ReviseSizeSuccessPatternPanel';
import { RevisionSizeCurvePanel } from '@/components/RevisionSizeCurvePanel';
import { VerdictDurationComparisonPanel } from '@/components/VerdictDurationComparisonPanel';
import { VerdictTransitionPanel } from '@/components/VerdictTransitionPanel';
import { VerdictTransitionRootCausePanel } from '@/components/VerdictTransitionRootCausePanel';
import { E2eReviseCorrelationPanel } from '@/components/E2eReviseCorrelationPanel';
import { E2eDiffSizeCorrelationPanel } from '@/components/E2eDiffSizeCorrelationPanel';
import { BuilderVolumeApprovalCouplingPanel } from '@/components/BuilderVolumeApprovalCouplingPanel';

export default function RevisePage() {
  const { runs } = loadRuns();

  return (
    <main>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Revise</h1>
        <p className="mt-1 text-sm opacity-60">
          revise サイクルの分布・コスト回収効率と、verdict/E2E失敗との相関を追跡します。
        </p>
      </header>

      <div className="space-y-6">
        <ReviseCyclesChart runs={runs} />
        <ReviseCyclesByModelPanel runs={runs} />
        <ReviseStopPatternByModelPanel runs={runs} />
        <ReviseCyclesByVerdictPanel runs={runs} />
        <ReviseVerdictMatrixPanel runs={runs} />
        <ReviseCycleCostRecoveryPanel runs={runs} />
        <ReviseSizeSuccessPatternPanel runs={runs} />
        <RevisionSizeCurvePanel runs={runs} />
        <VerdictDurationComparisonPanel runs={runs} />
        <VerdictTransitionPanel runs={runs} />
        <VerdictTransitionRootCausePanel runs={runs} />
        <E2eReviseCorrelationPanel runs={runs} />
        <E2eDiffSizeCorrelationPanel runs={runs} />
        <BuilderVolumeApprovalCouplingPanel runs={runs} />
      </div>
    </main>
  );
}
