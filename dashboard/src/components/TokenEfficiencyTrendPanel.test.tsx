import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenEfficiencyTrendPanel } from './TokenEfficiencyTrendPanel';
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

/** iteration 1..totalUsds.length の反復を、totalUsd/changedLines/verdictの配列から生成する。 */
function makeEfficiencyRuns(
  totalUsds: number[],
  changedLines: number[] = totalUsds.map(() => 100),
  verdicts: RunRecord['verdict'][] = [],
): RunRecord[] {
  return totalUsds.map((totalUsd, i) =>
    makeRun({
      iteration: i + 1,
      changedLines: changedLines[i],
      verdict: verdicts[i] ?? 'merged',
      cost: { builderUsd: totalUsd, adversaryUsd: 0, ideationUsd: 0, totalUsd },
    }),
  );
}

describe('TokenEfficiencyTrendPanel', () => {
  it('runが0件なら「データなし」を表示し、パネル本体を描画しない', () => {
    const { container } = render(<TokenEfficiencyTrendPanel runs={[]} />);
    expect(screen.getByText('データなし')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="token-efficiency-trend-panel"]')).toBeNull();
  });

  it('単一runでは見出し値・明細行は表示され、direction(比較対象なし)は出ない', () => {
    const { container } = render(<TokenEfficiencyTrendPanel runs={makeEfficiencyRuns([1])} />);
    expect(container.querySelector('[data-testid="token-efficiency-trend-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="token-efficiency-trend-value"]')?.textContent).toContain(
      (1 / 100).toFixed(4),
    );
    expect(container.querySelector('[data-testid="token-efficiency-trend-direction"]')).toBeNull();
    const row = container.querySelector('[data-testid="token-efficiency-trend-row-1"]');
    expect(row?.textContent).toContain('$1.000');
    expect(row?.textContent).toContain((1 / 100).toFixed(4));
  });

  it('複数runで悪化(degrading)/改善(improving)トレンドをdirection・明細行に正しく表示する', () => {
    const degrading = render(<TokenEfficiencyTrendPanel runs={makeEfficiencyRuns([1, 1, 1, 4, 4, 4])} />);
    expect(degrading.container.querySelector('[data-testid="token-efficiency-trend-direction"]')?.textContent).toBe(
      '悪化傾向',
    );
    const latestRow = degrading.container.querySelector('[data-testid="token-efficiency-trend-row-6"]');
    expect(latestRow?.textContent).toContain('$4.000');
    expect(latestRow?.textContent).toContain((4 / 100).toFixed(4));
    expect(degrading.container.querySelectorAll('[data-testid^="token-efficiency-trend-bar-"]').length).toBe(6);

    const improving = render(<TokenEfficiencyTrendPanel runs={makeEfficiencyRuns([4, 4, 4, 1, 1, 1])} />);
    expect(improving.container.querySelector('[data-testid="token-efficiency-trend-direction"]')?.textContent).toBe(
      '改善傾向',
    );
  });

  it('verifyに到達しなかったfailed run（changedLines=0）は除外して表示し、NaN/Infinityを出さない', () => {
    const runs = makeEfficiencyRuns([1, 5], [50, 0], ['merged', 'failed']);
    const { container } = render(<TokenEfficiencyTrendPanel runs={runs} />);
    expect(container.querySelector('[data-testid="token-efficiency-trend-row-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="token-efficiency-trend-row-1"]')).not.toBeNull();
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });
});
