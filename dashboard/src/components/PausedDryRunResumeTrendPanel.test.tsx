import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PausedDryRunResumeTrendPanel } from './PausedDryRunResumeTrendPanel';
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

describe('PausedDryRunResumeTrendPanel', () => {
  it('runが0件、またはpaused/dry-runが1件も無ければ「データなし」を表示し、パネル本体を描画しない', () => {
    const first = render(<PausedDryRunResumeTrendPanel runs={[]} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    first.unmount();

    const runs = [makeRun({ iteration: 1, verdict: 'merged' }), makeRun({ iteration: 2, verdict: 'failed' })];
    const { container } = render(<PausedDryRunResumeTrendPanel runs={runs} />);
    expect(screen.getByText(/データなし/)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="paused-dryrun-resume-trend-panel"]')).toBeNull();
  });

  it('paused/dry-runはあるが1件も再開されていない場合、件数サマリーは出すが折れ線は出さない', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', issue: { number: 1, title: 'a', labels: [] } }),
      makeRun({ iteration: 3, verdict: 'dry-run', issue: { number: 2, title: 'b', labels: [] } }),
    ];
    const { container } = render(<PausedDryRunResumeTrendPanel runs={runs} />);
    expect(container.querySelector('[data-testid="paused-dryrun-resume-trend-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="paused-dryrun-resume-summary"]')?.textContent).toBe(
      '2件中0件再開・成功0件',
    );
    expect(container.querySelector('[data-testid="paused-dryrun-resume-no-trend"]')?.textContent).toContain(
      '未再開2件',
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('複数回再実行され最終的にmergedへ至った反復も再開成功に含めて成功率・折れ線を描画する', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'paused', issue: { number: 1, title: 'a', labels: [] } }),
      makeRun({ iteration: 2, verdict: 'abandoned', issue: { number: 1, title: 'a', labels: [] } }),
      makeRun({ iteration: 3, verdict: 'merged', issue: { number: 1, title: 'a', labels: [] } }),
    ];
    const { container } = render(<PausedDryRunResumeTrendPanel runs={runs} />);
    expect(container.querySelector('[data-testid="paused-dryrun-resume-summary"]')?.textContent).toBe(
      '1件中1件再開・成功1件',
    );
    expect(container.querySelector('[data-testid="paused-dryrun-resume-rate"]')?.textContent).toBe('100.0%');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('再開が1件だけの場合でも折れ線をcircleで補って描画する（境界値）', () => {
    const runs = [
      makeRun({ iteration: 1, verdict: 'dry-run', issue: { number: 7, title: 'y', labels: [] } }),
      makeRun({ iteration: 4, verdict: 'abandoned', issue: { number: 7, title: 'y', labels: [] } }),
    ];
    const { container } = render(<PausedDryRunResumeTrendPanel runs={runs} />);
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('[data-testid="paused-dryrun-resume-rate"]')?.textContent).toBe('0.0%');
  });
});
