import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RetryCostEfficiencyTrendPanel } from './RetryCostEfficiencyTrendPanel';
import type { RunRecord } from '@/lib/types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1', iteration: 1, branch: 'loop/1-x', durationSec: 300, reviseCycles: 0,
    issue: { number: 1, title: 't', labels: [] }, verdict: 'merged', gateReasons: [], prNumber: 11,
    startedAt: '2026-07-20T00:00:00Z', finishedAt: '2026-07-20T00:05:00Z', changedLines: 10,
    adversary: { approved: true, summary: '' }, verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

/** iteration 1..coverages.length の完了runを、coveragePct・reviseCycles・cost(USD)から生成する。 */
function makeRetryCostRuns(coverages: number[], reviseCycles: number[], costs: number[]): RunRecord[] {
  return coverages.map((coveragePct, i) =>
    makeRun({
      iteration: i + 1,
      verify: { unitPassed: true, e2ePassed: true, coveragePct },
      reviseCycles: reviseCycles[i],
      cost: { builderUsd: costs[i], adversaryUsd: 0, ideationUsd: 0, totalUsd: costs[i] },
    }),
  );
}

describe('RetryCostEfficiencyTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<RetryCostEfficiencyTrendPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="retry-cost-efficiency-panel"]')).toBeNull();
  });

  it('非空データでパネル・行・棒の件数がtrend点数と一致し、値も一致する', () => {
    // 前半3件: coverage90/cost per-cycle1、後半3件: coverage50/cost per-cycle4（品質悪化+単価上昇）
    const coverages = [90, 90, 90, 50, 50, 50];
    const cycles = [1, 1, 1, 1, 1, 1];
    const costs = [1, 1, 1, 4, 4, 4];
    const { container } = render(
      <RetryCostEfficiencyTrendPanel runs={makeRetryCostRuns(coverages, cycles, costs)} />,
    );
    expect(container.querySelector('[data-testid="retry-cost-efficiency-panel"]')).not.toBeNull();

    const rows = container.querySelectorAll('[data-testid^="retry-cost-efficiency-row-"]');
    const bars = container.querySelectorAll('[data-testid^="retry-cost-efficiency-bar-"]');
    expect(rows).toHaveLength(1);
    expect(bars).toHaveLength(1);

    const row = container.querySelector('[data-testid="retry-cost-efficiency-row-6"]');
    expect(row?.textContent).toContain('50%');
    expect(row?.textContent).toContain('$4.000');
    expect(row?.textContent).toContain((50 / 4).toFixed(1));

    expect(container.querySelector('[data-testid="retry-cost-efficiency-direction"]')?.textContent).toBe('悪化');
    const headline = container.querySelector('[data-testid="retry-cost-efficiency-value"]')?.textContent ?? '';
    expect(headline).toContain('$4.000');
  });

  it('窓内にreviseCycles>0の反復が無い点は「算出不可」表示になりクラッシュしない', () => {
    const coverages = [80, 80, 80, 60, 60, 60];
    const cycles = [0, 0, 0, 0, 0, 0];
    const costs = [1, 1, 1, 2, 2, 2];
    const { container } = render(
      <RetryCostEfficiencyTrendPanel runs={makeRetryCostRuns(coverages, cycles, costs)} />,
    );
    const row = container.querySelector('[data-testid="retry-cost-efficiency-row-6"]');
    expect(row?.textContent).toContain('算出不可');
    expect(row?.textContent).not.toContain('NaN');
    expect(row?.textContent).not.toContain('Infinity');
    const headline = container.querySelector('[data-testid="retry-cost-efficiency-value"]')?.textContent ?? '';
    expect(headline).toContain('算出不可');
    // costPerCycleChangePctもnullのためdirectionはflatになる
    expect(container.querySelector('[data-testid="retry-cost-efficiency-direction"]')?.textContent).toBe('横ばい');
  });

  it('品質改善+単価低下のfixtureでは方向ラベルが「改善」になる', () => {
    const coverages = [50, 50, 50, 90, 90, 90];
    const cycles = [1, 1, 1, 1, 1, 1];
    const costs = [4, 4, 4, 1, 1, 1];
    const { container } = render(
      <RetryCostEfficiencyTrendPanel runs={makeRetryCostRuns(coverages, cycles, costs)} />,
    );
    expect(container.querySelector('[data-testid="retry-cost-efficiency-direction"]')?.textContent).toBe('改善');
  });
});
