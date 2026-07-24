import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlannerActivityPanel } from './PlannerActivityPanel';
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

describe('PlannerActivityPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<PlannerActivityPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="planner-activity-panel"]')).toBeNull();
  });

  it('全反復で plannerUsd が未記録（旧レコードのみ）なら「データなし」を表示する', () => {
    const runs = [
      makeRun({ iteration: 1, cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 } }),
      makeRun({ iteration: 2, cost: { builderUsd: 0.2, adversaryUsd: 0.02, ideationUsd: 0.02, totalUsd: 0.24 } }),
    ];
    const { container } = render(<PlannerActivityPanel runs={runs} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="planner-activity-panel"]')).toBeNull();
  });

  it('稼働率・平均コスト・コスト構成比・トレンドバーを実データから正確な値で表示する', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, plannerUsd: 0, totalUsd: 0.12 },
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, plannerUsd: 0.3, totalUsd: 0.42 },
      }),
      makeRun({
        iteration: 3,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, plannerUsd: 0.1, totalUsd: 0.22 },
      }),
      // plannerUsd 未記録の反復は計測対象外（バーが増えない）
      makeRun({ iteration: 4, cost: { builderUsd: 0.5, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.5 } }),
    ];
    const { container } = render(<PlannerActivityPanel runs={runs} />);

    // 稼働率 = 2/3 * 100 = 66.7%
    expect(container.querySelector('[data-testid="planner-activity-rate"]')?.textContent).toBe('66.7%');
    // 平均コスト = (0.3+0.1)/2 = 0.20
    expect(container.querySelector('[data-testid="planner-activity-avg-cost"]')?.textContent).toBe('$0.20');
    // コスト構成比 = 0.4 / 0.76 * 100 ≈ 52.6%
    expect(container.querySelector('[data-testid="planner-activity-cost-share"]')?.textContent).toBe('52.6%');
    expect(container.querySelector('[data-testid="planner-activity-count"]')?.textContent).toBe(
      '計測対象 3反復中 2反復が稼働',
    );

    // トレンドバーは計測対象の3件のみ（未記録の iteration 4 は含まれない）
    const bars = container.querySelectorAll('[data-testid^="planner-activity-bar-"]');
    expect(bars).toHaveLength(3);
    expect(container.querySelector('[data-testid="planner-activity-bar-4"]')).toBeNull();

    // アクティブ(iteration 2,3)は着色クラス、非アクティブ(iteration 1)は薄色クラスで描画される
    const bar1 = container.querySelector('[data-testid="planner-activity-bar-1"]') as HTMLElement;
    const bar2 = container.querySelector('[data-testid="planner-activity-bar-2"]') as HTMLElement;
    const bar3 = container.querySelector('[data-testid="planner-activity-bar-3"]') as HTMLElement;
    expect(bar1.className).toContain('bg-white/15');
    expect(bar1.className).not.toContain('bg-sky-400');
    expect(bar2.className).toContain('bg-sky-400');
    expect(bar3.className).toContain('bg-sky-400');

    // 大きいコスト(iteration2=0.3)のバーが最大なので100%、iteration3(0.1)は最大比で低くなる
    expect(parseFloat(bar2.style.height)).toBeCloseTo(100, 2);
    expect(parseFloat(bar3.style.height)).toBeLessThan(parseFloat(bar2.style.height));
  });

  it('plannerUsd が記録されているが全て0（機能未使用期間）なら稼働率0%・平均コストは—表示', () => {
    const runs = [
      makeRun({
        iteration: 1,
        cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, plannerUsd: 0, totalUsd: 0.12 },
      }),
      makeRun({
        iteration: 2,
        cost: { builderUsd: 0.2, adversaryUsd: 0.02, ideationUsd: 0.02, plannerUsd: 0, totalUsd: 0.24 },
      }),
    ];
    const { container } = render(<PlannerActivityPanel runs={runs} />);
    expect(container.querySelector('[data-testid="planner-activity-rate"]')?.textContent).toBe('0.0%');
    expect(container.querySelector('[data-testid="planner-activity-avg-cost"]')?.textContent).toBe('—');

    const bars = container.querySelectorAll('[data-testid^="planner-activity-bar-"]');
    expect(bars).toHaveLength(2);
    bars.forEach((bar) => {
      expect((bar as HTMLElement).className).toContain('bg-white/15');
    });
  });
});
