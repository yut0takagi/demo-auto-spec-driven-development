import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { E2eBuilderWorkloadSeparationPanel } from './E2eBuilderWorkloadSeparationPanel';
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

function makeWorkloadRun(iteration: number, e2ePassed: boolean, changedLines: number, builderUsd: number): RunRecord {
  return makeRun({
    iteration,
    verify: { unitPassed: true, e2ePassed, coveragePct: 80 },
    changedLines,
    cost: { builderUsd, adversaryUsd: 0.01, ideationUsd: 0, totalUsd: builderUsd + 0.01 },
  });
}

function renderPanel(runs: RunRecord[]) {
  return render(<E2eBuilderWorkloadSeparationPanel runs={runs} />).container;
}

function textOf(container: HTMLElement, testId: string): string | null {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
}

describe('E2eBuilderWorkloadSeparationPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const container = renderPanel([]);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="e2e-builder-workload-separation-panel"]')).toBeNull();
  });

  it('diff sizeがBuilder稼働量と独立にe2e失敗と関係している場合、偏相関が高いままindependent判定になる', () => {
    // aggregate.test.ts で手計算検算済み: rXY=2/√5, rXZ=1/√5, rYZ=0.4,
    // diffSizePartialCorrelation=4/√21≈0.87, builderWorkloadPartialCorrelation=1/√21≈0.22
    const container = renderPanel([
      makeWorkloadRun(1, true, 100, 0.3),
      makeWorkloadRun(2, true, 200, 0.1),
      makeWorkloadRun(3, false, 300, 0.2),
      makeWorkloadRun(4, false, 400, 0.4),
    ]);

    expect(textOf(container, 'e2e-builder-workload-diffsize-raw')).toBe('r = 0.89');
    expect(textOf(container, 'e2e-builder-workload-workload-raw')).toBe('r = 0.45');
    expect(textOf(container, 'e2e-builder-workload-diffsize-workload')).toBe('r = 0.40');
    expect(textOf(container, 'e2e-builder-workload-diffsize-partial')).toBe('r = 0.87');
    expect(textOf(container, 'e2e-builder-workload-workload-partial')).toBe('r = 0.22');

    const verdict = container.querySelector('[data-testid="e2e-builder-workload-verdict"]');
    expect(verdict?.getAttribute('data-verdict')).toBe('independent');
    expect(verdict?.textContent).toContain('独立に');
  });

  it('diff sizeの単純相関がBuilder稼働量による交絡で説明し尽くされる場合、偏相関0でconfounded判定になる', () => {
    // aggregate.test.ts で手計算検算済み: rXY=2/√6, rXZ=2/√5, rYZ=5/√30 で
    // rXY = rXZ*rYZ が厳密成立し diffSizePartialCorrelation は厳密に0になる。
    const container = renderPanel([
      makeWorkloadRun(1, true, 98, 0.2),
      makeWorkloadRun(2, true, 98, 0.4),
      makeWorkloadRun(3, false, 100, 0.6),
      makeWorkloadRun(4, false, 104, 0.8),
    ]);

    expect(textOf(container, 'e2e-builder-workload-diffsize-partial')).toBe('r = 0.00');
    const verdict = container.querySelector('[data-testid="e2e-builder-workload-verdict"]');
    expect(verdict?.getAttribute('data-verdict')).toBe('confounded');
    expect(verdict?.textContent).toContain('交絡');
  });

  it('diff sizeとBuilder稼働量が完全に連動している(相関1)と偏相関は「算出不可」でundetermined判定になる（境界値）', () => {
    const container = renderPanel([
      makeWorkloadRun(1, true, 100, 1),
      makeWorkloadRun(2, true, 200, 2),
      makeWorkloadRun(3, false, 300, 3),
      makeWorkloadRun(4, false, 400, 4),
    ]);

    expect(textOf(container, 'e2e-builder-workload-diffsize-workload')).toBe('r = 1.00');
    expect(textOf(container, 'e2e-builder-workload-diffsize-partial')).toBe('算出不可');
    expect(textOf(container, 'e2e-builder-workload-workload-partial')).toBe('算出不可');

    const verdict = container.querySelector('[data-testid="e2e-builder-workload-verdict"]');
    expect(verdict?.getAttribute('data-verdict')).toBe('undetermined');
    expect(verdict?.textContent).toBe('判定不能');
  });
});
