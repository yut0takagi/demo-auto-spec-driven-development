import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ModelCostRoleBiasPanel } from './ModelCostRoleBiasPanel';
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

describe('ModelCostRoleBiasPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<ModelCostRoleBiasPanel runs={[]} />);
    expect(container.textContent).toContain('データなし');
    expect(container.querySelector('[data-testid="model-cost-role-bias-panel"]')).toBeNull();
  });

  it('high/moderate/none 各levelのバッジを正しいテストIDとテキストで描画する', () => {
    const runs = [
      // shared-high: builder 3, adversary 0.05 → ratio 60 → high
      makeRun({
        iteration: 1,
        cost: { builderUsd: 3, adversaryUsd: 0.05, ideationUsd: 0, totalUsd: 3.05 },
        models: { builder: 'shared-high', adversary: 'other-a', ideation: 'x' },
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 3, adversaryUsd: 0.05, ideationUsd: 0, totalUsd: 3.05 },
        models: { builder: 'other-a', adversary: 'shared-high', ideation: 'x' },
      }),
      // shared-moderate: builder 1.3, adversary 1 → ratio 1.3 → moderate
      makeRun({
        iteration: 3,
        cost: { builderUsd: 1.3, adversaryUsd: 1, ideationUsd: 0, totalUsd: 2.3 },
        models: { builder: 'shared-moderate', adversary: 'other-b', ideation: 'x' },
      }),
      makeRun({
        iteration: 4,
        cost: { builderUsd: 1.3, adversaryUsd: 1, ideationUsd: 0, totalUsd: 2.3 },
        models: { builder: 'other-b', adversary: 'shared-moderate', ideation: 'x' },
      }),
      // shared-none: builder 1, adversary 0.95 → ratio ~1.05 → none
      makeRun({
        iteration: 5,
        cost: { builderUsd: 1, adversaryUsd: 0.95, ideationUsd: 0, totalUsd: 1.95 },
        models: { builder: 'shared-none', adversary: 'other-c', ideation: 'x' },
      }),
      makeRun({
        iteration: 6,
        cost: { builderUsd: 1, adversaryUsd: 0.95, ideationUsd: 0, totalUsd: 1.95 },
        models: { builder: 'other-c', adversary: 'shared-none', ideation: 'x' },
      }),
    ];

    const { container } = render(<ModelCostRoleBiasPanel runs={runs} />);

    const high = container.querySelector('[data-testid="cost-role-bias-level-shared-high"]');
    expect(high?.textContent).toBe('高偏差');

    const moderate = container.querySelector('[data-testid="cost-role-bias-level-shared-moderate"]');
    expect(moderate?.textContent).toBe('中偏差');

    const none = container.querySelector('[data-testid="cost-role-bias-level-shared-none"]');
    expect(none?.textContent).toBe('偏差なし');
  });

  it('片方の役割でしか使われていないモデルは「比較不可」相当の表示になる', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 5, adversaryUsd: 0.1, ideationUsd: 0, totalUsd: 5.1 },
        models: { builder: 'builder-only', adversary: 'adversary-only', ideation: 'x' },
      }),
    ];
    const { container } = render(<ModelCostRoleBiasPanel runs={runs} />);

    const builderOnlyStats = container.querySelector('[data-testid="cost-role-bias-stats-builder-only"]');
    expect(builderOnlyStats?.textContent).toBe('比較不可（片方の役割のみで使用）');

    const adversaryOnlyStats = container.querySelector('[data-testid="cost-role-bias-stats-adversary-only"]');
    expect(adversaryOnlyStats?.textContent).toBe('比較不可（片方の役割のみで使用）');

    const builderOnlyLevel = container.querySelector('[data-testid="cost-role-bias-level-builder-only"]');
    expect(builderOnlyLevel?.textContent).toBe('偏差なし');
  });
});
