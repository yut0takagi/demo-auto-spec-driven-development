import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostQualityElasticityTrendPanel } from './CostQualityElasticityTrendPanel';
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

/** iteration 1..costs.length の完了runを、cost(USD)とapproved配列から生成する。 */
function makeElasticityRuns(costs: number[], approved: boolean[]): RunRecord[] {
  return costs.map((cost, i) =>
    makeRun({
      iteration: i + 1,
      cost: { builderUsd: cost, adversaryUsd: 0, ideationUsd: 0, totalUsd: cost },
      adversary: { approved: approved[i], summary: '' },
      verdict: approved[i] ? 'merged' : 'needs-human',
    }),
  );
}

describe('CostQualityElasticityTrendPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<CostQualityElasticityTrendPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="cost-quality-elasticity-panel"]')).toBeNull();
  });

  it('十分な件数のfixtureでヘッドライン/行が期待値と一致し、elasticity=nullの行は「算出不可」になる', () => {
    // 1点目(iter10): elasticity=1.5, 2点目(iter11,最新): elasticity=2/3(弱含み)
    const costs = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 4];
    const approved = [false, false, false, true, true, true, true, true, true, true, true];
    const { container } = render(<CostQualityElasticityTrendPanel runs={makeElasticityRuns(costs, approved)} />);
    expect(container.querySelector('[data-testid="cost-quality-elasticity-panel"]')).not.toBeNull();
    const headline = container.querySelector('[data-testid="cost-quality-elasticity-value"]')?.textContent ?? '';
    expect(headline).toContain((2 / 3).toFixed(2));
    const row1 = container.querySelector('[data-testid="cost-quality-elasticity-row-10"]');
    expect(row1?.textContent).toContain('$2.000');
    expect(row1?.textContent).toContain('100%');
    expect(row1?.textContent).toContain((1.5).toFixed(2));
    const row2 = container.querySelector('[data-testid="cost-quality-elasticity-row-11"]');
    expect(row2?.textContent).toContain('$2.400');
    expect(row2?.textContent).toContain((2 / 3).toFixed(2));
    expect(container.querySelector('[data-testid="cost-quality-elasticity-direction"]')?.textContent).toBe('弱含み');
    // コスト変化率0でelasticity=nullの行はNaN/Infinityではなく「算出不可」
    const nullCosts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const nullApproved = [false, false, false, true, true, true, true, true, true, true];
    const nullRun = render(<CostQualityElasticityTrendPanel runs={makeElasticityRuns(nullCosts, nullApproved)} />);
    const row = nullRun.container.querySelector('[data-testid="cost-quality-elasticity-row-10"]');
    expect(row?.textContent).toContain('算出不可');
    expect(row?.textContent).not.toContain('NaN');
    expect(row?.textContent).not.toContain('Infinity');
  });
});
