import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdeationProposalQualityDropPanel } from './IdeationProposalQualityDropPanel';
import { IDEATION_DROP_STALENESS_ITERATIONS } from '@/lib/aggregate';
import type { RunRecord } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1',
    iteration: 1,
    issue: { number: 1, title: 't', labels: [] },
    branch: 'loop/1-x',
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:05:00Z',
    durationSec: 300,
    reviseCycles: 0,
    verdict: 'merged',
    gateReasons: [],
    prNumber: 11,
    adversary: { approved: true, summary: '' },
    verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

function text(container: HTMLElement, testid: string): string | null | undefined {
  return container.querySelector(`[data-testid="${testid}"]`)?.textContent;
}

describe('IdeationProposalQualityDropPanel', () => {
  it('run が0件、またはideation実行なし（全てideationUsd=0）なら「データなし」を表示しパネル本体を描画しない（境界値）', () => {
    const empty = render(<IdeationProposalQualityDropPanel runs={[]} />);
    expect(empty.container.querySelector('[data-testid="ideation-proposal-quality-drop-panel"]')).toBeNull();
    empty.unmount();

    const runs = [
      makeRun({ iteration: 1, nextIssues: [10], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: 0.11 } }),
    ];
    const { container } = render(<IdeationProposalQualityDropPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="ideation-proposal-quality-drop-panel"]')).toBeNull();
  });

  it('提案issueが全て猶予期間中(未判定)の場合、判定済み0・ドロップ率「未判定」を正確な値で表示する', () => {
    const runs = [
      makeRun({ iteration: 1, nextIssues: [10, 11], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
    ];
    const { container } = render(<IdeationProposalQualityDropPanel runs={runs} />);
    expect(container.querySelector('[data-testid="ideation-proposal-quality-drop-row-1"]')?.textContent).toBe('12$0.0100未判定');
    expect(text(container, 'ideation-proposal-quality-drop-correlation-batchsize')).toBe('算出不可');
    expect(text(container, 'ideation-proposal-quality-drop-correlation-cost')).toBe('算出不可');
  });

  it('複数batchの提案規模・単価とドロップ率から相関係数を実際に算出する（部分一致に頼らない）', () => {
    const staleIteration = 2 + IDEATION_DROP_STALENESS_ITERATIONS;
    const runs = [
      // batch1: issue10 の1件を提案。単価0.02。着手されドロップ0件
      makeRun({ iteration: 1, issue: { number: 1, title: 'a', labels: [] }, nextIssues: [10], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
      // batch2: issue20,21 の2件を提案。単価0.01（batch1より安い）。両方ドロップ
      makeRun({ iteration: 2, issue: { number: 2, title: 'b', labels: [] }, nextIssues: [20, 21], cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.02, totalUsd: 0.13 } }),
      makeRun({ iteration: 4, issue: { number: 10, title: 'started', labels: [] } }),
      makeRun({ iteration: staleIteration, issue: { number: 999, title: 'filler', labels: [] } }),
    ];
    const { container } = render(<IdeationProposalQualityDropPanel runs={runs} />);

    // 規模が大きいbatchほどドロップ率が高い→正の相関、単価が安いbatchほど高い→負の相関になるはず
    expect(text(container, 'ideation-proposal-quality-drop-correlation-batchsize')).toBe('r = 1.00');
    expect(text(container, 'ideation-proposal-quality-drop-correlation-cost')).toBe('r = -1.00');
    expect(text(container, 'ideation-proposal-quality-drop-row-1')).toBe('11$0.02010%');
    expect(text(container, 'ideation-proposal-quality-drop-row-2')).toBe('22$0.0102100%');
  });
});
