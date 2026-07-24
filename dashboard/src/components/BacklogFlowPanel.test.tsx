import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BacklogFlowPanel } from './BacklogFlowPanel';
import { IDEATION_LOW_WATER } from '@/lib/aggregate';
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

describe('BacklogFlowPanel', () => {
  it('run が0件なら「データなし」を表示し、パネル本体とsvgを描画しない', () => {
    const { container } = render(<BacklogFlowPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="backlog-flow-panel"]')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('補充0件の反復1件は純減(net=-1)となり、rose色のバーがゼロ線から下に伸びる', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [] })];
    const { container } = render(<BacklogFlowPanel runs={runs} />);

    const bar = container.querySelector('[data-testid="backlog-flow-bar-1"]')!;
    expect(bar).toHaveClass('fill-rose-400');
    const zeroLine = container.querySelector('[data-testid="backlog-flow-zero-line"]')!;
    const zeroY = Number(zeroLine.getAttribute('y1'));
    expect(Number(bar.getAttribute('y'))).toBeCloseTo(zeroY, 5);
    expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('補充3件の反復1件は純増(net=+2)となり、emerald色のバーがゼロ線から上に伸びる', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [101, 102, 103] })];
    const { container } = render(<BacklogFlowPanel runs={runs} />);

    const bar = container.querySelector('[data-testid="backlog-flow-bar-1"]')!;
    expect(bar).toHaveClass('fill-emerald-400');
    const zeroLine = container.querySelector('[data-testid="backlog-flow-zero-line"]')!;
    const zeroY = Number(zeroLine.getAttribute('y1'));
    const barY = Number(bar.getAttribute('y'));
    const barHeight = Number(bar.getAttribute('height'));
    expect(barHeight).toBeGreaterThan(0);
    // 上に伸びる = 上端(y)がゼロ線より上、下端(y+height)がゼロ線と一致
    expect(barY).toBeLessThan(zeroY);
    expect(barY + barHeight).toBeCloseTo(zeroY, 5);
  });

  it('net=0（補充1件=消費1件と相殺）の反復はバーの高さが0になる境界値', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [101] })];
    const { container } = render(<BacklogFlowPanel runs={runs} />);
    const bar = container.querySelector('[data-testid="backlog-flow-bar-1"]')!;
    expect(Number(bar.getAttribute('height'))).toBeCloseTo(0, 5);
  });

  it('複数反復の合計inflow/outflow/純増減と最新残量を集計して表示する', () => {
    const runs = [
      makeRun({ iteration: 1, nextIssues: [101, 102] }), // inflow2 outflow1 net+1
      makeRun({ iteration: 2, nextIssues: [] }), // inflow0 outflow1 net-1
      makeRun({ iteration: 3, nextIssues: [301] }), // inflow1 outflow1 net0
    ];
    const { container } = render(<BacklogFlowPanel runs={runs} />);

    expect(container.querySelector('[data-testid="backlog-flow-total-inflow"]')?.textContent).toBe('3');
    expect(container.querySelector('[data-testid="backlog-flow-total-outflow"]')?.textContent).toBe('3');
    expect(container.querySelector('[data-testid="backlog-flow-total-net"]')?.textContent).toBe('0');
    expect(container.querySelector('[data-testid="backlog-flow-balance"]')?.textContent).toBe(
      String(IDEATION_LOW_WATER),
    );
    expect(container.querySelector('[data-testid="backlog-flow-iterations"]')?.textContent).toContain(
      '対象iteration: 1, 2, 3',
    );
  });

  it('純増合計は符号付き(+N)で表示する', () => {
    const runs = [makeRun({ iteration: 1, nextIssues: [101, 102] })]; // net +1
    const { container } = render(<BacklogFlowPanel runs={runs} />);
    expect(container.querySelector('[data-testid="backlog-flow-total-net"]')?.textContent).toBe('+1');
  });

  it('2本のバーの高さの比が abs(net) の比と一致する（値の大小関係が正しく反映される）', () => {
    const runs = [
      makeRun({ iteration: 1, nextIssues: [101] }), // net 0
      makeRun({ iteration: 2, nextIssues: [201, 202, 203, 204] }), // net +3
    ];
    const { container } = render(<BacklogFlowPanel runs={runs} />);
    const bar1 = container.querySelector('[data-testid="backlog-flow-bar-1"]')!;
    const bar2 = container.querySelector('[data-testid="backlog-flow-bar-2"]')!;
    expect(Number(bar1.getAttribute('height'))).toBeCloseTo(0, 5);
    expect(Number(bar2.getAttribute('height'))).toBeGreaterThan(0);
  });
});
