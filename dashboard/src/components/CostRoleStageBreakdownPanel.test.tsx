import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CostRoleStageBreakdownPanel } from './CostRoleStageBreakdownPanel';
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
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('CostRoleStageBreakdownPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<CostRoleStageBreakdownPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="cost-role-stage-breakdown-panel"]')).toBeNull();
  });

  it('複数役割×複数stageのマトリクスを正しいセル・行合計・列合計で描画する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'merged',
        cost: { builderUsd: 0.5, adversaryUsd: 0.2, ideationUsd: 0.1, totalUsd: 0.8 },
      }),
      makeRun({
        iteration: 2,
        verdict: 'failed',
        cost: { builderUsd: 0.1, adversaryUsd: 0.05, ideationUsd: 0.05, totalUsd: 0.2 },
      }),
    ];
    const { container } = render(<CostRoleStageBreakdownPanel runs={runs} />);

    expect(container.querySelector('[data-testid="cost-role-stage-breakdown-panel"]')).not.toBeNull();

    // 全体合計は 0.8+0.2=1.0。merged x builder = 0.5 (50.0%)
    const mergedBuilder = container.querySelector('[data-testid="cost-role-stage-cell-builder-merged"]');
    expect(mergedBuilder?.textContent).toContain('$0.50');
    expect(mergedBuilder?.textContent).toContain('50.0%');

    // failed x adversary = 0.05 (5.0%)
    const failedAdversary = container.querySelector('[data-testid="cost-role-stage-cell-adversary-failed"]');
    expect(failedAdversary?.textContent).toContain('$0.05');
    expect(failedAdversary?.textContent).toContain('5.0%');

    // 出現しなかった verdict（paused等）の列は描画されない
    expect(container.querySelector('[data-testid="cost-role-stage-cell-builder-paused"]')).toBeNull();

    // 行合計: builder = 0.5 + 0.1 = 0.6 (60.0%)
    const builderTotal = container.querySelector('[data-testid="cost-role-stage-role-total-builder"]');
    expect(builderTotal?.textContent).toContain('$0.60');
    expect(builderTotal?.textContent).toContain('60.0%');

    // 列合計: merged = 0.8 (80.0%)
    const mergedTotal = container.querySelector('[data-testid="cost-role-stage-stage-total-merged"]');
    expect(mergedTotal?.textContent).toContain('$0.80');
    expect(mergedTotal?.textContent).toContain('80.0%');
  });

  it('単一stage(plannerUsd欠損の旧レコード)では、その stage の列だけを描画し、planner 行は $0.00 (0.0%) になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        verdict: 'paused',
        cost: { builderUsd: 0.3, adversaryUsd: 0.1, ideationUsd: 0.1, totalUsd: 0.5 },
      }),
    ];
    const { container } = render(<CostRoleStageBreakdownPanel runs={runs} />);

    expect(container.querySelector('[data-testid="cost-role-stage-cell-builder-paused"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="cost-role-stage-cell-builder-merged"]')).toBeNull();
    expect(container.querySelector('[data-testid="cost-role-stage-cell-builder-failed"]')).toBeNull();

    const plannerCell = container.querySelector('[data-testid="cost-role-stage-cell-planner-paused"]');
    expect(plannerCell?.textContent).toContain('$0.00');
    expect(plannerCell?.textContent).toContain('0.0%');
    const plannerTotal = container.querySelector('[data-testid="cost-role-stage-role-total-planner"]');
    expect(plannerTotal?.textContent).toContain('$0.00');
  });
});
