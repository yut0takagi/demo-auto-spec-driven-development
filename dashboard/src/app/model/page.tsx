import { loadRuns } from '@/lib/loadData';
import { ModelEffectivenessPanel } from '@/components/ModelEffectivenessPanel';
import { ModelConfidenceWeightedScorePanel } from '@/components/ModelConfidenceWeightedScorePanel';
import { ModelEfficiencyPanel } from '@/components/ModelEfficiencyPanel';
import { ModelApprovalMergeComparisonPanel } from '@/components/ModelApprovalMergeComparisonPanel';
import { AdversaryOutcomeDivergencePanel } from '@/components/AdversaryOutcomeDivergencePanel';
import { AdversaryModelVerdictMissMatrixPanel } from '@/components/AdversaryModelVerdictMissMatrixPanel';
import { BuilderModelSwitchAbPanel } from '@/components/BuilderModelSwitchAbPanel';
import { ModelSwitchPerformanceGapPanel } from '@/components/ModelSwitchPerformanceGapPanel';
import { ModelApprovalRateTrendPanel } from '@/components/ModelApprovalRateTrendPanel';
import { ModelSkillStratificationPanel } from '@/components/ModelSkillStratificationPanel';
import { ModelPairCompatibilityDivergencePanel } from '@/components/ModelPairCompatibilityDivergencePanel';
import { ModelIssueLabelSuccessMatrixPanel } from '@/components/ModelIssueLabelSuccessMatrixPanel';
import { BuilderModelGateReasonCorrelationPanel } from '@/components/BuilderModelGateReasonCorrelationPanel';
import { BuilderModelGateReasonCorrelationTrendPanel } from '@/components/BuilderModelGateReasonCorrelationTrendPanel';
import { ModelCostRoleBiasPanel } from '@/components/ModelCostRoleBiasPanel';

export default function ModelPage() {
  const { runs } = loadRuns();

  return (
    <main>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">モデル比較</h1>
        <p className="mt-1 text-sm opacity-60">
          Builder/Adversary に使われたモデル別の効果・効率・承認⇔実結果の乖離を比較します。
        </p>
      </header>

      <div className="space-y-6">
        <ModelEffectivenessPanel runs={runs} />
        <ModelConfidenceWeightedScorePanel runs={runs} />
        <ModelEfficiencyPanel runs={runs} />
        <ModelApprovalMergeComparisonPanel runs={runs} />
        <AdversaryOutcomeDivergencePanel runs={runs} />
        <AdversaryModelVerdictMissMatrixPanel runs={runs} />
        <BuilderModelSwitchAbPanel runs={runs} />
        <ModelSwitchPerformanceGapPanel runs={runs} />
        <ModelApprovalRateTrendPanel runs={runs} />
        <ModelSkillStratificationPanel runs={runs} />
        <ModelPairCompatibilityDivergencePanel runs={runs} />
        <ModelIssueLabelSuccessMatrixPanel runs={runs} />
        <BuilderModelGateReasonCorrelationPanel runs={runs} />
        <BuilderModelGateReasonCorrelationTrendPanel runs={runs} />
        <ModelCostRoleBiasPanel runs={runs} />
      </div>
    </main>
  );
}
