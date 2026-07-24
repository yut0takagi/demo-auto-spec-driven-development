import { loadRuns } from '@/lib/loadData';
import { IdeationFailurePanel } from '@/components/IdeationFailurePanel';
import { IdeationCostQualityPanel } from '@/components/IdeationCostQualityPanel';
import { IdeationToStartLeadTimePanel } from '@/components/IdeationToStartLeadTimePanel';
import { IdeationToStartLeadTimeDistributionPanel } from '@/components/IdeationToStartLeadTimeDistributionPanel';
import { IdeationDropRatePanel } from '@/components/IdeationDropRatePanel';
import { IdeationProposalQualityDropPanel } from '@/components/IdeationProposalQualityDropPanel';
import { IdeationEarlyAbandonmentPanel } from '@/components/IdeationEarlyAbandonmentPanel';
import { IdeationQualityDegradationPanel } from '@/components/IdeationQualityDegradationPanel';
import { BacklogLowWaterEtaPanel } from '@/components/BacklogLowWaterEtaPanel';

export default function IdeationPage() {
  const { runs } = loadRuns();

  return (
    <main>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Ideation</h1>
        <p className="mt-1 text-sm opacity-60">
          バックログ補充（ideation）の失敗率・コスト効率・着手までのリードタイムを追跡します。
        </p>
      </header>

      <div className="space-y-6">
        <IdeationQualityDegradationPanel runs={runs} />
        <IdeationFailurePanel runs={runs} />
        <IdeationCostQualityPanel runs={runs} />
        <IdeationToStartLeadTimePanel runs={runs} />
        <IdeationToStartLeadTimeDistributionPanel runs={runs} />
        <IdeationDropRatePanel runs={runs} />
        <IdeationProposalQualityDropPanel runs={runs} />
        <IdeationEarlyAbandonmentPanel runs={runs} />
        <BacklogLowWaterEtaPanel runs={runs} />
      </div>
    </main>
  );
}
